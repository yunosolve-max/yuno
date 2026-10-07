// YUNO kitchen screen: shows orders to cook. Tap Ready when a dish is done.
import {
  db, auth, doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot, Timestamp, serverTimestamp, runTransaction,
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from './fb.js';
import { $, esc, toMs, ls, toast, unlockAudio, alarm, chime, stopAlarm, alarmPlaying, audioReady, cleanCafe, BRAND_SVG, fmtTime, shortCode, bizDay, bizStart, loginError, printKot, kotAuto, kotPrintedOnce } from './common.js';

const params = new URLSearchParams(location.search);
const S = { phase: 'auth', user: null, cafeId: '', cafe: null, orders: [], soundOn: ls.get('yumotap:ksound', true), pending: {}, fresh: {}, acceptMins: {}, rejectOpen: null, stockOpen: false, stockBusy: {}, loginErr: '', loginBusy: false };

function normOrder(id, d) {
  d = d || {};
  return {
    id, type: ['parcel', 'counter'].includes(d.type) ? d.type : 'table', table: parseInt(d.table, 10) || 0,
    name: typeof d.name === 'string' ? d.name.slice(0, 40) : '', note: typeof d.note === 'string' ? d.note.slice(0, 200) : '',
    items: Array.isArray(d.items) ? d.items.filter(x => x && typeof x === 'object').map(x => ({ name: String(x.name || 'Item').slice(0, 60), qty: parseInt(x.qty, 10) || 1 })) : [],
    status: String(d.status || 'new'), acceptedAt: d.acceptedAt ? toMs(d.acceptedAt) : 0, prepMins: parseInt(d.prepMins, 10) || 0,
    updatedAt: d.updatedAt ? toMs(d.updatedAt) : 0, createdAt: toMs(d.createdAt),
    source: d.source === 'staff' ? 'staff' : 'customer', decidedBy: d.decidedBy === 'kitchen' ? 'kitchen' : d.decidedBy === 'counter' ? 'counter' : '',
    cancelledBy: d.cancelledBy === 'customer' ? 'customer' : (d.cancelledBy ? 'cafe' : ''), cancelReason: typeof d.cancelReason === 'string' ? d.cancelReason.slice(0, 100) : ''
  };
}
const who = (o) => o.type === 'table' ? 'Table ' + o.table : (o.type === 'parcel' ? 'Parcel' : 'Counter') + (o.name ? ', ' + o.name : '');
const snapData = (d) => { try { return d.data({ serverTimestamps: 'estimate' }); } catch (e) { return d.data(); } };

let subs = [], orderSub = null, day = '', endHour = null;
function stopOrders() { if (orderSub) { try { orderSub(); } catch (e) {} orderSub = null; } }
function stop() { subs.forEach(u => { try { u(); } catch (e) {} }); subs = []; stopOrders(); endHour = null; }
// Orders for the current sales day. The day ends at the cafe's closing hour (e.g. 3 AM), not midnight.
function subscribeOrders() {
  stopOrders();
  day = bizDay(endHour);
  const start = bizStart(day, endHour);
  let first = true; const prev = new Map();
  orderSub = onSnapshot(query(collection(db, 'cafes', S.cafeId, 'orders'), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'asc')), snap => {
    const list = snap.docs.map(d => normOrder(d.id, snapData(d)));
    if (!first) {
      let ring = false, soft = false;
      list.forEach(o => {
        const was = prev.get(o.id);
        if (!was && o.status === 'new') { S.fresh[o.id] = Date.now(); ring = true; }
        if (o.status === 'preparing' && was !== 'preparing' && was !== 'ready') {
          S.fresh[o.id] = Date.now();
          if (was === 'new') { if (o.decidedBy !== 'kitchen') { soft = true; toast(who(o) + ': accepted at the counter. Start cooking.'); } }
          else ring = true; // typed in at the counter, straight to cooking
        }
        if (was === 'new' && o.status === 'rejected' && o.decidedBy !== 'kitchen') toast(who(o) + ': rejected at the counter' + (o.cancelReason ? ' (' + o.cancelReason + ')' : '') + '.');
        if (was === 'new' && o.status === 'cancelled' && o.cancelledBy === 'customer') toast(who(o) + ' cancelled their order.');
        if ((was === 'preparing' || was === 'ready') && o.status === 'cancelled') toast(who(o) + ': the counter cancelled this order. Stop cooking.');
        if (S.rejectOpen === o.id && o.status !== 'new') S.rejectOpen = null;
        // Auto KOT: print once when an order goes to cooking (accepted here or at the counter, or typed in at the counter).
        if (o.status === 'preparing' && (!was || was === 'new') && kotAuto.get() && kotPrintedOnce(S.cafeId, o.id)) printKot(o, S.cafe);
      });
      if (ring && S.soundOn) alarm(); else if (soft && S.soundOn) chime();
    }
    prev.clear(); list.forEach(o => prev.set(o.id, o.status)); first = false;
    S.orders = list; render();
  }, err => { if (err && err.code === 'permission-denied') { S.phase = 'denied'; render(); } });
}
function subscribe() {
  stop();
  subs.push(onSnapshot(doc(db, 'cafes', S.cafeId), snap => {
    if (!snap.exists()) { S.phase = 'denied'; render(); return; }
    S.cafe = cleanCafe(snap.data());
    if (S.cafe.settings.dayEndHour !== endHour) { endHour = S.cafe.settings.dayEndHour; subscribeOrders(); }
    if (S.phase !== 'ready') { S.phase = 'ready'; keepAwake(); } render();
  }, () => { S.phase = 'denied'; render(); }));
}
setInterval(() => { if (S.phase === 'ready' && endHour !== null) { if (bizDay(endHour) !== day) subscribeOrders(); else render(); } }, 30000);
// New orders ring nonstop until the kitchen or counter accepts or rejects them.
let ringForNew = false;
setInterval(() => {
  if (S.phase !== 'ready') return;
  if (S.soundOn && waitingNew()) { if (!alarmPlaying()) alarm(); ringForNew = true; }
  else if (ringForNew) { ringForNew = false; stopAlarm(); }
}, 500);
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.phase === 'ready') keepAwake(); });

