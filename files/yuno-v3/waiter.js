// YUNO waiter screen: take orders at the table, follow them through the kitchen, and collect payment.
// A waiter login can only do this. It can't edit the menu, see sales history, give discounts or void bills.
import {
  db, auth, doc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, onSnapshot,
  Timestamp, serverTimestamp, runTransaction, increment,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from './fb.js';
import {
  $, esc, rupee, money2, shortCode, toMs, ago, ls, toast, unlockAudio, chime, audioReady,
  cleanCafe, BRAND_SVG, iconFor, bizDay, bizStart, payAmount, fmtTime, loginError, normPhone, phoneShow, waLink, billMessage
} from './common.js';

const params = new URLSearchParams(location.search);
const PAY = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];
const STATUS_CHIP = { new: 'Waiting', preparing: 'In kitchen', ready: 'Ready', served: 'Served' };
const REJECT_SHOW_MS = 30 * 60000; // how long a rejected order stays on screen
const MAX_LINES = 30;
const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 9.3-5M18 8c0 7 3 8 3 8H9M10.3 21a1.9 1.9 0 0 0 3.4 0M3 3l18 18"/></svg>'
};

const S = {
  phase: 'auth', user: null, cafeId: '', cafe: null, waiterName: '',
  orders: [], calls: [],
  table: 0, drafts: {}, posCat: 'all', posSearch: '', cartOpen: false,
  phones: {}, wa: null,
  pending: {}, sending: false, payBusy: false, arm: null, dismissed: new Set(),
  soundOn: ls.get('yumotap:wsound', true), loginErr: '', loginBusy: false
};

/* ---------- Helpers ---------- */
const today = () => bizDay(S.cafe ? S.cafe.settings.dayEndHour : 3);
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const itemCount = (o) => o.items.reduce((s, i) => s + i.qty, 0);
const orderTotal = (o) => o.items.reduce((s, i) => s + i.qty * i.price, 0);
const snapData = (d) => { try { return d.data({ serverTimestamps: 'estimate' }); } catch (e) { return d.data(); } };
const cafeRef = () => doc(db, 'cafes', S.cafeId);
const orderRef = (id) => doc(db, 'cafes', S.cafeId, 'orders', id);
const dayRef = (k) => doc(db, 'cafes', S.cafeId, 'days', k);
const itemKey = (n) => String(n || 'Item').replace(/[.[\]*`~/]/g, ' ').trim().slice(0, 60) || 'Item';
function menuById() { const m = {}; (S.cafe ? S.cafe.menu : []).forEach(i => { m[i.id] = i; }); return m; }
function minsLeft(o) { if (!o.acceptedAt) return null; return Math.round((o.acceptedAt + (o.prepMins || 0) * 60000 - Date.now()) / 60000); }

// Same reading rules as the counter, so a bill made here matches what the counter would make.
function normOrder(id, d) {
  d = d || {};
  const byId = menuById();
  const items = Array.isArray(d.items) ? d.items.filter(x => x && typeof x === 'object').map(x => {
    const mid = String(x.id || '');
    const price = d.source === 'staff' ? Math.max(0, Number(x.price) || 0) : (byId[mid] ? byId[mid].price : Math.max(0, Number(x.price) || 0));
    return { id: mid, name: String(x.name || 'Item').slice(0, 60), qty: Math.max(1, Math.min(99, parseInt(x.qty, 10) || 1)), price };
  }).slice(0, 60) : [];
  return {
    id, items, type: ['parcel', 'counter'].includes(d.type) ? d.type : 'table', table: parseInt(d.table, 10) || 0,
    note: typeof d.note === 'string' ? d.note.slice(0, 200) : '',
    status: ['new', 'preparing', 'ready', 'served', 'rejected', 'cancelled'].includes(d.status) ? d.status : 'new',
    createdAt: toMs(d.createdAt), acceptedAt: d.acceptedAt ? toMs(d.acceptedAt) : 0, prepMins: Math.max(0, parseInt(d.prepMins, 10) || 0),
    billId: typeof d.billId === 'string' ? d.billId : '',
    cancelReason: typeof d.cancelReason === 'string' ? d.cancelReason.slice(0, 120) : '',
    source: d.source === 'staff' ? 'staff' : d.source === 'waiter' ? 'waiter' : 'customer',
    waiterUid: typeof d.waiterUid === 'string' ? d.waiterUid : '', waiterName: typeof d.waiterName === 'string' ? d.waiterName.slice(0, 40) : '',
    updatedAt: d.updatedAt ? toMs(d.updatedAt) : 0
  };
}
// Waiters work with table orders only. Parcel and counter sales stay at the counter.
const tableOrders = (n) => S.orders.filter(o => o.type === 'table' && o.table === n);
const openOrders = (n) => tableOrders(n).filter(o => !o.billId && ['new', 'preparing', 'ready', 'served'].includes(o.status));
const billable = (n) => openOrders(n).filter(o => o.status !== 'new');
const rejectedRecent = (n) => S.orders.filter(o => o.status === 'rejected' && o.type === 'table' && (!n || o.table === n) &&
  !S.dismissed.has(o.id) && Date.now() - (o.updatedAt || o.createdAt) < REJECT_SHOW_MS);

function billCalc(os) {
  const map = new Map();
  os.forEach(o => o.items.forEach(i => { const k = i.id + '|' + i.price; const x = map.get(k) || { id: i.id, name: i.name, price: i.price, qty: 0 }; x.qty += i.qty; map.set(k, x); }));
  const lines = [...map.values()];
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const gstPct = S.cafe ? S.cafe.settings.gstPct : 0;
  const gst = Math.round(subtotal * gstPct) / 100, raw = subtotal + gst, total = Math.round(raw);
  return { lines, subtotal, discount: 0, gstPct, gst, roundOff: Math.round((total - raw) * 100) / 100, total };
}
// A table that has had its food but not paid after the cafe's set minutes.
function unpaidInfo(n) {
  const lim = S.cafe.settings.unpaidMins;
  if (!lim) return null;
  const os = billable(n);
  if (!os.length || os.some(o => o.status === 'preparing')) return null;
  const last = Math.max(...os.map(o => o.updatedAt || o.createdAt)), mins = Math.floor((Date.now() - last) / 60000);
  return mins < lim ? null : { mins };
}
function withFocus(fn) {
  const a = document.activeElement;
  const f = (a && a.dataset && a.dataset.key) ? { key: a.dataset.key, s: a.selectionStart, e: a.selectionEnd } : null;
  fn();
  if (!f) return;
  const el = document.querySelector('[data-key="' + CSS.escape(f.key) + '"]');
  if (el && el !== document.activeElement) {
    el.focus({ preventScroll: true });
    if (f.s != null && el.setSelectionRange) { try { el.setSelectionRange(f.s, f.e); } catch (e) {} }
  }
}
// Two-tap safety for actions that can't be undone (taking payment, cancelling an order).
let armTimer = 0;
function armed(key) { return !!S.arm && S.arm.key === key && Date.now() - S.arm.t < 4000; }
function arm(key) { S.arm = { key, t: Date.now() }; clearTimeout(armTimer); armTimer = setTimeout(() => { S.arm = null; render(); }, 4000); render(); }
function disarm() { S.arm = null; clearTimeout(armTimer); }

/* ---------- Live data ---------- */
let subs = [], orderSub = null, subsDay = '';
function stopOrders() { if (orderSub) { try { orderSub(); } catch (e) {} orderSub = null; } }
function stopSubs() { subs.forEach(u => { try { u(); } catch (e) {} }); subs = []; stopOrders(); subsDay = ''; }
function denied() { stopSubs(); S.phase = 'denied'; render(); }

// Orders for the current sales day. The day ends at the cafe's closing hour, not midnight.
function subscribeOrders() {
  stopOrders();
  const h = S.cafe.settings.dayEndHour;
  subsDay = bizDay(h);
  const start = bizStart(subsDay, h);
  let first = true; const prev = new Map();
  orderSub = onSnapshot(query(collection(db, 'cafes', S.cafeId, 'orders'), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'asc')), snap => {
    const list = snap.docs.map(d => normOrder(d.id, snapData(d)));
    if (!first) {
      let ping = false;
      list.forEach(o => {
        const was = prev.get(o.id);
        const t = 'Table ' + o.table;
        if (o.type !== 'table') return;
        if (was === 'preparing' && o.status === 'ready') { toast(t + ': order is ready to serve.'); ping = true; }
        if (was === 'new' && o.status === 'preparing') toast(t + ': order accepted. It\u2019s in the kitchen.');
        if (was === 'new' && o.status === 'rejected') { toast(t + ': order rejected' + (o.cancelReason ? ' (' + o.cancelReason + ')' : '') + '.'); ping = true; }
        if ((was === 'preparing' || was === 'ready') && o.status === 'cancelled') { toast(t + ': the counter cancelled an order.'); ping = true; }
      });
      if (ping && S.soundOn) chime();
    }
    prev.clear(); list.forEach(o => prev.set(o.id, o.status)); first = false;
    S.orders = list; render();
  }, err => { if (err && err.code === 'permission-denied') denied(); else toast('Lost connection. Refresh the page if this stays.'); });
}
function startCafe() {
  let firstCalls = true; const seen = new Set();
  subs.push(onSnapshot(cafeRef(), snap => {
    if (!snap.exists()) { stopSubs(); S.phase = 'nocafe'; render(); return; }
    S.cafe = cleanCafe(snap.data());
    if (S.phase !== 'ready') { S.phase = 'ready'; keepAwake(); subscribeOrders(); }
    document.title = S.cafe.name + ' | Waiter | YUNO';
    render();
  }, () => denied()));
  subs.push(onSnapshot(collection(db, 'cafes', S.cafeId, 'calls'), snap => {
    const list = snap.docs.map(d => { const x = snapData(d) || {}; return { id: d.id, table: parseInt(x.table, 10) || 0, createdAt: toMs(x.createdAt) }; });
    if (!firstCalls && S.soundOn && list.some(c => !seen.has(c.id))) chime();
    list.forEach(c => seen.add(c.id)); firstCalls = false;
    S.calls = list.sort((a, b) => a.createdAt - b.createdAt); render();
  }, err => { if (err && err.code === 'permission-denied') denied(); }));
}
// When the sales day rolls over, start a fresh day. Also refreshes the "5 min" labels.
setInterval(() => {
  if (S.phase !== 'ready') return;
  if (bizDay(S.cafe.settings.dayEndHour) !== subsDay) subscribeOrders();
  render();
}, 30000);
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.phase === 'ready') keepAwake(); });

onAuthStateChanged(auth, async user => {
  stopSubs();
  S.user = user; S.cafe = null; S.orders = []; S.calls = []; S.table = 0; S.waiterName = ''; disarm();
  if (!user) { S.phase = 'login'; render(); return; }
  S.phase = 'loading'; render();
  let cafeId = (params.get('cafe') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  try {
    const snap = await getDoc(doc(db, 'waiterIndex', user.uid));
    const list = snap.exists() && Array.isArray(snap.data().cafes) ? snap.data().cafes.filter(x => typeof x === 'string') : [];
    const last = ls.get('yumotap:wlastCafe', '');
    if (!cafeId) cafeId = last && list.includes(last) ? last : (list[0] || '');
  } catch (e) { /* no link found */ }
  if (!cafeId) { S.phase = 'nocafe'; render(); return; }
  S.cafeId = cafeId; ls.set('yumotap:wlastCafe', cafeId);
  try { const w = await getDoc(doc(db, 'cafes', cafeId, 'waiters', user.uid)); if (w.exists()) S.waiterName = String(w.data().name || '').slice(0, 40); } catch (e) {}
  if (!S.waiterName) S.waiterName = String(user.email || 'Waiter').split('@')[0].slice(0, 40);
  startCafe();
});

/* ---------- Top bar, login, notes ---------- */
function renderChrome() {
  const ready = S.phase === 'ready';
  $('#topbar').hidden = !ready;
  if (!ready) return;
  $('#top-cafe').innerHTML = (S.cafe.brand.logo ? '<img class="top-logo" src="' + S.cafe.brand.logo + '" alt="">' : '') + esc(S.cafe.name);
  $('#top-tools').innerHTML = '<span class="muted" style="font-size:14px;font-weight:600">' + esc(S.waiterName) + '</span>' +
    '<button type="button" class="icon-btn' + (S.soundOn ? '' : ' off') + '" data-action="sound" aria-pressed="' + S.soundOn + '" aria-label="' + (S.soundOn ? 'Sound on. Tap to mute' : 'Sound off. Tap to turn on') + '">' + (S.soundOn ? ICONS.bell : ICONS.mute) + '</button>' +
    '<button type="button" class="btn-ghost" data-action="signout">Sign out</button>';
}
function loginView() {
  return '<div class="login"><div class="brand">' + BRAND_SVG + 'YUNO</div><h1>Waiter login</h1><p class="lead">Sign in to take orders and collect payment.</p>' +
    '<form id="login-form" novalidate><label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username"></label>' +
    '<label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password"></label>' +
    (S.loginErr ? '<p class="err" role="alert">' + esc(S.loginErr) + '</p>' : '') +
    '<button class="btn-primary" type="submit"' + (S.loginBusy ? ' disabled' : '') + '>' + (S.loginBusy ? 'Signing in\u2026' : 'Sign in') + '</button>' +
    '<p class="fine"><button type="button" class="linkbtn" data-action="forgot">Forgot password?</button></p></form></div>';
}
function noteView(title, text) {
  return '<div class="center-note panel"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p style="margin-top:16px"><button class="btn-ghost" data-action="signout">Sign out</button></p></div>';
}

/* ---------- Tables (home) ---------- */
function attentionPanel() {
  const rows = [];
  S.calls.forEach(c => rows.push('<li class="req call-row"><div class="req-main"><b>Table ' + c.table + '</b><span>Calling a waiter, ' + ago(c.createdAt) + '</span></div>' +
    '<div class="req-act"><button type="button" class="btn-ghost" data-action="call-done" data-id="' + esc(c.id) + '">Done</button></div></li>'));
  S.orders.filter(o => o.type === 'table' && o.status === 'ready' && !o.billId).forEach(o => rows.push('<li class="req"><div class="req-main"><b>Table ' + o.table + '</b><span>Ready to serve</span>' +
    '<span class="muted">' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '</span></div>' +
    '<div class="req-act"><button type="button" class="b-accept" data-action="served" data-id="' + esc(o.id) + '"' + (S.pending[o.id] ? ' disabled' : '') + '>Served</button></div></li>'));
  rejectedRecent().forEach(o => rows.push('<li class="req unpaid-row"><div class="req-main"><b>Table ' + o.table + ': order rejected</b><span>' + (o.cancelReason ? esc(o.cancelReason) + '. ' : '') + 'Tell the customer.</span>' +
    '<span class="muted">' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '</span></div>' +
    '<div class="req-act"><button type="button" class="btn-ghost" data-action="dismiss" data-id="' + esc(o.id) + '">OK</button></div></li>'));
  if (!rows.length) return '';
  return '<section class="req-panel" aria-live="polite"><h2>Needs attention <span class="count">' + rows.length + '</span></h2><ul>' + rows.join('') + '</ul></section>';
}
function tileState(n) {
  const os = openOrders(n), calling = S.calls.some(c => c.table === n), waitingOrder = os.some(o => o.status === 'new');
  let state = 'free';
  if (waitingOrder || calling) state = 'new';
  else if (os.some(o => o.status === 'ready')) state = 'ready';
  else if (os.length) state = 'run';
  const amount = billable(n).reduce((s, o) => s + orderTotal(o), 0);
  const since = os.length ? Math.min(...os.map(o => o.createdAt)) : 0;
  const label = state === 'new' ? (waitingOrder ? 'Waiting' : 'Calling') : state === 'ready' ? 'Ready' : state === 'run' ? ago(since).replace(' ago', '') : 'Free';
  if (state !== 'new') { const u = unpaidInfo(n); if (u) return { state: 'unpaid', amount, label: 'Not paid, ' + u.mins + ' min' }; }
  return { state, amount, label };
}
function tablesView() {
  let tiles = '';
  for (let n = 1; n <= S.cafe.tables; n++) {
    const t = tileState(n);
    tiles += '<button type="button" class="ttile t-' + t.state + '" data-action="open-table" data-t="' + n + '" aria-label="Table ' + n + ', ' + esc(t.label) + (t.amount ? ', ' + rupee(t.amount) : '') + '">' +
      '<span class="tile-num">' + n + '</span><span class="tile-amt">' + (t.amount ? rupee(t.amount) : '') + '</span><span class="tile-tag">' + esc(t.label) + '</span></button>';
  }
  return '<div class="wrap page">' + waBanner() + (S.soundOn && !audioReady() ? '<button type="button" class="sound-banner" data-action="unlock">Tap here to turn on alerts for ready food and table calls</button>' : '') +
    attentionPanel() +
    '<section><div class="sec-head"><h2>Tables</h2><div class="legend"><span class="lg free">Free</span><span class="lg run">In kitchen</span><span class="lg ready">Ready</span><span class="lg new">Waiting</span><span class="lg unpaid">Not paid</span></div></div>' +
    '<div class="tile-grid">' + tiles + '</div></section></div>';
}

/* ---------- Order screen for one table ---------- */
function draftFor(n) { if (!S.drafts[n]) S.drafts[n] = { items: [], note: '' }; return S.drafts[n]; }
function openTable(n) { S.table = n; S.posSearch = ''; S.posCat = 'all'; S.cartOpen = false; disarm(); render(); window.scrollTo(0, 0); }
function closeTable() { S.table = 0; S.cartOpen = false; disarm(); render(); }
function addToDraft(id, delta) {
  const d = draftFor(S.table), m = menuById()[id];
  const x = d.items.find(i => i.id === id);
  if (x) { x.qty = Math.min(99, x.qty + delta); if (x.qty <= 0) d.items = d.items.filter(i => i !== x); }
  else if (delta > 0 && m && m.available) {
    if (d.items.length >= MAX_LINES) { toast('One order can have up to ' + MAX_LINES + ' different items. Send this one first.'); return; }
    d.items.push({ id, name: m.name, qty: 1, price: m.price });
  }
}
function posItems() {
  const c = S.cafe, d = draftFor(S.table), q = S.posSearch.trim().toLowerCase();
  const qty = id => { const x = d.items.find(i => i.id === id); return x ? x.qty : 0; };
  const cats = c.categories.filter(cat => c.menu.some(m => m.cat === cat.id));
  const list = c.menu.filter(m => (S.posCat === 'all' || m.cat === S.posCat) && (!q || m.name.toLowerCase().includes(q)));
  const catBtns = '<button type="button" data-action="pos-cat" data-c="all" aria-pressed="' + (S.posCat === 'all') + '">All</button>' +
    cats.map(cat => '<button type="button" data-action="pos-cat" data-c="' + esc(cat.id) + '" aria-pressed="' + (S.posCat === cat.id) + '">' + esc(cat.name) + '</button>').join('');
  const byCat = {}; c.categories.forEach(cat => { byCat[cat.id] = cat; });
  return '<aside class="pos-cats" aria-label="Categories">' + catBtns + '</aside>' +
    '<section class="pos-items"><div class="pos-search"><input class="input" id="pos-search" data-key="pos-search" placeholder="Search items" value="' + esc(S.posSearch) + '" autocomplete="off"></div>' +
    '<div class="pos-chips">' + catBtns + '</div>' +
    '<div class="ptile-grid">' + (list.length ? list.map(m => {
      const q2 = qty(m.id), [tone] = iconFor(byCat[m.cat]);
      return '<button type="button" class="ptile tone-' + tone + (m.available ? '' : ' is-sold') + '" data-action="add" data-id="' + esc(m.id) + '"' + (m.available ? '' : ' disabled') + ' aria-label="Add ' + esc(m.name) + ', ' + rupee(m.price) + '">' +
        '<span class="vegmark' + (m.veg ? '' : ' nonveg') + '"></span><span class="pt-name">' + esc(m.name) + '</span><span class="pt-price">' + (m.available ? rupee(m.price) : 'Sold out') + '</span>' +
        (q2 ? '<span class="pt-qty">' + q2 + '</span>' : '') + '</button>';
    }).join('') : '<p class="empty">No items found.</p>') + '</div></section>';
}
function sentOrdersHtml(os) {
  const mine = S.user ? S.user.uid : '';
  const rows = os.map(o => {
    const idA = esc(o.id), dis = S.pending[o.id] ? ' disabled' : '';
    let extra = '';
    if (o.status === 'new') {
      const ck = 'cancel:' + o.id;
      extra = '<div class="pending-box"><p><b>Waiting for the kitchen or counter to accept.</b></p>' +
        (o.waiterUid === mine ? '<div class="t-act"><button type="button" class="b-reject" data-action="cancel" data-id="' + idA + '"' + dis + '>' + (armed(ck) ? 'Tap again to cancel' : 'Cancel order') + '</button></div>' : '') + '</div>';
    } else if (o.status === 'preparing') {
      const m = minsLeft(o);
      extra = '<div class="ro-foot"><span class="' + (m !== null && m < 0 ? 'late' : '') + '">' + (m === null ? 'In the kitchen' : m > 0 ? 'Ready in ' + m + ' min' : m === 0 ? 'Due now' : 'Late by ' + (-m) + ' min') + '</span></div>';
    } else if (o.status === 'ready') {
      extra = '<div class="ro-foot"><span class="ok">Ready to serve</span><button type="button" class="mini" data-action="served" data-id="' + idA + '"' + dis + '>Served</button></div>';
    }
    return '<div class="ro s-' + o.status + '"><div class="ro-top"><span class="st-chip s-' + o.status + '">' + STATUS_CHIP[o.status] + '</span><span class="muted">' + shortCode(o.id) + ', ' + fmtTime(o.createdAt) +
      (o.source === 'waiter' && o.waiterName ? ', ' + esc(o.waiterName) : o.source === 'customer' ? ', customer' : '') + '</span></div>' +
      '<ul class="ro-lines">' + o.items.map(i => '<li><span>' + i.qty + '\u00D7 ' + esc(i.name) + '</span><span>' + rupee(i.qty * i.price) + '</span></li>').join('') + '</ul>' +
      (o.note ? '<p class="t-note">Note: ' + esc(o.note) + '</p>' : '') + extra + '</div>';
  });
  const rej = rejectedRecent(S.table).map(o => '<div class="ro"><div class="ro-top"><span class="muted"><b>Rejected</b>, ' + shortCode(o.id) + (o.cancelReason ? ': ' + esc(o.cancelReason) : '') + '</span>' +
    '<button type="button" class="mini" data-action="dismiss" data-id="' + esc(o.id) + '">OK</button></div>' +
    '<ul class="ro-lines">' + o.items.map(i => '<li><span>' + i.qty + '\u00D7 ' + esc(i.name) + '</span></li>').join('') + '</ul></div>');
  const all = rows.concat(rej);
  return all.length ? '<div class="cart-sec"><p class="cart-h">Orders for this table</p>' + all.join('') + '</div>' : '';
}
function cartHtml() {
  const n = S.table, d = draftFor(n), os = openOrders(n), bs = billable(n), b = billCalc(bs);
  const draftTotal = d.items.reduce((s, i) => s + i.qty * i.price, 0);
  const waitingCount = os.filter(o => o.status === 'new').length;
  const draft = d.items.length
    ? '<div class="cart-sec"><p class="cart-h">New items</p><ul class="lines">' + d.items.map(i => '<li class="line"><span class="line-name">' + esc(i.name) + '</span>' +
      '<div class="step step-sm"><button type="button" data-action="dec" data-id="' + esc(i.id) + '" data-key="dec-' + esc(i.id) + '" aria-label="Remove one ' + esc(i.name) + '">\u2212</button><span>' + i.qty + '</span><button type="button" data-action="add" data-id="' + esc(i.id) + '" data-key="inc-' + esc(i.id) + '" aria-label="Add one more ' + esc(i.name) + '">+</button></div>' +
      '<span class="line-price">' + rupee(i.qty * i.price) + '</span></li>').join('') + '</ul>' +
      '<textarea id="draft-note" data-key="draft-note" maxlength="200" placeholder="Note for the kitchen (optional)">' + esc(d.note) + '</textarea></div>'
    : (os.length || rejectedRecent(n).length ? '' : '<p class="empty cart-empty">Tap items to start an order.</p>');
  // The bill: what the customer owes for everything the kitchen has accepted.
  const billBox = b.lines.length && !d.items.length
    ? '<div class="cart-sec"><p class="cart-h">Bill</p><div class="bill-sum"><p><span>Subtotal</span><span>' + money2(b.subtotal) + '</span></p>' +
      (b.gstPct ? '<p><span>CGST ' + (b.gstPct / 2) + '%</span><span>' + money2(b.gst / 2) + '</span></p><p><span>SGST ' + (b.gstPct / 2) + '%</span><span>' + money2(b.gst / 2) + '</span></p>' : '') +
      (b.roundOff ? '<p><span>Round off</span><span>' + money2(b.roundOff) + '</span></p>' : '') + '<p class="grand"><span>Total</span><span>' + rupee(b.total) + '</span></p></div>' +
      (waitingCount ? '<p class="fine left">' + plural(waitingCount, 'order') + ' still waiting. ' + (waitingCount === 1 ? 'It isn\u2019t' : 'They aren\u2019t') + ' on this bill yet.</p>' : '') + '</div>'
    : '';
  const foot = '<div class="cart-foot">' +
    (d.items.length ? '<button type="button" class="btn-primary" data-action="send"' + (S.sending ? ' disabled' : '') + '>' + (S.sending ? 'Sending\u2026' : 'Send order, ' + rupee(draftTotal)) + '</button>' : '') +
    (b.lines.length && !d.items.length && S.cafe.whatsapp ? '<input class="input qphone" id="q-phone" data-key="q-phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="Customer phone, optional (WhatsApp bill)" aria-label="Customer phone, optional" value="' + esc(S.phones[n] || '') + '">' : '') +
    (b.lines.length && !d.items.length ? '<p class="qb-h">Collect payment, ' + rupee(b.total) + '</p><div class="qb-row">' + PAY.map(([k, l]) => {
      const a = armed('pay:' + n + ':' + k);
      return '<button type="button" class="qb" data-action="pay" data-p="' + k + '"' + (S.payBusy ? ' disabled' : '') + '>' + (a ? 'Tap again: ' + l : l) + '</button>';
    }).join('') + '</div>' : '') + '</div>';
  return '<div class="cart-head"><div><h2>Table ' + n + '</h2><p class="muted">' + (os.length ? plural(os.length, 'order') + ' open' : 'No orders yet') + '</p></div>' +
    '<button type="button" class="x cart-close" data-action="cart-close" aria-label="Close order">\u2715</button></div>' +
    '<div class="cart-body">' + sentOrdersHtml(os) + draft + billBox + '</div>' + foot;
}
// After a bill with a phone number: one tap opens WhatsApp with the bill ready.
function waBanner() {
  if (!S.wa) return '';
  return '<div class="wa-banner" role="status"><span>Bill #' + S.wa.billNo + ' saved. Send it to ' + esc(phoneShow(S.wa.phone)) + '?</span>' +
    '<a class="btn-wa sm" href="' + esc(S.wa.link) + '" target="_blank" rel="noopener" data-action="wa-done">Send on WhatsApp</a>' +
    '<button type="button" class="btn-ghost" data-action="wa-dismiss">Not now</button></div>';
}
function posView() {
  const n = S.table, d = draftFor(n), os = openOrders(n);
  const count = d.items.reduce((s, i) => s + i.qty, 0);
  const total = d.items.reduce((s, i) => s + i.qty * i.price, 0) + billable(n).reduce((s, o) => s + orderTotal(o), 0);
  const ready = os.some(o => o.status === 'ready');
  return waBanner() + '<div class="pos-bar wrap"><button type="button" class="back" data-action="back">' + ICONS.back + 'Tables</button><h1>Table ' + n + '</h1></div>' +
    '<div class="pos' + (S.cartOpen ? ' cart-open' : '') + '">' + posItems() + '<aside class="pos-cart" aria-label="Order">' + cartHtml() + '</aside></div>' +
    '<button type="button" class="cart-bar' + (ready ? ' alert' : '') + '" data-action="cart-open"><span>' + (ready ? 'Food is ready to serve' : count ? plural(count, 'new item') : plural(os.length, 'order')) + '</span><b>' + rupee(total) + '</b><span class="cb-go">View order</span></button>';
}

/* ---------- Render ---------- */
function render() {
  withFocus(() => {
    renderChrome();
    const app = $('#app');
    if (S.phase === 'auth' || S.phase === 'loading') { app.innerHTML = '<div class="center-note"><p>Loading\u2026</p></div>'; return; }
    if (S.phase === 'login') { if (!app.querySelector('#login-form') || S.loginRerender) { app.innerHTML = loginView(); S.loginRerender = false; } return; }
    if (S.phase === 'nocafe') { app.innerHTML = noteView('No cafe linked yet', 'This login (' + (S.user ? S.user.email : '') + ') isn\u2019t linked to a cafe as a waiter. Ask your cafe owner or YUNO to add you.'); return; }
    if (S.phase === 'denied') { app.innerHTML = noteView('No access', 'This login can\u2019t open \u201C' + S.cafeId + '\u201D as a waiter. Check the link, or ask your cafe owner to add you.'); return; }
    if (S.table > S.cafe.tables) S.table = 0;
    const scroller = app.querySelector('.ptile-grid'), cartBody = app.querySelector('.cart-body');
    const keep = S.table ? { g: scroller ? scroller.scrollTop : 0, c: cartBody ? cartBody.scrollTop : 0 } : null;
    app.innerHTML = S.table ? posView() : tablesView();
    document.body.classList.remove('has-bottom-nav');
    if (keep) { const g = app.querySelector('.ptile-grid'), cb = app.querySelector('.cart-body'); if (g) g.scrollTop = keep.g; if (cb) cb.scrollTop = keep.c; }
  });
}

/* ---------- Actions ---------- */
async function sendDraft() {
  const n = S.table, d = draftFor(n);
  if (!d.items.length || S.sending) return;
  const noteEl = $('#draft-note'); if (noteEl) d.note = noteEl.value;
  const items = d.items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }));
  const data = {
    table: n, items, note: String(d.note || '').trim().slice(0, 200), total: items.reduce((s, i) => s + i.qty * i.price, 0),
    status: 'new', createdAt: serverTimestamp(), source: 'waiter', waiterUid: S.user.uid, waiterName: S.waiterName
  };
  S.sending = true; render();
  try {
    await addDoc(collection(db, 'cafes', S.cafeId, 'orders'), data);
    S.drafts[n] = { items: [], note: '' };
    S.cartOpen = true;
    toast('Sent. The counter or kitchen will accept it.');
  } catch (e) {
    toast(e && e.code === 'permission-denied' ? 'This login can\u2019t send orders. Ask your cafe owner to check your waiter access.' : 'That didn\u2019t send. Check your internet and try again.');
  }
  S.sending = false; render();
}
async function updateOrder(id, data, okMsg, failMsg) {
  if (S.pending[id]) return false;
  S.pending[id] = true; render();
  try { await updateDoc(orderRef(id), Object.assign({}, data, { updatedAt: serverTimestamp() })); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(e && e.code === 'permission-denied' && failMsg ? failMsg : 'That didn\u2019t save. Check your internet and try again.'); return false; }
  finally { delete S.pending[id]; render(); }
}
// Summary record for the sales day (same as the counter writes), so the owner's reports stay right.
function summaryDelta(b) {
  const k = bizDay(S.cafe.settings.dayEndHour, b.createdAt), hour = String(new Date(b.createdAt).getHours());
  const sums = {};
  b.lines.forEach(l => { const key = itemKey(l.name), x = sums[key] || (sums[key] = { q: 0, a: 0 }); x.q += l.qty; x.a += l.qty * l.price; });
  const items = {};
  Object.keys(sums).forEach(key => { items[key] = { q: increment(sums[key].q), a: increment(sums[key].a) }; });
  return [k, { month: k.slice(0, 7), total: increment(b.total), count: increment(1), gst: increment(b.gst), discount: increment(0),
    pay: { [b.pay]: increment(b.total) }, hours: { [hour]: increment(b.total) }, items }];
}
async function payTable(n, pay) {
  if (S.payBusy) return;
  const os = billable(n); if (!os.length) return;
  const b = billCalc(os);
  // The phone is optional. If something is typed it has to be a real number.
  const rawPhone = S.cafe.whatsapp ? String(S.phones[n] || '').trim() : '', phone = rawPhone ? normPhone(rawPhone) : '';
  if (rawPhone && !phone) { toast('That phone number doesn\u2019t look right. Fix it, or clear it to skip WhatsApp.'); return; }
  let custVisits = 0, custName = '', billObj = null;
  S.payBusy = true; render();
  try {
    const billRef = doc(collection(db, 'cafes', S.cafeId, 'bills'));
    const counterRef = doc(db, 'cafes', S.cafeId, 'meta', 'counters');
    const custRef = phone ? doc(db, 'cafes', S.cafeId, 'customers', phone) : null;
    const saved = await runTransaction(db, async tx => {
      const c = await tx.get(counterRef);
      const cs = custRef ? await tx.get(custRef) : null;
      for (const o of os) {
        const sn = await tx.get(orderRef(o.id)), x = sn.exists() ? sn.data() : null;
        if (!x) throw Object.assign(new Error('gone'), { code: 'gone' });
        if (x.billId) throw Object.assign(new Error('billed'), { code: 'already-billed' });
        if (x.status === 'cancelled' || x.status === 'rejected') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      }
      const billNo = ((c.exists() && parseInt(c.data().billNo, 10)) || 0) + 1;
      const data = {
        billNo, label: 'Table ' + n, name: '', type: 'table', tables: [n], orderIds: os.map(o => o.id),
        lines: b.lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
        subtotal: b.subtotal, discount: 0, gstPct: b.gstPct, gst: b.gst, roundOff: b.roundOff, total: b.total,
        pay, void: false, createdAt: serverTimestamp(), by: S.user.uid
      };
      if (phone) data.phone = phone;
      tx.set(counterRef, { billNo }, { merge: true });
      tx.set(billRef, data);
      if (custRef) {
        const old = cs.exists() ? cs.data() : null;
        custVisits = (old ? parseInt(old.visits, 10) || 0 : 0) + 1; custName = old && typeof old.name === 'string' ? old.name : '';
        tx.set(custRef, { phone, name: custName.slice(0, 30), visits: custVisits, spent: Math.round(((old ? num(old.spent) : 0) + b.total) * 100) / 100,
          firstVisit: old && old.firstVisit ? old.firstVisit : serverTimestamp(), lastVisit: serverTimestamp(), lastBill: b.total,
          offerCount: old ? parseInt(old.offerCount, 10) || 0 : 0, lastOfferAt: old && old.lastOfferAt ? old.lastOfferAt : 0, optOut: !!(old && old.optOut === true) });
      }
      billObj = { billNo, label: data.label, lines: b.lines, subtotal: b.subtotal, discount: 0, gstPct: b.gstPct, gst: b.gst, total: b.total, pay };
      const [dk, delta] = summaryDelta(Object.assign({}, data, { createdAt: Date.now() }));
      tx.set(dayRef(dk), delta, { merge: true });
      os.forEach(o => tx.update(orderRef(o.id), { billId: billRef.id, updatedAt: serverTimestamp() }));
      return { billNo, total: b.total };
    });
    if (phone && billObj) { delete S.phones[n]; S.wa = { phone, billNo: saved.billNo, link: waLink(phone, billMessage(S.cafe, billObj, { name: custName, visits: custVisits })) }; }
    toast('Bill #' + saved.billNo + ' saved, ' + rupee(saved.total) + ' by ' + PAY.find(p => p[0] === pay)[1] + '. The counter can print it.');
    setTimeout(() => { if (S.table === n && !openOrders(n).length && !draftFor(n).items.length) closeTable(); }, 400);
  } catch (e) {
    const c = e && e.code;
    toast(c === 'already-billed' ? 'This table was already billed on another screen.' : c === 'cancelled' || c === 'gone' ? 'One of these orders was cancelled. Check the table again.'
      : c === 'permission-denied' ? 'This login can\u2019t save bills yet. Ask your cafe owner to publish the new rules.' : 'The bill didn\u2019t save. Check your internet and try again.');
  }
  S.payBusy = false; render();
}

document.addEventListener('click', async e => {
  const wasReady = audioReady();
  unlockAudio();
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action, id = t.dataset.id;
  switch (a) {
    case 'unlock': render(); break;
    case 'sound': S.soundOn = !S.soundOn; ls.set('yumotap:wsound', S.soundOn); if (S.soundOn && wasReady) chime(); render(); break;
    case 'signout': await signOut(auth); toast('Signed out.'); break;
    case 'forgot': {
      const f = $('#login-form'), email = f ? f.email.value.trim() : '';
      if (!email) { S.loginErr = 'Type your email above, then tap \u201CForgot password?\u201D again.'; S.loginRerender = true; render(); break; }
      try { await sendPasswordResetEmail(auth, email); toast('Password reset email sent to ' + email + '. Check your inbox and spam folder.'); }
      catch (err) { S.loginErr = loginError(err); S.loginRerender = true; render(); const f2 = $('#login-form'); if (f2) f2.email.value = email; }
      break;
    }
    case 'open-table': openTable(parseInt(t.dataset.t, 10)); break;
    case 'back': closeTable(); break;
    case 'pos-cat': S.posCat = t.dataset.c; render(); break;
    case 'add': addToDraft(id, 1); render(); break;
    case 'dec': addToDraft(id, -1); render(); break;
    case 'cart-open': S.cartOpen = true; render(); break;
    case 'cart-close': S.cartOpen = false; render(); break;
    case 'send': sendDraft(); break;
    case 'served': updateOrder(id, { status: 'served' }, null, 'This order can\u2019t be marked served right now.'); break;
    case 'cancel': {
      const key = 'cancel:' + id;
      if (!armed(key)) { arm(key); break; }
      disarm();
      updateOrder(id, { status: 'cancelled', cancelledBy: 'waiter', cancelReason: 'Cancelled by waiter' }, 'Order cancelled.', 'The kitchen or counter already accepted this order, so it can\u2019t be cancelled here. Ask the counter.');
      break;
    }
    case 'dismiss': S.dismissed.add(id); render(); break;
    case 'wa-done': setTimeout(() => { S.wa = null; render(); }, 400); break;
    case 'wa-dismiss': S.wa = null; render(); break;
    case 'call-done': try { await deleteDoc(doc(db, 'cafes', S.cafeId, 'calls', id)); } catch (err) { toast('That didn\u2019t save. Check your internet and try again.'); } break;
    case 'pay': {
      const key = 'pay:' + S.table + ':' + t.dataset.p;
      if (!armed(key)) { arm(key); break; }
      disarm(); payTable(S.table, t.dataset.p);
      break;
    }
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'pos-search') { S.posSearch = t.value; render(); }
  else if (t.id === 'draft-note' && S.table) draftFor(S.table).note = t.value;
  else if (t.id === 'q-phone' && S.table) S.phones[S.table] = t.value;
});
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'login-form') return;
  e.preventDefault();
  const email = f.email.value.trim(), pw = f.password.value;
  if (!email || !pw) { S.loginErr = 'Enter your email and password.'; S.loginRerender = true; render(); return; }
  S.loginBusy = true; S.loginErr = ''; S.loginRerender = true; render();
  try { await signInWithEmailAndPassword(auth, email, pw); }
  catch (err) { S.loginBusy = false; S.loginErr = loginError(err); S.loginRerender = true; render(); const f2 = $('#login-form'); if (f2) f2.email.value = email; return; }
  S.loginBusy = false;
});

render();