onAuthStateChanged(auth, async user => {
  stop(); S.user = user; S.orders = [];
  if (!user) { S.phase = 'login'; render(); return; }
  S.phase = 'loading'; render();
  let cafeId = (params.get('cafe') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!cafeId) {
    try { const snap = await getDoc(doc(db, 'staffIndex', user.uid)); const l = snap.exists() && Array.isArray(snap.data().cafes) ? snap.data().cafes : []; cafeId = l[0] || ''; } catch (e) {}
  }
  if (!cafeId) { S.phase = 'nocafe'; render(); return; }
  S.cafeId = cafeId; subscribe();
});

// New orders: the kitchen can accept or reject them too. Whoever taps first (kitchen or counter) wins.
const K_REASONS = ['Item not available', 'Kitchen is closed', 'Too busy right now', 'Duplicate order', 'Other'];
const waitingNew = () => S.orders.some(o => o.status === 'new');
async function decide(id, data, okMsg) {
  if (S.pending[id]) return;
  S.pending[id] = true; render();
  const ref = doc(db, 'cafes', S.cafeId, 'orders', id);
  try {
    await runTransaction(db, async tx => {
      const sn = await tx.get(ref);
      if (!sn.exists() || sn.data().status !== 'new') throw Object.assign(new Error('taken'), { code: 'taken' });
      tx.update(ref, Object.assign({}, data, { decidedBy: 'kitchen', updatedAt: serverTimestamp() }));
    });
    S.rejectOpen = null; toast(okMsg);
  } catch (e) { toast(e && e.code === 'taken' ? 'The counter already handled this order.' : 'That didn\u2019t save. Check your internet.'); }
  delete S.pending[id]; render();
}
function freshMark(o) {
  const f = S.fresh[o.id]; if (!f) return ['', ''];
  const el = Date.now() - f;
  if (el < 2400) return [' is-fresh', ' style="animation-delay:-' + el + 'ms"'];
  delete S.fresh[o.id]; return ['', ''];
}
function newCard(o) {
  const idA = esc(o.id), dis = S.pending[o.id] ? ' disabled' : '', [fc, fs] = freshMark(o);
  const def = S.cafe.settings.prepMins, mins = S.acceptMins[o.id] || def;
  const times = [...new Set([5, 10, 15, 20, 30, def])].sort((a, b) => a - b);
  const body = S.rejectOpen === o.id
    ? '<p class="k-ask">Why can\u2019t the kitchen make it?</p><div class="chips">' + K_REASONS.map(r => '<button type="button" class="chip" data-action="reject-confirm" data-id="' + idA + '" data-r="' + esc(r) + '"' + dis + '>' + esc(r) + '</button>').join('') + '</div>' +
      '<div class="k-act"><button type="button" class="mini" data-action="reject-back" data-id="' + idA + '">Back</button></div>'
    : '<p class="k-ask">Ready in</p><div class="chips">' + times.map(m => '<button type="button" class="chip" data-action="k-time" data-id="' + idA + '" data-m="' + m + '" aria-pressed="' + (m === mins) + '">' + m + ' min</button>').join('') + '</div>' +
      '<div class="k-act"><button type="button" class="k-reject" data-action="reject" data-id="' + idA + '"' + dis + '>Reject</button><button type="button" class="k-accept" data-action="accept" data-id="' + idA + '"' + dis + '>Accept</button></div>';
  return '<article class="k-ticket k-new' + fc + '"' + fs + '><header><h2>' + esc(who(o)) + '</h2><span class="k-badge">New</span></header>' +
    '<p class="k-meta">Order ' + shortCode(o.id) + ', sent ' + fmtTime(o.createdAt) + (o.source === 'staff' ? ' from the counter' : ' by the customer') + '. Waiting for kitchen or counter.</p>' +
    '<ul class="k-lines">' + o.items.map(i => '<li><b>' + i.qty + '</b><span>' + esc(i.name) + '</span></li>').join('') + '</ul>' +
    (o.note ? '<p class="k-note">' + esc(o.note) + '</p>' : '') + body + '</article>';
}
function stoppedText(o) {
  if (o.status === 'cancelled' && o.cancelledBy === 'customer') return 'Cancelled by the customer';
  const by = o.decidedBy === 'kitchen' ? ' in the kitchen' : o.decidedBy === 'counter' ? ' at the counter' : '';
  return (o.status === 'rejected' ? 'Rejected' : 'Cancelled') + by + (o.cancelReason ? ': ' + o.cancelReason : '');
}
// Sold out in one tap: the kitchen switches a dish off and it disappears from customers' menus at once.
function stockHtml() {
  const c = S.cafe;
  return '<section class="panel-lite stock"><div class="sec-head" style="margin:0 0 6px"><h3>Sold out today?</h3><button type="button" class="btn-ghost" data-action="stock">Done</button></div>' +
    '<p class="fine left" style="margin:0 2px 10px">Switch a dish off and customers stop seeing it straight away. Switch it back on when it\u2019s ready again.</p>' +
    c.categories.map(cat => { const items = c.menu.filter(m => m.cat === cat.id); if (!items.length) return '';
      return '<h4 class="stock-cat">' + esc(cat.name) + '</h4><ul class="stock-list">' + items.map(m => '<li class="' + (m.available ? '' : 'off') + '"><span>' + esc(m.name) + '</span>' +
        '<button type="button" class="sw" role="switch" aria-checked="' + m.available + '" aria-label="' + esc(m.name) + ' available" data-action="stock-toggle" data-id="' + esc(m.id) + '"' + (S.stockBusy[m.id] ? ' disabled' : '') + '></button></li>').join('') + '</ul>'; }).join('') +
    '</section>';
}
async function toggleStock(id) {
  if (S.stockBusy[id]) return;
  S.stockBusy[id] = true; render();
  const ref = doc(db, 'cafes', S.cafeId);
  try {
    let now = null;
    await runTransaction(db, async tx => {
      const sn = await tx.get(ref); if (!sn.exists()) return;
      const menu = (sn.data().menu || []).map(m => m && m.id === id ? Object.assign({}, m, { available: m.available === false }) : m);
      const it = menu.find(m => m && m.id === id); now = it ? it.available !== false : null;
      tx.update(ref, { menu, updatedAt: serverTimestamp() });
    });
    const it = S.cafe.menu.find(m => m.id === id);
    if (it && now !== null) toast(it.name + (now ? ' is back on the menu.' : ' is marked sold out.'));
  } catch (e) { toast('That didn\u2019t save. Check your internet.'); }
  delete S.stockBusy[id]; render();
}
function ticket(o) {
  const m = o.acceptedAt ? Math.round((o.acceptedAt + o.prepMins * 60000 - Date.now()) / 60000) : null;
  const late = m !== null && m < 0, busy = !!S.pending[o.id], idA = esc(o.id);
  const [fc, style] = freshMark(o), cls = 'k-ticket' + (late ? ' late' : '') + fc;
  return '<article class="' + cls + '"' + style + '><header><h2>' + esc(who(o)) + '</h2><span class="k-time' + (late ? ' late' : '') + '">' +
    (m === null ? '' : m > 0 ? m + ' min left' : m === 0 ? 'Due now' : (-m) + ' min late') + '</span></header>' +
    '<p class="k-meta">Order ' + shortCode(o.id) + ', ' + (o.decidedBy === 'kitchen' ? 'accepted in the kitchen' : o.decidedBy === 'counter' ? 'accepted at the counter' : 'sent from the counter') + ' at ' + fmtTime(o.acceptedAt || o.createdAt) + '</p>' +
    '<ul class="k-lines">' + o.items.map(i => '<li><b>' + i.qty + '</b><span>' + esc(i.name) + '</span></li>').join('') + '</ul>' +
    (o.note ? '<p class="k-note">' + esc(o.note) + '</p>' : '') +
    '<div class="k-act"><button type="button" class="mini k-kot" data-action="kot" data-id="' + idA + '">Print KOT</button><button type="button" class="mini" data-action="more" data-id="' + idA + '"' + (busy ? ' disabled' : '') + '>+5 min</button>' +
    '<button type="button" class="k-ready" data-action="ready" data-id="' + idA + '"' + (busy ? ' disabled' : '') + '>Ready</button></div></article>';
}
function render() {
  const ready = S.phase === 'ready';
  $('#topbar').hidden = !ready;
  const app = $('#app');
  if (S.phase === 'auth' || S.phase === 'loading') { app.innerHTML = '<div class="center-note"><p>Loading\u2026</p></div>'; return; }
  if (S.phase === 'login') {
    if (!app.querySelector('#login-form') || S.loginErr !== app.dataset.err) {
      app.dataset.err = S.loginErr;
      app.innerHTML = '<div class="login"><div class="brand">' + BRAND_SVG + 'YUNO</div><h1>Kitchen login</h1><p class="lead">Use the same staff login as the counter.</p>' +
        '<form id="login-form" novalidate><label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username"></label>' +
        '<label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password"></label>' +
        (S.loginErr ? '<p class="err" role="alert">' + esc(S.loginErr) + '</p>' : '') + '<button class="btn-primary" type="submit">' + (S.loginBusy ? 'Signing in\u2026' : 'Sign in') + '</button></form></div>';
    }
    return;
  }
  if (S.phase === 'nocafe' || S.phase === 'denied') {
    app.innerHTML = '<div class="center-note panel"><h1>No access</h1><p>This login isn\u2019t linked to this cafe. Ask YUNO to add you.</p><p style="margin-top:16px"><button class="btn-ghost" data-action="signout">Sign out</button></p></div>';
    return;
  }
  const fresh = S.orders.filter(o => o.status === 'new');
  const stopped = S.orders.filter(o => (o.status === 'rejected' || o.status === 'cancelled') && Date.now() - (o.updatedAt || o.createdAt) < 30 * 60000).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 6);
  const cooking = S.orders.filter(o => o.status === 'preparing').sort((a, b) => (a.acceptedAt || a.createdAt) - (b.acceptedAt || b.createdAt));
  const done = S.orders.filter(o => o.status === 'ready').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  $('#top-cafe').innerHTML = (S.cafe.brand.logo ? '<img class="top-logo" src="' + S.cafe.brand.logo + '" alt="">' : '') + esc(S.cafe.name);
  $('#top-tools').innerHTML = (fresh.length ? '<span class="k-count k-count-new">' + fresh.length + ' new</span>' : '') + '<span class="k-count">' + cooking.length + ' to cook</span><button type="button" class="btn-ghost' + (S.stockOpen ? ' on' : '') + '" data-action="stock">Sold out</button><button type="button" class="btn-ghost' + (kotAuto.get() ? ' on' : '') + '" data-action="kot-auto" title="Print a kitchen ticket by itself for each new order">' + (kotAuto.get() ? 'Auto KOT on' : 'Auto KOT off') + '</button><button type="button" class="btn-ghost" data-action="sound">' + (S.soundOn ? 'Sound on' : 'Sound off') + '</button>';
  app.innerHTML = '<div class="wrap page">' + (S.soundOn && !audioReady() ? '<button type="button" class="sound-banner" data-action="unlock">Tap here to turn on the order alarm</button>' : '') +
    (S.stockOpen ? stockHtml() : '') +
    (fresh.length ? '<section class="k-sec"><h3 class="k-h new">New orders: accept or reject</h3><div class="k-grid">' + fresh.map(newCard).join('') + '</div></section>' : '') +
    (cooking.length ? '<section class="k-sec"><h3 class="k-h">Cooking</h3><div class="k-grid">' + cooking.map(ticket).join('') + '</div></section>'
      : fresh.length ? '' : '<div class="center-note panel"><h1>All clear</h1><p>New orders appear here with an alarm. Accept or reject them here or at the counter.</p></div>') +
    (done.length ? '<section class="k-done"><h3>Ready, waiting to be served</h3><ul>' + done.map(o => '<li><b>' + esc(who(o)) + '</b><span>' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '</span><button type="button" class="mini" data-action="undo" data-id="' + esc(o.id) + '">Undo</button></li>').join('') + '</ul></section>' : '') +
    (stopped.length ? '<section class="k-done k-stopped"><h3>Rejected or cancelled, last 30 minutes</h3><ul>' + stopped.map(o => '<li><b>' + esc(who(o)) + '</b><span>' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '<em>' + esc(stoppedText(o)) + '</em></span></li>').join('') + '</ul></section>' : '') +
    '<p class="fine" style="margin-top:24px"><button type="button" class="linkbtn" data-action="signout">Sign out</button></p></div>';
}
async function setOrder(id, data, msg) {
  if (S.pending[id]) return;
  S.pending[id] = true; render();
  try { await updateDoc(doc(db, 'cafes', S.cafeId, 'orders', id), Object.assign(data, { updatedAt: serverTimestamp() })); if (msg) toast(msg); }
  catch (e) { toast('That didn\u2019t save. Check your internet.'); }
  delete S.pending[id]; render();
}
document.addEventListener('click', async e => {
  if (alarmPlaying() && !waitingNew()) stopAlarm(); // a tap means "seen it" (new orders keep ringing until handled)
  const was = audioReady(); unlockAudio();
  if (!was && S.phase === 'ready') setTimeout(() => { if (audioReady()) render(); }, 300);
  const t = e.target.closest('[data-action]'); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.action) {
    case 'accept': { const mins = S.acceptMins[id] || S.cafe.settings.prepMins; decide(id, { status: 'preparing', prepMins: mins, acceptedAt: serverTimestamp() }, 'Accepted. Start cooking, ready in ' + mins + ' min.'); break; }
    case 'k-time': S.acceptMins[id] = parseInt(t.dataset.m, 10); render(); break;
    case 'reject': S.rejectOpen = id; render(); break;
    case 'reject-back': S.rejectOpen = null; render(); break;
    case 'reject-confirm': decide(id, { status: 'rejected', cancelledBy: 'cafe', cancelReason: String(t.dataset.r || 'Other').slice(0, 100) }, 'Order rejected. The customer and counter can see it.'); break;
    case 'ready': setOrder(id, { status: 'ready', readyAt: serverTimestamp() }, 'Marked ready. The counter can see it.'); break;
    case 'kot': { const o = S.orders.find(x => x.id === id); if (o) { kotPrintedOnce(S.cafeId, o.id); printKot(o, S.cafe); } break; }
    case 'kot-auto': kotAuto.set(!kotAuto.get()); render(); toast(kotAuto.get() ? 'A KOT will print by itself for every order that goes to cooking.' : 'Auto KOT is off on this screen.'); break;
    case 'stock': S.stockOpen = !S.stockOpen; render(); break;
    case 'stock-toggle': toggleStock(id); break;
    case 'undo': setOrder(id, { status: 'preparing' }); break;
    case 'more': { const o = S.orders.find(x => x.id === id); if (o) setOrder(id, { prepMins: o.prepMins + 5 }, '5 more minutes added.'); break; }
    case 'sound': S.soundOn = !S.soundOn; ls.set('yumotap:ksound', S.soundOn); render(); if (S.soundOn) alarm(1.8); else stopAlarm(); break;
    case 'unlock': render(); break;
    case 'signout': await signOut(auth); break;
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target; if (f.id !== 'login-form') return;
  const email = f.email.value.trim(), pw = f.password.value;
  S.loginBusy = true; S.loginErr = ''; render();
  try { await signInWithEmailAndPassword(auth, email, pw); }
  catch (err) { S.loginErr = loginError(err); render(); const f2 = $('#login-form'); if (f2) f2.email.value = email; }
  S.loginBusy = false;
});
render();
