// YUNO counter: table grid, tap-to-order, billing, bills & sales, menu, settings.
import {
  db, auth, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, onSnapshot,
  Timestamp, serverTimestamp, writeBatch, runTransaction, increment,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, limit
} from './fb.js';
import {
  $, esc, rupee, money2, shortCode, toMs, ago, ls, toast, unlockAudio, chime, alarm, stopAlarm, alarmPlaying, audioReady,
  cleanCafe, newId, BRAND_SVG, dayKey, fmtTime, fmtDateTime, iconFor, bizDay, bizStart, payAmount, shortMoney, processPhoto, ALLERGENS, SPICE, loginError, printOut, printKot, kotAuto, kotPrintedOnce, lbPeriods, LB_GAMES } from './common.js';

const params = new URLSearchParams(location.search);
const VIEWS = ['tables', 'bills', 'menu', 'settings'];
const TIMES = [5, 10, 15, 20, 30];
const REASONS = ['Item not available', 'Customer left', 'Kitchen is closed', 'Duplicate order', 'Other'];
const PAY = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];
const TYPE_LABEL = { table: 'Table', parcel: 'Parcel', counter: 'Counter' };
const STATUS_CHIP = { new: 'Waiting', preparing: 'In kitchen', ready: 'Ready', served: 'Served' };
const ICONS = {
  tables: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  bills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 8h6M9 12h6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 9.3-5M18 8c0 7 3 8 3 8H9M10.3 21a1.9 1.9 0 0 0 3.4 0M3 3l18 18"/></svg>'
};

const S = {
  phase: 'auth', user: null, cafeId: '', cafeChoices: [], cafe: null,
  orders: [], calls: [], bills: [],
  view: VIEWS.includes(params.get('view')) ? params.get('view') : 'tables',
  pos: null, drafts: {}, posCat: 'all', posSearch: '', cartOpen: false, acceptMins: {},
  billsTab: 'today', reportDate: '', calMonth: '', monthDays: null, dayBills: null, photos: undefined, endHour: null, calOpen: false,
  soundOn: ls.get('yumotap:sound', true), alarmRepeat: ls.get('yumotap:alarmRepeat', true),
  pending: {}, dialog: null, loginErr: '', loginBusy: false, loginRerender: false,
  settingsDirty: false, savingSettings: false, qrBase: ls.get('yumotap:qrBase', location.origin)
};

/* ---------- Helpers ---------- */
// Today's sales day. With the day ending at 3 AM, 1:30 AM still counts as yesterday.
const today = () => bizDay(S.cafe ? S.cafe.settings.dayEndHour : 3);
const hourLabel = (h) => h === 0 ? 'midnight' : h + ' AM';
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const itemCount = (o) => o.items.reduce((s, i) => s + i.qty, 0);
function menuById() { const m = {}; (S.cafe ? S.cafe.menu : []).forEach(i => { m[i.id] = i; }); return m; }
function orderTotal(o) { return o.items.reduce((s, i) => s + i.qty * i.price, 0); }
function minsLeft(o) { if (!o.acceptedAt) return null; return Math.round((o.acceptedAt + (o.prepMins || 0) * 60000 - Date.now()) / 60000); }
function groupKey(o) { return o.type === 'table' ? 't:' + o.table : (o.group || 'o:' + o.id); }
function openOrders(key) { return S.orders.filter(o => groupKey(o) === key && !o.billId && ['new', 'preparing', 'ready', 'served'].includes(o.status)); }
function billable(key) { return openOrders(key).filter(o => o.status !== 'new'); }
// A table that has had its food (ready or served) but no bill after the cafe's set minutes.
function unpaidInfo(key) {
  const lim = S.cafe.settings.unpaidMins;
  if (!lim || !key.startsWith('t:')) return null;
  const os = billable(key);
  if (!os.length || os.some(o => o.status === 'preparing')) return null;
  const last = Math.max(...os.map(o => o.updatedAt || o.createdAt)), mins = Math.floor((Date.now() - last) / 60000);
  if (mins < lim) return null;
  return { mins, amount: payAmount(os.reduce((s, o) => s + orderTotal(o), 0), S.cafe.settings.gstPct) };
}
function unpaidTables() {
  const out = [];
  if (!S.cafe) return out;
  for (let n = 1; n <= S.cafe.tables; n++) { const u = unpaidInfo('t:' + n); if (u) out.push(Object.assign({ table: n }, u)); }
  return out;
}
function keyTitle(key, sample) {
  if (key.startsWith('t:')) return 'Table ' + key.slice(2);
  const o = sample || S.orders.find(x => groupKey(x) === key);
  const type = o ? o.type : (S.pos && S.pos.key === key ? S.pos.type : 'parcel');
  const name = o ? o.name : (S.drafts[key] && S.drafts[key].name) || '';
  return TYPE_LABEL[type] + (name ? ', ' + name : '');
}
function normOrder(id, d) {
  d = d || {};
  const byId = menuById();
  const items = Array.isArray(d.items) ? d.items.filter(x => x && typeof x === 'object').map(x => {
    const mid = String(x.id || '');
    // Customer orders are priced from the real menu, so a changed price on a phone can't lower the bill.
    const price = d.source === 'staff' ? Math.max(0, Number(x.price) || 0) : (byId[mid] ? byId[mid].price : Math.max(0, Number(x.price) || 0));
    return { id: mid, name: String(x.name || 'Item').slice(0, 60), qty: Math.max(1, Math.min(99, parseInt(x.qty, 10) || 1)), price };
  }).slice(0, 60) : [];
  return {
    id, items, type: ['parcel', 'counter'].includes(d.type) ? d.type : 'table', table: parseInt(d.table, 10) || 0,
    group: typeof d.group === 'string' ? d.group.slice(0, 40) : '', name: typeof d.name === 'string' ? d.name.slice(0, 40) : '',
    note: typeof d.note === 'string' ? d.note.slice(0, 200) : '',
    status: ['new', 'preparing', 'ready', 'served', 'rejected', 'cancelled'].includes(d.status) ? d.status : 'new',
    createdAt: toMs(d.createdAt), acceptedAt: d.acceptedAt ? toMs(d.acceptedAt) : 0, readyAt: d.readyAt ? toMs(d.readyAt) : 0, prepMins: Math.max(0, parseInt(d.prepMins, 10) || 0),
    billId: typeof d.billId === 'string' ? d.billId : '', cancelledBy: d.cancelledBy === 'customer' ? 'customer' : (d.cancelledBy ? 'cafe' : ''),
    cancelReason: typeof d.cancelReason === 'string' ? d.cancelReason.slice(0, 120) : '', source: d.source === 'staff' ? 'staff' : 'customer',
    updatedAt: d.updatedAt ? toMs(d.updatedAt) : 0, decidedBy: d.decidedBy === 'kitchen' ? 'kitchen' : d.decidedBy === 'counter' ? 'counter' : ''
  };
}
function normBill(id, d) {
  d = d || {};
  return {
    id, billNo: parseInt(d.billNo, 10) || 0, label: String(d.label || ''), name: String(d.name || ''), type: String(d.type || 'table'),
    orderIds: Array.isArray(d.orderIds) ? d.orderIds.filter(x => typeof x === 'string') : [],
    lines: Array.isArray(d.lines) ? d.lines.map(l => ({ name: String((l && l.name) || 'Item'), qty: parseInt(l && l.qty, 10) || 0, price: Number(l && l.price) || 0 })) : [],
    subtotal: num(d.subtotal), discount: num(d.discount), gstPct: num(d.gstPct), gst: num(d.gst), roundOff: num(d.roundOff), total: num(d.total),
    pay: ['cash', 'upi', 'card'].includes(d.pay) ? d.pay : 'cash', void: d.void === true, createdAt: toMs(d.createdAt)
  };
}
function snapData(d) { try { return d.data({ serverTimestamps: 'estimate' }); } catch (e) { return d.data(); } }
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
const cafeRef = () => doc(db, 'cafes', S.cafeId);
const orderRef = (id) => doc(db, 'cafes', S.cafeId, 'orders', id);
let cafeWrites = Promise.resolve();
function writeCafe(data, okMsg) {
  const p = cafeWrites.then(() => updateDoc(cafeRef(), Object.assign({}, data, { updatedAt: serverTimestamp() })));
  cafeWrites = p.catch(() => {});
  return p.then(() => { if (okMsg) toast(okMsg); }).catch(e => {
    toast(e && e.code === 'permission-denied' ? 'This login can\u2019t change these settings.' : 'That didn\u2019t save. Check your internet and try again.');
    throw e;
  });
}
async function updateOrder(id, data, okMsg) {
  if (S.pending[id]) return false;
  S.pending[id] = true; render();
  try { await updateDoc(orderRef(id), Object.assign({}, data, { updatedAt: serverTimestamp() })); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast('That didn\u2019t save. Check your internet and try again.'); return false; }
  finally { delete S.pending[id]; render(); }
}
// Accept or reject a new order. The kitchen can decide too, so this only works while the
// order is still new: whoever taps first wins, and the other screen is told.
async function decideOrder(id, data, okMsg) {
  if (S.pending[id]) return false;
  S.pending[id] = true; render();
  try {
    await runTransaction(db, async tx => {
      const sn = await tx.get(orderRef(id));
      if (!sn.exists() || sn.data().status !== 'new') throw Object.assign(new Error('taken'), { code: 'taken' });
      tx.update(orderRef(id), Object.assign({}, data, { decidedBy: 'counter', updatedAt: serverTimestamp() }));
    });
    if (okMsg) toast(okMsg); return true;
  } catch (e) {
    toast(e && e.code === 'taken' ? 'The kitchen already handled this order.' : 'That didn\u2019t save. Check your internet and try again.');
    return e && e.code === 'taken';
  } finally { delete S.pending[id]; render(); }
}

/* ---------- Live data ---------- */
let subs = [], daySubs = [], monthUnsub = null, monthSubKey = '', subsDay = '';
function stopDaySubs() { daySubs.forEach(u => { try { u(); } catch (e) {} }); daySubs = []; }
function stopSubs() { subs.forEach(u => { try { u(); } catch (e) {} }); subs = []; stopDaySubs(); if (monthUnsub) { monthUnsub(); monthUnsub = null; monthSubKey = ''; } if (dayBillsUnsub) { dayBillsUnsub(); dayBillsUnsub = null; dayBillsKey = ''; } }
function denied() { stopSubs(); S.phase = 'denied'; render(); }
function dayStart(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function subscribeDay() {
  stopDaySubs();
  subsDay = today(); const start = bizStart(subsDay, S.cafe.settings.dayEndHour);
  let first = true; const prev = new Map();
  daySubs.push(onSnapshot(query(collection(db, 'cafes', S.cafeId, 'orders'), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'asc')), snap => {
    const list = snap.docs.map(d => normOrder(d.id, snapData(d)));
    if (!first) {
      let ring = false;
      list.forEach(o => {
        const was = prev.get(o.id);
        if (!was && o.status === 'new') ring = true;
        if (was === 'new' && o.status === 'cancelled' && o.cancelledBy === 'customer') toast(keyTitle(groupKey(o), o) + ' cancelled their order.');
        if (was === 'preparing' && o.status === 'ready') toast(keyTitle(groupKey(o), o) + ': order is ready to serve.');
        if (was === 'new' && o.status === 'preparing' && o.decidedBy === 'kitchen') toast(keyTitle(groupKey(o), o) + ': the kitchen accepted the order.');
        if (was === 'new' && o.status === 'rejected' && o.decidedBy === 'kitchen') toast(keyTitle(groupKey(o), o) + ': the kitchen rejected the order' + (o.cancelReason ? ' (' + o.cancelReason + ')' : '') + '.');
        // Auto KOT: print once when an order goes to the kitchen (accepted, or typed in at the counter).
        if (o.status === 'preparing' && (!was || was === 'new') && kotAuto.get() && kotPrintedOnce(S.cafeId, o.id)) printKot(o, S.cafe);
      });
      if (ring && S.soundOn) alarm();
    }
    prev.clear(); list.forEach(o => prev.set(o.id, o.status)); first = false;
    S.orders = list;
    render();
    if (S.dialog && S.dialog.type === 'bill' && !S.dialog.busy) renderDialog();
  }, err => { if (err && err.code === 'permission-denied') denied(); else toast('Lost connection. Refresh the page if this stays.'); }));
  daySubs.push(onSnapshot(query(collection(db, 'cafes', S.cafeId, 'bills'), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'desc')), snap => {
    S.bills = snap.docs.map(d => normBill(d.id, snapData(d))); render();
  }, () => {}));
}
// All bills of the month shown in the calendar, kept live.
// The calendar month's daily totals (about 30 small records).
function subscribeMonth(force) {
  const key = S.calMonth;
  if (!force && monthUnsub && monthSubKey === key) return;
  if (monthUnsub) { monthUnsub(); monthUnsub = null; }
  monthSubKey = key; S.monthDays = null;
  monthUnsub = onSnapshot(query(collection(db, 'cafes', S.cafeId, 'days'), where('month', '==', key)), snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); S.monthDays = m; if (S.view === 'bills') render();
  }, () => { S.monthDays = {}; if (S.view === 'bills') render(); });
}
// Bills of the day picked in the calendar. Today's bills are already live in S.bills.
let dayBillsUnsub = null, dayBillsKey = '';
function subscribeDayBills() {
  const k = S.reportDate;
  if (k === today()) { if (dayBillsUnsub) { dayBillsUnsub(); dayBillsUnsub = null; } dayBillsKey = ''; S.dayBills = null; return; }
  if (dayBillsUnsub && dayBillsKey === k) return;
  if (dayBillsUnsub) dayBillsUnsub();
  dayBillsKey = k; S.dayBills = null;
  const h = S.cafe.settings.dayEndHour, [y, mo, d] = k.split('-').map(Number);
  const from = bizStart(k, h), to = bizStart(dayKey(new Date(y, mo - 1, d + 1)), h);
  dayBillsUnsub = onSnapshot(query(collection(db, 'cafes', S.cafeId, 'bills'), where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<', Timestamp.fromDate(to)), orderBy('createdAt', 'desc')), snap => {
    S.dayBills = snap.docs.map(x => normBill(x.id, snapData(x))); if (S.view === 'bills') render();
  }, () => { S.dayBills = []; if (S.view === 'bills') render(); });
}
function dayBills() { return S.reportDate === today() ? S.bills : S.dayBills; }
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset || t.dataset.role !== 'item-photo' || !t.files || !t.files[0]) return;
  const d = S.dialog; if (!d || d.type !== 'item') return;
  syncItemForm(d);
  try { d.photoNew = await processPhoto(t.files[0]); d.err = ''; }
  catch (err) { d.err = err.message === 'big' ? 'That photo is too large (over 15 MB).' : 'Couldn\u2019t read that photo. Use a JPG, PNG or WebP picture.'; }
  t.value = ''; renderDialog();
});

/* ---------- Daily sales totals ---------- */
// Each bill also adds to a small record for its sales day (total, payment split, items, hours).
// The calendar and charts read about 30 of these a month instead of every single bill.
const dayRef = (k) => doc(db, 'cafes', S.cafeId, 'days', k);
const itemKey = (n) => String(n || 'Item').replace(/[.[\]*`~/]/g, ' ').trim().slice(0, 60) || 'Item';
function summaryDelta(b, sign) {
  const k = bizDay(S.cafe.settings.dayEndHour, b.createdAt), hour = String(new Date(b.createdAt).getHours());
  const sums = {};
  b.lines.forEach(l => { const key = itemKey(l.name), x = sums[key] || (sums[key] = { q: 0, a: 0 }); x.q += l.qty; x.a += l.qty * l.price; });
  const items = {};
  Object.keys(sums).forEach(key => { items[key] = { q: increment(sign * sums[key].q), a: increment(sign * sums[key].a) }; });
  const delta = { month: k.slice(0, 7), total: increment(sign * b.total), count: increment(sign), gst: increment(sign * b.gst), discount: increment(sign * b.discount),
    pay: { [b.pay]: increment(sign * b.total) }, hours: { [hour]: increment(sign * b.total) }, items };
  if (sign < 0) delta.voided = increment(1);
  return [k, delta];
}
// One-time setup: build the daily records from bills saved before this feature existed.
// Runs again if the cafe changes the hour its sales day ends.
let summaryBusy = false;
async function ensureSummaries() {
  if (summaryBusy) return; summaryBusy = true;
  const h = S.cafe.settings.dayEndHour, flagRef = doc(db, 'cafes', S.cafeId, 'meta', 'summaries');
  try {
    const flag = await getDoc(flagRef);
    if (flag.exists() && flag.data().v >= 1 && flag.data().h === h) return;
    const [billSnap, daySnap] = await Promise.all([getDocs(collection(db, 'cafes', S.cafeId, 'bills')), getDocs(collection(db, 'cafes', S.cafeId, 'days'))]);
    const days = {};
    billSnap.docs.forEach(d => {
      const b = normBill(d.id, snapData(d)), k = bizDay(h, b.createdAt);
      const x = days[k] || (days[k] = { month: k.slice(0, 7), total: 0, count: 0, gst: 0, discount: 0, voided: 0, pay: {}, hours: {}, items: {} });
      if (b.void) { x.voided++; return; }
      x.total += b.total; x.count++; x.gst += b.gst; x.discount += b.discount; x.pay[b.pay] = (x.pay[b.pay] || 0) + b.total;
      const hr = String(new Date(b.createdAt).getHours()); x.hours[hr] = (x.hours[hr] || 0) + b.total;
      b.lines.forEach(l => { const key = itemKey(l.name), it = x.items[key] || (x.items[key] = { q: 0, a: 0 }); it.q += l.qty; it.a += l.qty * l.price; });
    });
    const ops = Object.keys(days).map(k => [dayRef(k), days[k]]);
    daySnap.docs.forEach(d => { if (!days[d.id]) ops.push([d.ref, null]); });
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach(([ref, data]) => data ? batch.set(ref, data) : batch.delete(ref));
      await batch.commit();
    }
    await setDoc(flagRef, { v: 1, h, at: serverTimestamp() });
  } catch (e) { /* tries again next time the counter opens */ }
  finally { summaryBusy = false; }
}
// "Popular" badges on the customer menu: the 3 best sellers of the last 7 days, worked out once a day.
async function updatePopular() {
  const tk = today();
  if (S.cafe.popularAt === tk) return;
  try {
    const keys = [], [y, m, d] = tk.split('-').map(Number);
    for (let i = 1; i <= 7; i++) keys.push(dayKey(new Date(y, m - 1, d - i)));
    const snaps = await Promise.all(keys.map(k => getDoc(dayRef(k))));
    const qty = {};
    snaps.forEach(sn => { if (!sn.exists()) return; Object.entries(sn.data().items || {}).forEach(([n, v]) => { qty[n] = (qty[n] || 0) + ((v && v.q) || 0); }); });
    const byName = {}; S.cafe.menu.forEach(it => { byName[itemKey(it.name)] = it.id; });
    const popular = Object.entries(qty).filter(([n, q]) => q >= 3 && byName[n]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => byName[n]);
    await updateDoc(cafeRef(), { popular, popularAt: tk });
  } catch (e) { /* not important enough to bother staff about */ }
}

function startCafe() {
  let firstCalls = true; const seen = new Set();
  subs.push(onSnapshot(cafeRef(), snap => {
    if (!snap.exists()) { stopSubs(); S.phase = 'nocafe'; render(); return; }
    S.cafe = cleanCafe(snap.data());
    const h = S.cafe.settings.dayEndHour;
    if (S.phase !== 'ready') {
      S.phase = 'ready'; S.endHour = h; S.reportDate = today(); S.calMonth = S.reportDate.slice(0, 7);
      keepAwake(); subscribeDay(); if (S.view === 'bills') subscribeMonth();
      ensureSummaries().then(updatePopular);
    } else if (h !== S.endHour) {
      S.endHour = h; S.reportDate = today(); S.calMonth = S.reportDate.slice(0, 7);
      subscribeDay(); subscribeDayBills(); ensureSummaries().then(() => { if (monthUnsub) subscribeMonth(true); });
    }
    document.title = S.cafe.name + ' | YUNO';
    render();
  }, () => denied()));
  subs.push(onSnapshot(collection(db, 'cafes', S.cafeId, 'calls'), snap => {
    const list = snap.docs.map(d => { const x = snapData(d) || {}; return { id: d.id, table: parseInt(x.table, 10) || 0, createdAt: toMs(x.createdAt) }; });
    if (!firstCalls && S.soundOn && list.some(c => !seen.has(c.id))) alarm();
    list.forEach(c => seen.add(c.id)); firstCalls = false;
    S.calls = list.sort((a, b) => a.createdAt - b.createdAt); render();
  }, err => { if (err && err.code === 'permission-denied') denied(); }));
}
// When the sales day ends (at the cafe's closing hour), start a fresh day.
setInterval(() => {
  if (S.phase !== 'ready' || today() === subsDay) return;
  const was = subsDay; subscribeDay();
  if (S.reportDate === was) { S.reportDate = subsDay; subscribeDayBills(); }
  updatePopular();
  if (S.calMonth === was.slice(0, 7) && subsDay.slice(0, 7) !== S.calMonth) { S.calMonth = subsDay.slice(0, 7); if (monthUnsub) subscribeMonth(); }
  render();
}, 60000);
let unpaidSeen = new Set();
function checkUnpaid() {
  const now = new Set(unpaidTables().map(u => u.table));
  let fresh = false; now.forEach(t => { if (!unpaidSeen.has(t)) fresh = true; });
  unpaidSeen = now;
  if (fresh && S.soundOn) chime();
}
setInterval(() => { if (S.phase === 'ready') { checkUnpaid(); if (S.view === 'tables' || S.view === 'pos') render(); } }, 30000);
const waiting = () => S.orders.some(o => o.status === 'new') || S.calls.length > 0;
// Ring nonstop while any new order or waiter call is waiting. Each round is 20 seconds and the
// next one starts as soon as it ends, so there's no silent gap. Accept, Reject or Done stops it.
setInterval(() => { if (S.phase === 'ready' && S.soundOn && S.alarmRepeat && waiting() && !alarmPlaying()) alarm(); }, 500);
// Stop ringing as soon as every new order and waiter call has been handled.
setInterval(() => { if (alarmPlaying() && S.phase === 'ready' && !waiting() && !testRinging) stopAlarm(); }, 1000);
let testRinging = false;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.phase === 'ready') keepAwake(); });

onAuthStateChanged(auth, async user => {
  stopSubs();
  S.user = user; S.cafe = null; S.orders = []; S.calls = []; S.bills = []; S.dialog = null; renderDialog();
  if (!user) { S.phase = 'login'; render(); return; }
  S.phase = 'loading'; render();
  let cafeId = (params.get('cafe') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  try {
    const snap = await getDoc(doc(db, 'staffIndex', user.uid));
    const list = snap.exists() && Array.isArray(snap.data().cafes) ? snap.data().cafes.filter(x => typeof x === 'string') : [];
    S.cafeChoices = list;
    const last = ls.get('yumotap:lastCafe', '');
    if (!cafeId) cafeId = last && list.includes(last) ? last : (list[0] || '');
  } catch (e) { S.cafeChoices = []; }
  if (!cafeId) { S.phase = 'nocafe'; render(); return; }
  S.cafeId = cafeId; ls.set('yumotap:lastCafe', cafeId);
  startCafe();
});

/* ---------- Top bar + bottom nav ---------- */
function requests() {
  return S.orders.filter(o => o.status === 'new').length + S.calls.length + unpaidTables().length;
}
function renderChrome() {
  const ready = S.phase === 'ready';
  $('#topbar').hidden = !ready;
  const nav = $('#bottom-nav'); nav.hidden = !ready || S.view === 'pos';
  document.body.classList.toggle('has-bottom-nav', ready && S.view !== 'pos');
  if (!ready) return;
  const req = requests();
  const current = S.view === 'pos' ? 'tables' : S.view;
  const navBtns = VIEWS.map(v => '<button type="button" data-action="view" data-v="' + v + '" aria-current="' + (current === v ? 'page' : 'false') + '">' + ICONS[v] + '<span>' + v[0].toUpperCase() + v.slice(1) + '</span>' + (v === 'tables' && req ? '<b class="nav-badge">' + req + '</b>' : '') + '</button>').join('');
  $('#top-nav').innerHTML = navBtns;
  nav.innerHTML = navBtns;
  $('#top-cafe').innerHTML = (S.cafe.brand.logo ? '<img class="top-logo" src="' + S.cafe.brand.logo + '" alt="">' : '') + esc(S.cafe.name + (S.cafe.acceptingOrders ? '' : ' (orders paused)'));
  $('#top-tools').innerHTML = '<button type="button" class="icon-btn' + (S.soundOn ? '' : ' off') + '" data-action="sound" aria-pressed="' + S.soundOn + '" aria-label="' + (S.soundOn ? 'Sound on. Tap to mute' : 'Sound off. Tap to turn on') + '">' + (S.soundOn ? ICONS.bell : ICONS.mute) + '</button>';
}

/* ---------- Login + notes ---------- */
function loginView() {
  return '<div class="login"><div class="brand">' + BRAND_SVG + 'YUNO</div><h1>Cafe login</h1><p class="lead">Sign in to take orders and print bills.</p>' +
    '<form id="login-form" novalidate><label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username"></label>' +
    '<label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password"></label>' +
    (S.loginErr ? '<p class="err" role="alert">' + esc(S.loginErr) + '</p>' : '') +
    '<button class="btn-primary" type="submit"' + (S.loginBusy ? ' disabled' : '') + '>' + (S.loginBusy ? 'Signing in\u2026' : 'Sign in') + '</button>' +
    '<p class="fine"><button type="button" class="linkbtn" data-action="forgot">Forgot password?</button></p>' +
    '<p class="fine">Can\u2019t sign in? <a href="https://wa.me/919061927047?text=' + encodeURIComponent('Hi YUNO, I can\u2019t sign in to my cafe') + '" target="_blank" rel="noopener">WhatsApp YUNO</a></p></form></div>';
}
function noteView(title, text) {
  return '<div class="center-note panel"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p style="margin-top:16px"><button class="btn-ghost" data-action="signout">Sign out</button></p></div>';
}

/* ---------- Tables (home) ---------- */
function requestsPanel() {
  const news = S.orders.filter(o => o.status === 'new'), unpaid = unpaidTables();
  if (!news.length && !S.calls.length && !unpaid.length) return '';
  const rows = news.map(o => {
    const idA = esc(o.id), dis = S.pending[o.id] ? ' disabled' : '';
    return '<li class="req"><div class="req-main"><b>' + esc(keyTitle(groupKey(o), o)) + '</b><span>New order, ' + plural(itemCount(o), 'item') + ', ' + rupee(orderTotal(o)) + '</span>' +
      '<span class="muted">' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + (o.note ? '. Note: ' + esc(o.note) : '') + '</span></div>' +
      '<div class="req-act"><button type="button" class="b-accept" data-action="accept" data-id="' + idA + '"' + dis + '>Accept</button>' +
      '<button type="button" class="b-reject" data-action="open-cancel" data-id="' + idA + '"' + dis + '>Reject</button></div></li>';
  }).concat(unpaid.map(u => '<li class="req unpaid-row"><div class="req-main"><b>Table ' + u.table + ' hasn\u2019t paid</b>' +
    '<span>Food served ' + u.mins + ' min ago. Bill: ' + rupee(u.amount) + '.</span></div>' +
    '<div class="req-act"><button type="button" class="b-accept" data-action="bill-table" data-t="' + u.table + '">Bill now</button></div></li>'
  )).concat(S.calls.map(c => '<li class="req call-row"><div class="req-main"><b>Table ' + c.table + '</b><span>Calling a waiter, ' + ago(c.createdAt) + '</span></div>' +
    '<div class="req-act"><button type="button" class="btn-ghost" data-action="call-done" data-id="' + esc(c.id) + '">Done</button></div></li>'));
  return '<section class="req-panel" aria-live="polite"><h2>Needs attention <span class="count">' + rows.length + '</span></h2><ul>' + rows.join('') + '</ul>' +
    '<p class="fine left">Accepted orders go to the kitchen screen, ready in ' + S.cafe.settings.prepMins + ' min. Change the time from the table.</p></section>';
}
function tileState(key) {
  const os = openOrders(key);
  const tableNo = key.startsWith('t:') ? parseInt(key.slice(2), 10) : 0;
  const calling = tableNo && S.calls.some(c => c.table === tableNo);
  let state = 'free';
  if (os.some(o => o.status === 'new') || calling) state = 'new';
  else if (os.some(o => o.status === 'ready')) state = 'ready';
  else if (os.length) state = 'run';
  const amount = os.filter(o => o.status !== 'new').reduce((s, o) => s + orderTotal(o), 0);
  const since = os.length ? Math.min(...os.map(o => o.createdAt)) : 0;
  const label = state === 'new' ? (calling && !os.some(o => o.status === 'new') ? 'Calling' : 'New order') : state === 'ready' ? 'Ready' : state === 'run' ? ago(since).replace(' ago', '') : 'Free';
  if (state !== 'new') { const u = unpaidInfo(key); if (u) return { state: 'unpaid', amount, label: 'Not paid, ' + u.mins + ' min', count: os.length }; }
  return { state, amount, label, count: os.length };
}
function tablesView() {
  const c = S.cafe;
  let tiles = '';
  for (let n = 1; n <= c.tables; n++) {
    const t = tileState('t:' + n);
    tiles += '<button type="button" class="ttile t-' + t.state + '" data-action="open-table" data-t="' + n + '" aria-label="Table ' + n + ', ' + t.label + (t.amount ? ', ' + rupee(t.amount) : '') + '">' +
      '<span class="tile-num">' + n + '</span><span class="tile-amt">' + (t.amount ? rupee(t.amount) : '') + '</span><span class="tile-tag">' + esc(t.label) + '</span></button>';
  }
  const other = [...new Set(S.orders.filter(o => o.type !== 'table' && !o.billId && ['preparing', 'ready', 'served'].includes(o.status)).map(groupKey))];
  const otherTiles = other.map(k => {
    const t = tileState(k), sample = openOrders(k)[0];
    return '<button type="button" class="ttile wide t-' + t.state + '" data-action="open-group" data-k="' + esc(k) + '"><span class="tile-num sm">' + esc(keyTitle(k, sample)) + '</span><span class="tile-amt">' + rupee(t.amount) + '</span><span class="tile-tag">' + esc(t.label) + '</span></button>';
  }).join('');
  return '<div class="wrap page">' + (S.soundOn && !audioReady() ? '<button type="button" class="sound-banner" data-action="unlock">Tap here to turn on the order alarm</button>' : '') +
    requestsPanel() +
    '<section><div class="sec-head"><h2>Tables</h2><div class="legend"><span class="lg free">Free</span><span class="lg run">Running</span><span class="lg ready">Ready</span><span class="lg new">New</span><span class="lg unpaid">Not paid</span></div></div>' +
    '<div class="tile-grid">' + tiles + '</div></section>' +
    '<section><div class="sec-head"><h2>Parcel and counter</h2></div><div class="tile-grid">' +
    '<button type="button" class="ttile add" data-action="new-group" data-type="parcel"><span class="tile-plus">+</span><span class="tile-tag">New parcel</span></button>' +
    '<button type="button" class="ttile add" data-action="new-group" data-type="counter"><span class="tile-plus">+</span><span class="tile-tag">Counter sale</span></button>' +
    otherTiles + '</div></section></div>';
}

/* ---------- Order screen (POS) ---------- */
function draftFor(key) { if (!S.drafts[key]) S.drafts[key] = { items: [], note: '', name: '' }; return S.drafts[key]; }
function openPos(key, type, table) {
  S.pos = { key, type, table: table || 0 }; S.view = 'pos'; S.posSearch = ''; S.posCat = 'all'; S.cartOpen = false;
  render(); window.scrollTo(0, 0);
}
function posItems() {
  const c = S.cafe, d = draftFor(S.pos.key), q = S.posSearch.trim().toLowerCase();
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
function runningHtml(os) {
  if (!os.length) return '';
  return '<div class="cart-sec"><p class="cart-h">Sent orders</p>' + os.map(o => {
    const idA = esc(o.id), dis = S.pending[o.id] ? ' disabled' : '';
    let extra = '';
    if (o.status === 'new') {
      const pick = S.acceptMins[o.id] || S.cafe.settings.prepMins;
      const times = TIMES.includes(pick) ? TIMES : TIMES.concat([pick]).sort((a, b) => a - b);
      extra = '<div class="pending-box"><p><b>Customer order waiting.</b> Ready in:</p><div class="chips">' + times.map(m => '<button type="button" class="chip" data-action="pick-time" data-id="' + idA + '" data-m="' + m + '" aria-pressed="' + (m === pick) + '">' + m + ' min</button>').join('') + '</div>' +
        '<div class="t-act"><button type="button" class="b-accept" data-action="accept" data-id="' + idA + '"' + dis + '>Accept</button><button type="button" class="b-reject" data-action="open-cancel" data-id="' + idA + '"' + dis + '>Reject</button></div></div>';
    } else if (o.status === 'preparing') {
      const m = minsLeft(o);
      extra = '<div class="ro-foot"><span class="' + (m !== null && m < 0 ? 'late' : '') + '">' + (m === null ? '' : m > 0 ? 'Ready in ' + m + ' min' : m === 0 ? 'Due now' : 'Late by ' + (-m) + ' min') + '</span>' +
        '<button type="button" class="mini" data-action="time" data-d="5" data-id="' + idA + '"' + dis + '>+5 min</button><button type="button" class="mini" data-action="set" data-st="ready" data-id="' + idA + '"' + dis + '>Mark ready</button></div>';
    } else if (o.status === 'ready') {
      extra = '<div class="ro-foot"><span class="ok">Ready to serve</span><button type="button" class="mini" data-action="set" data-st="served" data-id="' + idA + '"' + dis + '>Served</button></div>';
    }
    return '<div class="ro s-' + o.status + '"><div class="ro-top"><span class="st-chip s-' + o.status + '">' + STATUS_CHIP[o.status] + '</span><span class="muted">' + shortCode(o.id) + ', ' + fmtTime(o.createdAt) + '</span>' +
      '<button type="button" class="dots" data-action="order-menu" data-id="' + idA + '" aria-label="Order options">\u22EF</button></div>' +
      '<ul class="ro-lines">' + o.items.map(i => '<li><span>' + i.qty + '\u00D7 ' + esc(i.name) + '</span><span>' + rupee(i.qty * i.price) + '</span></li>').join('') + '</ul>' +
      (o.note ? '<p class="t-note">Note: ' + esc(o.note) + '</p>' : '') + extra + '</div>';
  }).join('') + '</div>';
}
function cartHtml() {
  const key = S.pos.key, d = draftFor(key), os = openOrders(key);
  const draftTotal = d.items.reduce((s, i) => s + i.qty * i.price, 0);
  const billTotal = os.filter(o => o.status !== 'new').reduce((s, o) => s + orderTotal(o), 0);
  const nameField = S.pos.type !== 'table' ? '<label class="field cart-name"><span>Customer name</span><input class="input" id="draft-name" data-key="draft-name" maxlength="40" value="' + esc(d.name || (os[0] ? os[0].name : '')) + '" placeholder="Optional"></label>' : '';
  const draft = d.items.length
    ? '<div class="cart-sec"><p class="cart-h">New items</p><ul class="lines">' + d.items.map(i => '<li class="line"><span class="line-name">' + esc(i.name) + '</span>' +
      '<div class="step step-sm"><button type="button" data-action="dec" data-id="' + esc(i.id) + '" data-key="dec-' + esc(i.id) + '" aria-label="Remove one ' + esc(i.name) + '">\u2212</button><span>' + i.qty + '</span><button type="button" data-action="add" data-id="' + esc(i.id) + '" data-key="inc-' + esc(i.id) + '" aria-label="Add one more ' + esc(i.name) + '">+</button></div>' +
      '<span class="line-price">' + rupee(i.qty * i.price) + '</span></li>').join('') + '</ul>' +
      '<textarea id="draft-note" data-key="draft-note" maxlength="200" placeholder="Note for the kitchen (optional)">' + esc(d.note) + '</textarea></div>'
    : (os.length ? '' : '<p class="empty cart-empty">Tap items on the left to start an order.</p>');
  const foot = '<div class="cart-foot">' +
    (d.items.length ? '<button type="button" class="btn-primary" data-action="send">Send to kitchen, ' + rupee(draftTotal) + '</button>' : '') +
    (billTotal && !d.items.length ? '<p class="qb-h">One tap: save and print the bill, ' + rupee(quickTotal(key)) + '</p><div class="qb-row">' + PAY.map(([k, l]) => '<button type="button" class="qb" data-action="quick-bill" data-p="' + k + '"' + (S.quickBusy ? ' disabled' : '') + '>' + l + '</button>').join('') + '</div>' : '') +
    (billTotal ? '<button type="button" class="btn-bill' + (d.items.length ? ' secondary' : ' quiet') + '" data-action="bill-pos">' + (d.items.length ? 'Bill ' + rupee(billTotal) : 'Discount, GST or split bill') + '</button>' : '') + '</div>';
  return '<div class="cart-head"><div><h2>' + esc(keyTitle(key)) + '</h2><p class="muted">' + (os.length ? plural(os.length, 'order') + ' open' : 'No orders yet') + '</p></div>' +
    (os.length ? '<button type="button" class="btn-ghost" data-action="pos-menu">More</button>' : '') +
    '<button type="button" class="x cart-close" data-action="cart-close" aria-label="Close order">\u2715</button></div>' +
    '<div class="cart-body">' + nameField + runningHtml(os) + draft + '</div>' + foot;
}
function posView() {
  const key = S.pos.key, d = draftFor(key), os = openOrders(key);
  const count = d.items.reduce((s, i) => s + i.qty, 0);
  const total = d.items.reduce((s, i) => s + i.qty * i.price, 0) + os.filter(o => o.status !== 'new').reduce((s, o) => s + orderTotal(o), 0);
  const waiting = os.some(o => o.status === 'new');
  return '<div class="pos-bar wrap"><button type="button" class="back" data-action="view" data-v="tables">' + ICONS.back + 'Tables</button><h1>' + esc(keyTitle(key)) + '</h1></div>' +
    '<div class="pos' + (S.cartOpen ? ' cart-open' : '') + '">' + posItems() + '<aside class="pos-cart" aria-label="Order">' + cartHtml() + '</aside></div>' +
    '<button type="button" class="cart-bar' + (waiting ? ' alert' : '') + '" data-action="cart-open"><span>' + (waiting ? 'Customer order waiting' : count ? plural(count, 'new item') : plural(os.length, 'order')) + '</span><b>' + rupee(total) + '</b><span class="cb-go">View order</span></button>';
}

/* ---------- Bills view ---------- */
function reportData(bills) {
  const ok = bills.filter(b => !b.void);
  const r = { count: ok.length, total: 0, gst: 0, discount: 0, pay: { cash: 0, upi: 0, card: 0 }, items: new Map(), voided: bills.length - ok.length };
  ok.forEach(b => {
    r.total += b.total; r.gst += b.gst; r.discount += b.discount; r.pay[b.pay] += b.total;
    b.lines.forEach(l => { const x = r.items.get(l.name) || { qty: 0, amt: 0 }; x.qty += l.qty; x.amt += l.qty * l.price; r.items.set(l.name, x); });
  });
  r.top = [...r.items.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  return r;
}
function billsList(bills) {
  if (!bills.length) return '<p class="empty">No bills yet.</p>';
  return '<ul class="bill-rows">' + bills.map(b => '<li class="' + (b.void ? 'is-void' : '') + '"><span class="br-no">#' + b.billNo + '</span><span class="br-main"><b>' + esc(b.label) + '</b><span class="muted">' + fmtTime(b.createdAt) + ', ' + (b.void ? 'cancelled' : PAY.find(p => p[0] === b.pay)[1]) + '</span></span>' +
    '<span class="br-amt">' + rupee(b.total) + '</span><button type="button" class="dots" data-action="bill-menu" data-id="' + esc(b.id) + '" aria-label="Bill options">\u22EF</button></li>').join('') + '</ul>';
}
// Close the day picker. If the person browsed to another month without picking, go back to the shown day's month.
function closeCal() {
  S.calOpen = false;
  const mk = S.reportDate.slice(0, 7);
  if (S.calMonth !== mk) { S.calMonth = mk; subscribeMonth(); }
}
function dayTitle(k) {
  if (k === today()) return 'Today';
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}
// A small calendar icon next to the day title. Tapping it opens a compact month picker.
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
function calPopHtml() {
  const mk = S.calMonth, [y, m] = mk.split('-').map(Number), tk = today(), h = S.cafe.settings.dayEndHour;
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = (first.getDay() + 6) % 7;
  const totals = {}; let monthTotal = 0;
  Object.entries(S.monthDays || {}).forEach(([k, d]) => { const t = Math.round((d && d.total) || 0); if (t > 0) { totals[k] = t; monthTotal += t; } });
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
  for (let d = 1; d <= days; d++) {
    const k = mk + '-' + String(d).padStart(2, '0'), amt = totals[k] || 0;
    const label = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + (amt ? rupee(amt) : 'no sales');
    cells += '<button type="button" class="cp-day' + (amt ? ' has-sales' : '') + (k === S.reportDate ? ' is-sel' : '') + (k === tk ? ' is-today' : '') + '" data-action="pick-day" data-day="' + k + '" aria-pressed="' + (k === S.reportDate) + '" aria-label="' + esc(label) + '"' + (k > tk ? ' disabled' : '') + '>' + d + '</button>';
  }
  return '<div class="cal-pop" role="dialog" aria-label="Pick a day"><div class="cp-head"><button type="button" class="icon-btn sm" data-action="cal-prev" aria-label="Previous month">' + ICONS.back + '</button>' +
    '<b>' + first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) + '</b>' +
    '<button type="button" class="icon-btn sm cal-next" data-action="cal-next" aria-label="Next month"' + (mk >= tk.slice(0, 7) ? ' disabled' : '') + '>' + ICONS.back + '</button></div>' +
    '<div class="cp-week" aria-hidden="true">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(w => '<span>' + w + '</span>').join('') + '</div>' +
    '<div class="cp-grid">' + cells + '</div>' +
    '<p class="cp-foot"><span>' + first.toLocaleDateString('en-IN', { month: 'long' }) + ' total</span><b>' + (S.monthDays ? rupee(monthTotal) : '\u2026') + '</b></p>' +
    '<p class="cp-note">Green dot: had sales. Each day runs until ' + hourLabel(h) + '.</p></div>';
}
// Sales charts for the month shown in the calendar, built from the daily records (no extra reads).
const hourName = (h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
function barsHtml(rows, peakText) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return '<div class="bars" role="img" aria-label="' + esc(peakText) + '">' + rows.map(([label, v, hot]) =>
    '<div class="bar' + (hot ? ' hot' : '') + '"><i style="height:' + Math.max(3, Math.round(v / max * 100)) + '%"></i><span>' + esc(label) + '</span></div>').join('') + '</div>';
}
function insightsHtml() {
  const days = S.monthDays; if (!days) return '';
  const keys = Object.keys(days).filter(k => (days[k].total || 0) > 0);
  if (!keys.length) return '';
  const h0 = S.cafe.settings.dayEndHour, hours = {}, items = {}, wk = [0, 0, 0, 0, 0, 0, 0], wkN = [0, 0, 0, 0, 0, 0, 0];
  keys.forEach(k => {
    const d = days[k];
    Object.entries(d.hours || {}).forEach(([hr, v]) => { hours[hr] = (hours[hr] || 0) + (Number(v) || 0); });
    Object.entries(d.items || {}).forEach(([n, v]) => { const it = items[n] || (items[n] = { q: 0, a: 0 }); it.q += (v && v.q) || 0; it.a += (v && v.a) || 0; });
    const [y, m, dd] = k.split('-').map(Number), w = (new Date(y, m - 1, dd).getDay() + 6) % 7; wk[w] += d.total; wkN[w]++;
  });
  // Hours in business order: the day starts at the closing hour, so 1 AM sits after 11 PM.
  const hrs = Object.keys(hours).map(Number).filter(h => hours[h] > 0).sort((a, b) => ((a - h0 + 24) % 24) - ((b - h0 + 24) % 24));
  let hourBlock = '';
  if (hrs.length) {
    const first = hrs[0], last = hrs[hrs.length - 1], span = [];
    for (let h = first; ; h = (h + 1) % 24) { span.push(h); if (h === last || span.length > 24) break; }
    const peak = span.reduce((p, h) => (hours[h] || 0) > (hours[p] || 0) ? h : p, span[0]);
    const peakText = 'Busiest: ' + hourName(peak) + ' to ' + hourName((peak + 1) % 24);
    hourBlock = '<section class="panel-lite chart"><h3>Busiest hours</h3><p class="muted chart-sub">' + peakText + '</p>' +
      barsHtml(span.map(h => [h % 12 || 12, hours[h] || 0, h === peak]), peakText) + '</section>';
  }
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], avg = wk.map((v, i) => wkN[i] ? v / wkN[i] : 0);
  const best = avg.indexOf(Math.max(...avg)), slow = avg.reduce((p, v, i) => (v > 0 && (avg[p] === 0 || v < avg[p])) ? i : p, best);
  const wkText = 'Best day: ' + names[best] + (slow !== best ? '. Slowest: ' + names[slow] : '');
  const wkBlock = '<section class="panel-lite chart"><h3>Average sales by day</h3><p class="muted chart-sub">' + wkText + '</p>' +
    barsHtml(names.map((n, i) => [n, avg[i], i === best]), wkText) + '</section>';
  const top = Object.entries(items).sort((a, b) => b[1].q - a[1].q).slice(0, 5), topMax = Math.max(1, ...top.map(t => t[1].q));
  const topBlock = '<section class="panel-lite chart"><h3>Best sellers</h3><p class="muted chart-sub">This month so far</p><ul class="hbars">' +
    top.map(([n, x]) => '<li><span class="hb-name">' + esc(n) + '</span><span class="hb-track"><i style="width:' + Math.round(x.q / topMax * 100) + '%"></i></span><b>' + x.q + '</b></li>').join('') + '</ul></section>';
  const [y, m] = S.calMonth.split('-').map(Number);
  return '<div class="sec-head"><h2>' + new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long' }) + ' at a glance</h2></div><div class="charts">' + hourBlock + wkBlock + topBlock + '</div>';
}
// How long tables waited for their food today: from ordering until it was ready.
function waitHtml() {
  const now = Date.now(), list = S.orders.filter(o => ['preparing', 'ready', 'served'].includes(o.status)).map(o => {
    const end = o.readyAt || (o.status === 'preparing' ? now : 0);
    return end ? { o, mins: Math.max(0, Math.round((end - o.createdAt) / 60000)), cooking: o.status === 'preparing' } : null;
  }).filter(Boolean);
  if (!list.length) return '';
  const done = list.filter(x => !x.cooking), avg = done.length ? Math.round(done.reduce((s, x) => s + x.mins, 0) / done.length) : null;
  const top = list.sort((a, b) => b.mins - a.mins).slice(0, 5);
  return '<section class="panel-lite wait-card"><h3>Waiting times today</h3>' +
    (avg !== null ? '<p class="wait-avg"><b>' + avg + ' min</b> average from order to ready</p>' : '') +
    '<ul class="bill-rows">' + top.map(x => '<li><span class="br-main"><b>' + esc(keyTitle(groupKey(x.o), x.o)) + '</b><span class="muted">' + (x.cooking ? 'Still cooking' : 'Ready at ' + fmtTime(x.o.readyAt)) + '</span></span>' +
      '<span class="br-amt' + (x.mins >= 25 ? ' wait-long' : '') + '">' + x.mins + ' min</span></li>').join('') + '</ul></section>';
}
function billsView() {
  const isToday = S.reportDate === today(), bills = dayBills();
  let main;
  if (!bills) main = '<div class="sec-head day-head"><div class="day-pick"><h3>' + esc(dayTitle(S.reportDate)) + '</h3>' +
    '<button type="button" class="icon-btn cal-btn' + (S.calOpen ? ' on' : '') + '" data-action="cal-toggle" aria-label="Pick a day" aria-expanded="' + !!S.calOpen + '">' + CAL_ICON + '</button>' +
    (S.calOpen ? calPopHtml() : '') + '</div></div><p class="empty">Loading\u2026</p>';
  else {
    const r = reportData(bills);
    main = '<div class="sec-head day-head"><div class="day-pick"><h3>' + esc(dayTitle(S.reportDate)) + '</h3>' +
      '<button type="button" class="icon-btn cal-btn' + (S.calOpen ? ' on' : '') + '" data-action="cal-toggle" aria-label="Pick a day" aria-expanded="' + !!S.calOpen + '">' + CAL_ICON + '</button>' +
      (S.calOpen ? calPopHtml() : '') + '</div><button type="button" class="btn-ghost" data-action="print-report">Print day report</button></div>' +
      '<div class="rep-grid"><div class="rep-card big"><span class="stat-label">' + (isToday ? 'Today\u2019s sales' : 'Total sales') + '</span><span class="stat-num">' + rupee(r.total) + '</span><span class="stat-label">' + plural(r.count, 'bill') + (r.voided ? ', ' + r.voided + ' cancelled' : '') + '</span></div>' +
      PAY.map(([k, l]) => '<div class="rep-card"><span class="stat-label">' + l + '</span><span class="stat-num">' + rupee(r.pay[k]) + '</span></div>').join('') +
      '<div class="rep-card"><span class="stat-label">GST</span><span class="stat-num">' + rupee(r.gst) + '</span></div>' +
      '<div class="rep-card"><span class="stat-label">Discounts</span><span class="stat-num">' + rupee(r.discount) + '</span></div></div>' +
      '<div class="rep-cols"><section class="panel-lite"><h3>Bills</h3>' + billsList(bills) + '</section>' +
      '<section class="panel-lite"><h3>Top items</h3>' + (r.top.length ? '<ul class="bill-rows">' + r.top.map(([n, x]) => '<li><span class="br-main"><b>' + esc(n) + '</b><span class="muted">' + x.qty + ' sold</span></span><span class="br-amt">' + rupee(x.amt) + '</span></li>').join('') + '</ul>' : '<p class="empty">No sales on this day.</p>') + '</section></div>';
  }
  return '<div class="wrap page"><div class="sec-head"><h2>Bills and sales</h2></div><div class="sales-main">' + main + (isToday ? waitHtml() : '') + insightsHtml() + '</div></div>';
}

/* ---------- Menu view ---------- */
function menuView() {
  const c = S.cafe;
  let h = '<div class="wrap page"><div class="sec-head"><h2>Menu</h2><button type="button" class="btn-ghost" data-action="add-cat">Add category</button></div>' +
    '<p class="muted" style="margin:-4px 0 14px">Switch an item off when it runs out. It shows as sold out everywhere right away.</p>';
  if (!c.categories.length) return h + '<p class="empty">No categories yet. Add one to start your menu.</p></div>';
  return h + '<div class="madmin">' + c.categories.map(cat => {
    const items = c.menu.filter(m => m.cat === cat.id);
    return '<section><h3 class="cat-h">' + esc(cat.name) + '<button type="button" class="btn-ghost" data-action="edit-cat" data-id="' + esc(cat.id) + '">Rename</button></h3>' +
      '<ul class="mlist">' + (items.length ? items.map(m =>
        '<li><span class="vegmark' + (m.veg ? '' : ' nonveg') + '" role="img" aria-label="' + (m.veg ? 'Vegetarian' : 'Non-vegetarian') + '"></span>' +
        '<button type="button" class="m-name linkish" data-action="edit-item" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button><span class="m-price">' + rupee(m.price) + '</span>' +
        '<button type="button" class="sw" role="switch" aria-checked="' + m.available + '" aria-label="' + esc(m.name) + ' available" data-action="toggle-item" data-id="' + esc(m.id) + '"></button></li>').join('')
        : '<li style="display:block"><span class="empty">No items yet.</span></li>') + '</ul>' +
      '<button type="button" class="m-add" data-action="add-item" data-cat="' + esc(cat.id) + '">+ Add item</button></section>';
  }).join('') + '</div></div>';
}

/* ---------- Settings view ---------- */
function qrSvg(text) {
  if (typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
// This link format works on any hosting with no special settings, so printed QR codes keep working.
function tableLink(n) { return S.qrBase.replace(/\/+$/, '') + '/menu.html?cafe=' + S.cafeId + '&table=' + n; }
function kitchenLink() { return location.origin + '/kitchen?cafe=' + S.cafeId; }
function qrCards() {
  let h = '';
  for (let n = 1; n <= S.cafe.tables; n++) h += '<div class="qr-card">' + (S.cafe.brand.logo ? '<img class="qr-logo" src="' + S.cafe.brand.logo + '" alt="">' : '') + '<p class="qr-cafe">' + esc(S.cafe.name) + '</p><p class="qr-table">Table ' + n + '</p>' + qrSvg(tableLink(n)) + '<p class="qr-scan">Scan to see the menu and order</p><p class="qr-by">YUNO</p></div>';
  return h;
}
function settingsView() {
  const c = S.cafe, st = c.settings;
  return '<div class="wrap page settings-page"><h2 class="page-h">Settings</h2>' +
    '<section class="panel-lite"><h3>Phone orders and sound</h3>' +
    '<div class="set-row"><p><b>Take orders from table QR codes</b><br><span class="muted">' + (c.acceptingOrders ? 'On. Customers can order from their phones.' : 'Paused. Customers can see the menu but can\u2019t order.') + '</span></p><button type="button" class="sw" role="switch" aria-checked="' + c.acceptingOrders + '" aria-label="Take phone orders" data-action="toggle-accepting"></button></div>' +
    '<div class="set-row"><p><b>Ring nonstop until handled</b><br><span class="muted">Keeps ringing until every new order is accepted or rejected and every waiter call is cleared. If off, it rings once for 20 seconds. On this device.</span></p><button type="button" class="sw" role="switch" aria-checked="' + S.alarmRepeat + '" aria-label="Ring nonstop until handled" data-action="toggle-repeat"></button></div>' +
    '<button type="button" class="btn-ghost" data-action="test-alarm">Play the alarm (20 seconds)</button></section>' +
    '<section class="panel-lite"><h3>Kitchen screen</h3><p class="muted">Open this link on the kitchen tablet or phone and sign in with a staff login. Accepted orders show up there.</p>' +
    '<p class="qr-link">' + esc(kitchenLink()) + '</p><div class="row-btns"><button type="button" class="btn-ghost" data-action="copy-kitchen">Copy link</button><a class="btn-ghost" href="' + esc(kitchenLink()) + '" target="_blank" rel="noopener">Open</a></div></section>' +
    '<form id="settings-form" class="panel-lite" novalidate><h3>Cafe and bill details</h3>' +
    '<div class="row"><label class="field"><span>Cafe name</span><input class="input" name="name" maxlength="60" value="' + esc(c.name) + '"></label>' +
    '<label class="field"><span>Number of tables</span><input class="input" name="tables" type="number" min="1" max="100" value="' + c.tables + '"></label></div>' +
    '<div class="row"><label class="field"><span>Usual preparation time (min)</span><input class="input" name="prepMins" type="number" min="1" max="120" value="' + st.prepMins + '"></label>' +
    '<label class="field"><span>GST %</span><input class="input" name="gstPct" type="number" min="0" max="28" step="0.5" value="' + st.gstPct + '"><small>0 if you don\u2019t charge GST</small></label></div>' +
    '<label class="field"><span>Address on bill</span><input class="input" name="address" maxlength="120" value="' + esc(st.address) + '"></label>' +
    '<div class="row"><label class="field"><span>Phone on bill</span><input class="input" name="phone" maxlength="30" value="' + esc(st.phone) + '"></label>' +
    '<label class="field"><span>GSTIN</span><input class="input" name="gstin" maxlength="20" value="' + esc(st.gstin) + '" placeholder="Leave empty if none"></label></div>' +
    '<div class="row"><label class="field"><span>Bill printer paper</span><select name="paper"><option value="80"' + (st.paper === '80' ? ' selected' : '') + '>80 mm</option><option value="58"' + (st.paper === '58' ? ' selected' : '') + '>58 mm</option></select></label>' +
    '<label class="field"><span>Message on bill</span><input class="input" name="footer" maxlength="80" value="' + esc(st.footer) + '"></label></div>' +
    '<h3 class="form-sub">Sales day and unpaid tables</h3>' +
    '<div class="row"><label class="field"><span>Sales day ends at</span><select name="dayEndHour">' + [0, 1, 2, 3, 4, 5, 6].map(h => '<option value="' + h + '"' + (st.dayEndHour === h ? ' selected' : '') + '>' + (h === 0 ? '12 AM (midnight)' : h + ' AM') + '</option>').join('') + '</select><small>Pick a time after you close. Late-night sales then count for the right day.</small></label>' +
    '<label class="field"><span>Warn if a table hasn\u2019t paid after</span><select name="unpaidMins">' + [0, 10, 15, 20, 30, 45, 60].map(m => '<option value="' + m + '"' + (st.unpaidMins === m ? ' selected' : '') + '>' + (m ? m + ' minutes' : 'Don\u2019t warn') + '</option>').join('') + '</select><small>Counted from when the food is ready or served.</small></label></div>' +
    (c.games ? '<h3 class="form-sub">Games and prizes</h3>' +
    '<div class="row"><label class="field"><span>Prize for the #1 player</span><input class="input" name="prize" maxlength="60" value="' + esc(st.prize) + '" placeholder="Like Free masala tea"><small>Customers see it in the games. Leave empty for no prize.</small></label>' +
    '<label class="field"><span>Leaderboard starts fresh</span><select name="lbPeriod"><option value="day"' + (st.lbPeriod !== 'week' ? ' selected' : '') + '>Every day, at closing time</option><option value="week"' + (st.lbPeriod === 'week' ? ' selected' : '') + '>Every week, on Monday</option></select><small>Whoever is #1 when it starts fresh wins the prize.</small></label></div>' : '') +
    '<div class="row-btns"><button class="btn-primary inline" type="submit"' + (S.savingSettings ? ' disabled' : '') + '>' + (S.savingSettings ? 'Saving\u2026' : 'Save') + '</button><button type="button" class="btn-ghost" data-action="test-print">Print a test bill</button></div>' +
    '<p class="fine left">Printing: pick your bill printer, set Margins to None, and turn off Headers and footers. The browser remembers it.</p></form>' +
    (c.games ? lbPanelHtml() : '') +
    '<section class="panel-lite"><h3>Kitchen tickets (KOT)</h3><p class="muted" style="margin-bottom:12px">A KOT is a small slip for the cook: table, items and quantities in big letters, no prices. It uses the same printer and paper size as your bills.</p>' +
    '<div class="kot-set"><div><b>Print KOT automatically</b><small>On this device only. Prints once when an order is accepted or sent to the kitchen.</small></div>' +
    '<button type="button" class="sw" role="switch" aria-checked="' + kotAuto.get() + '" aria-label="Print KOT automatically" data-action="kot-auto"></button></div>' +
    '<div class="row-btns"><button type="button" class="btn-ghost" data-action="test-kot">Print a test KOT</button></div>' +
    '<p class="fine left">To print one KOT by hand, open a table, tap \u22EF on the order, then Print KOT. To print with no pop-up window, YUNO can set up Chrome on this computer for silent printing.</p></section>' +
    '<section class="panel-lite"><h3>Table QR codes</h3><label class="field"><span>Website address inside the codes</span><input class="input" id="qr-base" data-key="qr-base" value="' + esc(S.qrBase) + '" inputmode="url" autocomplete="off"><small>Set this to your own domain before printing real stickers. Printed codes can\u2019t change.</small></label>' +
    '<p class="qr-link">Table 1 opens: <span id="qr-sample">' + esc(tableLink(1)) + '</span></p><button type="button" class="btn-primary inline" data-action="print-qr">Print QR codes for ' + plural(c.tables, 'table') + '</button></section>' +
    '<section class="panel-lite help-box"><h3>Need help?</h3><p class="muted" style="margin-bottom:12px">Message YUNO on WhatsApp. Send a photo of the screen and we\u2019ll sort it out. \u0D38\u0D39\u0D3E\u0D2F\u0D02 \u0D35\u0D47\u0D23\u0D4B? WhatsApp \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42.</p>' +
    '<a class="btn-primary inline wa-help" target="_blank" rel="noopener" href="https://wa.me/919061927047?text=' + encodeURIComponent('Hi YUNO, I need help with ' + (S.cafe ? S.cafe.name : 'my cafe')) + '">WhatsApp YUNO: +91 90619 27047</a></section>' +
    '<section class="panel-lite"><h3>Account</h3><p class="muted" style="margin-bottom:10px">Signed in as ' + esc(S.user && S.user.email) + '</p>' +
    (S.cafeChoices.length > 1 ? '<label class="field"><span>Cafe</span><select data-action-change="switch-cafe">' + S.cafeChoices.map(id => '<option value="' + esc(id) + '"' + (id === S.cafeId ? ' selected' : '') + '>' + esc(id) + '</option>').join('') + '</select></label>' : '') +
    '<button type="button" class="btn-ghost" data-action="signout">Sign out</button></section></div>';
}

/* ---------- Render ---------- */
function render() {
  withFocus(() => {
    renderChrome();
    const app = $('#app');
    if (S.phase === 'auth' || S.phase === 'loading') { app.innerHTML = '<div class="center-note"><p>Loading\u2026</p></div>'; return; }
    if (S.phase === 'login') { if (!app.querySelector('#login-form') || S.loginRerender) { app.innerHTML = loginView(); S.loginRerender = false; } return; }
    if (S.phase === 'nocafe') { app.innerHTML = noteView('No cafe linked yet', 'This login (' + (S.user ? S.user.email : '') + ') isn\u2019t linked to a cafe. Ask YUNO to add you.'); return; }
    if (S.phase === 'denied') { app.innerHTML = noteView('No access', 'This login can\u2019t open \u201C' + S.cafeId + '\u201D. Check the link, or ask YUNO to add you.'); return; }
    if (S.view === 'settings' && S.settingsDirty && app.querySelector('#settings-form')) return;
    if (S.view === 'pos' && !S.pos) S.view = 'tables';
    const scroller = app.querySelector('.ptile-grid'), cartBody = app.querySelector('.cart-body');
    const keep = S.view === 'pos' ? { g: scroller ? scroller.scrollTop : 0, c: cartBody ? cartBody.scrollTop : 0 } : null;
    app.innerHTML = ({ tables: tablesView, pos: posView, bills: billsView, menu: menuView, settings: settingsView }[S.view])();
    if (keep) { const g = app.querySelector('.ptile-grid'), cb = app.querySelector('.cart-body'); if (g) g.scrollTop = keep.g; if (cb) cb.scrollTop = keep.c; }
  });
}

/* ---------- Dialogs ---------- */
let dlgAnim = false;
function shell(title, body, wide) {
  return '<div class="overlay center' + (dlgAnim ? ' anim' : '') + '" data-action="close-bg"><div class="sheet' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dlg-h"><div class="grabber" aria-hidden="true"></div>' +
    '<div class="sheet-top"><h2 id="dlg-h" tabindex="-1">' + esc(title) + '</h2><button type="button" class="x" data-action="close" aria-label="Close">\u2715</button></div>' + body + '</div></div>';
}
const errHtml = (d) => d.err ? '<p class="err" role="alert">' + esc(d.err) + '</p>' : '';
function actionsDialog(d) {
  return shell(d.title, '<div class="action-list">' + d.items.map(([act, label, extra, danger]) => '<button type="button" class="' + (danger ? 'danger' : '') + '" data-action="' + act + '"' + (extra || '') + '>' + esc(label) + '</button>').join('') + '</div>');
}
function tablePickDialog(d) {
  let b = '';
  for (let i = 1; i <= S.cafe.tables; i++) {
    const busy = openOrders('t:' + i).length > 0, self = S.pos && S.pos.key === 't:' + i;
    if (d.mode === 'merge' && (!busy || self)) continue;
    b += '<button type="button" data-action="pick-table" data-t="' + i + '"' + (self ? ' disabled' : '') + ' class="' + (busy ? 'busy' : '') + '">' + i + '</button>';
  }
  const sub = d.mode === 'merge' ? 'Pick a table. Its open orders move here, so you can bill them together.' : 'Pick the new table. Busy tables are marked, and moving there joins their bill.';
  return shell(d.mode === 'merge' ? 'Merge a table into ' + keyTitle(S.pos.key) : 'Move to another table', '<p class="sheet-sub">' + sub + '</p>' + (b ? '<div class="tgrid">' + b + '</div>' : '<p class="empty">No other tables have open orders.</p>'));
}
function cancelDialog(d) {
  const o = S.orders.find(x => x.id === d.orderId), isReject = o && o.status === 'new';
  return shell(isReject ? 'Reject this order?' : 'Cancel this order?',
    '<p class="sheet-sub">' + esc(o ? keyTitle(groupKey(o), o) + ', ' + rupee(orderTotal(o)) : '') + '. The customer sees the reason.</p>' +
    '<div class="chips" style="margin:14px 0">' + REASONS.map(r => '<button type="button" class="chip" data-action="reason" data-r="' + esc(r) + '" aria-pressed="' + (d.reason === r) + '">' + esc(r) + '</button>').join('') + '</div>' +
    (d.reason === 'Other' ? '<label class="field"><span>Reason</span><input class="input" id="d-other" data-key="d-other" maxlength="100" value="' + esc(d.other || '') + '"></label>' : '') + errHtml(d) +
    '<div class="dlg-actions"><button type="button" class="btn btn-danger" style="flex:1" data-action="confirm-cancel"' + (d.busy ? ' disabled' : '') + '>' + (isReject ? 'Reject order' : 'Cancel order') + '</button><button type="button" class="btn btn-soft" data-action="close">Keep it</button></div>');
}
function editDialog(d) {
  const q = (d.search || '').trim().toLowerCase(), byQty = id => { const x = d.items.find(i => i.id === id); return x ? x.qty : 0; };
  const step = (id, label, n) => n ? '<div class="step step-sm"><button type="button" data-action="ed-dec" data-id="' + esc(id) + '" data-key="edd-' + esc(id) + '" aria-label="Remove one ' + esc(label) + '">\u2212</button><span>' + n + '</span><button type="button" data-action="ed-inc" data-id="' + esc(id) + '" data-key="edi-' + esc(id) + '" aria-label="Add one more ' + esc(label) + '">+</button></div>'
    : '<button type="button" class="btn-add" data-action="ed-inc" data-id="' + esc(id) + '" data-key="edi-' + esc(id) + '">Add</button>';
  const list = S.cafe.menu.filter(m => m.available && q && m.name.toLowerCase().includes(q));
  return shell('Edit order ' + shortCode(d.orderId),
    (d.items.length ? '<ul class="lines">' + d.items.map(i => '<li class="line"><span class="line-name">' + esc(i.name) + '</span>' + step(i.id, i.name, i.qty) + '<span class="line-price">' + rupee(i.qty * i.price) + '</span></li>').join('') + '</ul>' : '<p class="empty">No items left. Cancel the order instead.</p>') +
    '<label class="field" style="margin-top:14px"><span>Add an item</span><input class="input" id="ed-search" data-key="ed-search" placeholder="Type to search the menu" value="' + esc(d.search || '') + '" autocomplete="off"></label>' +
    (q ? '<ul class="pick-list">' + (list.length ? list.map(m => '<li><span class="vegmark' + (m.veg ? '' : ' nonveg') + '"></span><span class="m-name">' + esc(m.name) + '</span><span class="m-price">' + rupee(m.price) + '</span>' + step(m.id, m.name, byQty(m.id)) + '</li>').join('') : '<li class="empty">No matching items.</li>') + '</ul>' : '') +
    '<label class="note-label" for="ed-note">Note for the kitchen</label><textarea id="ed-note" data-key="ed-note" maxlength="200">' + esc(d.note) + '</textarea>' +
    '<div class="sum"><span>Total</span><b>' + rupee(d.items.reduce((s, i) => s + i.qty * i.price, 0)) + '</b></div>' + errHtml(d) +
    '<div class="dlg-actions"><button type="button" class="btn-primary" data-action="save-edit"' + (d.busy || !d.items.length ? ' disabled' : '') + '>' + (d.busy ? 'Saving\u2026' : 'Save changes') + '</button></div>', true);
}
function billCalc(d) {
  const orders = d.orderIds.map(id => S.orders.find(o => o.id === id)).filter(o => o && !d.skip[o.id]);
  const map = new Map();
  orders.forEach(o => o.items.forEach(i => { const k = i.id + '|' + i.price; const x = map.get(k) || { id: i.id, name: i.name, price: i.price, qty: 0 }; x.qty += i.qty; map.set(k, x); }));
  const lines = [...map.values()];
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = Math.min(Math.max(0, num(d.discount)), subtotal), gstPct = Math.max(0, Math.min(28, num(d.gstPct)));
  const taxable = subtotal - discount, gst = Math.round(taxable * gstPct) / 100, raw = taxable + gst, total = Math.round(raw);
  return { orders, lines, subtotal, discount, gstPct, gst, roundOff: Math.round((total - raw) * 100) / 100, total };
}
function billDialog(d) {
  const all = d.orderIds.map(id => S.orders.find(o => o.id === id)).filter(Boolean);
  if (!all.length) return shell('Bill', '<p class="empty">Getting the order\u2026</p>', true);
  const b = billCalc(d);
  const split = all.length > 1 ? '<p class="note-label">Orders on this bill</p><div class="split-list">' + all.map(o => '<label><input type="checkbox" data-action-change="bill-include" data-id="' + esc(o.id) + '"' + (d.skip[o.id] ? '' : ' checked') + '><span>' + shortCode(o.id) + ', ' + plural(itemCount(o), 'item') + '</span><b>' + rupee(orderTotal(o)) + '</b></label>').join('') + '</div><p class="fine left">Untick an order to bill it separately later.</p>' : '';
  return shell('Bill for ' + d.label,
    split + '<table class="bill-table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>' +
    b.lines.map(l => '<tr><td>' + esc(l.name) + '</td><td>' + l.qty + '</td><td>' + money2(l.price) + '</td><td>' + money2(l.qty * l.price) + '</td></tr>').join('') + '</tbody></table>' +
    '<div class="row" style="margin-top:14px"><label class="field"><span>Discount (\u20B9)</span><input class="input" id="d-discount" data-key="d-discount" type="number" min="0" step="1" inputmode="decimal" value="' + esc(d.discount) + '"></label>' +
    '<label class="field"><span>GST %</span><input class="input" id="d-gst" data-key="d-gst" type="number" min="0" max="28" step="0.5" inputmode="decimal" value="' + esc(d.gstPct) + '"></label></div>' +
    '<div class="bill-sum"><p><span>Subtotal</span><span>' + money2(b.subtotal) + '</span></p>' + (b.discount ? '<p><span>Discount</span><span>\u2212' + money2(b.discount) + '</span></p>' : '') +
    (b.gstPct ? '<p><span>CGST ' + (b.gstPct / 2) + '%</span><span>' + money2(b.gst / 2) + '</span></p><p><span>SGST ' + (b.gstPct / 2) + '%</span><span>' + money2(b.gst / 2) + '</span></p>' : '') +
    (b.roundOff ? '<p><span>Round off</span><span>' + money2(b.roundOff) + '</span></p>' : '') + '<p class="grand"><span>Total</span><span>' + rupee(b.total) + '</span></p></div>' +
    '<p class="note-label">Paid by</p><div class="vegpick">' + PAY.map(([k, l]) => '<button type="button" data-action="pay" data-p="' + k + '" aria-pressed="' + (d.pay === k) + '">' + l + '</button>').join('') + '</div>' + errHtml(d) +
    '<div class="dlg-actions" style="margin-top:16px"><button type="button" class="btn-primary" data-action="save-bill" data-print="1"' + (d.busy || !b.orders.length ? ' disabled' : '') + '>' + (d.busy ? 'Saving\u2026' : 'Save and print') + '</button>' +
    '<button type="button" class="btn btn-soft" data-action="save-bill" data-print="0"' + (d.busy || !b.orders.length ? ' disabled' : '') + '>Save only</button></div>', true);
}
function voidDialog(d) {
  const b = S.bills.concat(S.dayBills || []).find(x => x.id === d.billId);
  return shell('Cancel this bill?', '<p class="sheet-sub">Bill #' + (b ? b.billNo + ', ' + esc(b.label) + ', ' + rupee(b.total) : '') + '. Its orders go back to the table so you can bill them again.</p>' +
    '<label class="field" style="margin-top:12px"><span>Reason</span><input class="input" id="d-void" data-key="d-void" maxlength="100" placeholder="Wrong items, wrong payment\u2026" value="' + esc(d.reason || '') + '"></label>' + errHtml(d) +
    '<div class="dlg-actions"><button type="button" class="btn btn-danger" style="flex:1" data-action="confirm-void"' + (d.busy ? ' disabled' : '') + '>Cancel bill</button><button type="button" class="btn btn-soft" data-action="close">Keep it</button></div>');
}
// Copy what's typed in the dish form into the dialog state, so re-drawing the form never loses it.
function syncItemForm(d) {
  const f = $('#item-form'); if (!f) return;
  ['name', 'desc', 'price', 'cat', 'made', 'taste', 'made_ml', 'taste_ml'].forEach(k => { if (f[k]) d.item[k] = f[k].value; });
}
// Food photos live in one shared record per cafe (cafes/<id>/media/photos), loaded when needed.
function loadPhotos() {
  if (S.photos !== undefined) return;
  S.photos = null;
  getDoc(doc(db, 'cafes', S.cafeId, 'media', 'photos'))
    .then(sn => { S.photos = (sn.exists() && sn.data().p) || {}; if (S.dialog && S.dialog.type === 'item') renderDialog(); })
    .catch(() => { S.photos = {}; });
}
function itemExtrasHtml(d) {
  const m = d.item, spice = m.spice === undefined ? -1 : m.spice, al = m.allergens || [];
  return '<div class="field"><span>Badge</span><div class="chips"><button type="button" class="chip" data-action="chef" aria-pressed="' + !!m.chef + '">\u2B50 Chef\u2019s pick</button></div>' +
      '<small>"Popular" badges are added automatically for your best sellers each week.</small></div>' +
    '<h3 class="form-sub">For the dish helper</h3><p class="fine left" style="margin:-4px 2px 12px">Customers can ask about this dish by voice or by tapping. It only answers from what you write here.</p>' +
    '<label class="field"><span>How it\u2019s made</span><textarea name="made" maxlength="300" placeholder="Like: Fresh milk boiled with tea leaves, ginger and cardamom">' + esc(m.made || '') + '</textarea></label>' +
    '<label class="field"><span>How it tastes</span><input class="input" name="taste" maxlength="200" value="' + esc(m.taste || '') + '" placeholder="Like: Strong, sweet and warming"></label>' +
    '<div class="field"><span>Spice level <span class="muted">(tap again to clear)</span></span><div class="chips">' + SPICE.map((l, i) => '<button type="button" class="chip" data-action="spice" data-v="' + i + '" aria-pressed="' + (spice === i) + '">' + l + '</button>').join('') + '</div></div>' +
    '<div class="field"><span>Contains</span><div class="chips">' + ALLERGENS.map(([k, l]) => '<button type="button" class="chip" data-action="allergen" data-a="' + k + '" aria-pressed="' + al.includes(k) + '">' + l + '</button>').join('') + '</div>' +
      '<small>Tick everything this dish contains. For anything not listed, the helper tells customers to check with staff.</small></div>' +
    '<details class="ml-box"' + (m.made_ml || m.taste_ml ? ' open' : '') + '><summary>In Malayalam (optional)</summary>' +
      '<label class="field"><span>\u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46 \u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41 (How it\u2019s made)</span><textarea name="made_ml" maxlength="300">' + esc(m.made_ml || '') + '</textarea></label>' +
      '<label class="field"><span>\u0D30\u0D41\u0D1A\u0D3F (How it tastes)</span><input class="input" name="taste_ml" maxlength="200" value="' + esc(m.taste_ml || '') + '"></label></details>';
}
function itemPhotoHtml(d) {
  const m = d.item, loading = S.photos === null && m.photo;
  const photo = d.photoNew !== undefined ? d.photoNew : ((S.photos && S.photos[m.id]) || '');
  return '<div class="item-photo-row"><div class="item-photo">' + (photo ? '<img src="' + photo + '" alt="Photo of ' + esc(m.name || 'this dish') + '">' : '<span>' + (loading ? 'Loading\u2026' : 'No photo') + '</span>') + '</div>' +
    '<div class="logo-acts"><label class="btn-ghost file-btn">' + (photo ? 'Change photo' : 'Add photo') + '<input type="file" accept="image/png,image/jpeg,image/webp" data-role="item-photo"></label>' +
    (photo ? '<button type="button" class="btn-ghost" data-action="photo-remove">Remove</button>' : '') +
    '<small class="muted">Square photos look best. They\u2019re made small automatically so the menu stays fast.</small></div></div>';
}
function itemDialog(d) {
  const m = d.item;
  return shell(d.isNew ? 'Add item' : 'Edit item', '<form id="item-form" novalidate>' + itemPhotoHtml(d) + '<label class="field"><span>Name</span><input class="input" name="name" maxlength="60" value="' + esc(m.name) + '"></label>' +
    '<label class="field"><span>Short description</span><input class="input" name="desc" maxlength="120" value="' + esc(m.desc) + '" placeholder="Shown to customers"></label>' +
    '<div class="row"><label class="field"><span>Price (\u20B9)</span><input class="input" name="price" type="number" min="0" max="100000" step="1" inputmode="numeric" value="' + (m.price === '' ? '' : m.price) + '"></label>' +
    '<label class="field"><span>Category</span><select name="cat">' + S.cafe.categories.map(cat => '<option value="' + esc(cat.id) + '"' + (cat.id === m.cat ? ' selected' : '') + '>' + esc(cat.name) + '</option>').join('') + '</select></label></div>' +
    '<div class="field"><span>Food type</span><div class="vegpick"><button type="button" data-action="veg" data-v="1" aria-pressed="' + (m.veg !== false) + '"><span class="vegmark"></span>Veg</button><button type="button" data-action="veg" data-v="0" aria-pressed="' + (m.veg === false) + '"><span class="vegmark nonveg"></span>Non-veg</button></div></div>' + 
    itemExtrasHtml(d) + errHtml(d) +
    '<div class="dlg-actions"><button class="btn-primary" type="submit"' + (d.busy ? ' disabled' : '') + '>' + (d.busy ? 'Saving\u2026' : d.isNew ? 'Add item' : 'Save') + '</button>' +
    (d.isNew ? '' : '<button type="button" class="btn btn-danger" data-action="delete-item">' + (d.armDelete ? 'Tap again to delete' : 'Delete') + '</button>') + '</div></form>');
}
function catDialog(d) {
  const hasItems = !d.isNew && S.cafe.menu.some(m => m.cat === d.cat.id);
  return shell(d.isNew ? 'Add category' : 'Rename category', '<form id="cat-form" novalidate><label class="field"><span>Category name</span><input class="input" name="name" maxlength="40" value="' + esc(d.cat.name) + '" placeholder="Like Breakfast or Mocktails"></label>' + errHtml(d) +
    '<div class="dlg-actions"><button class="btn-primary" type="submit"' + (d.busy ? ' disabled' : '') + '>' + (d.busy ? 'Saving\u2026' : 'Save') + '</button>' +
    (d.isNew ? '' : '<button type="button" class="btn btn-danger" data-action="delete-cat"' + (hasItems ? ' disabled' : '') + '>' + (d.armDelete ? 'Tap again to delete' : 'Delete') + '</button>') + '</div>' +
    (hasItems ? '<p class="fine">Move or delete its items first to delete this category.</p>' : '') + '</form>');
}
function renderDialog(focusTitle) {
  withFocus(() => {
    const el = $('#overlay'), d = S.dialog;
    if (!d) { el.innerHTML = ''; return; }
    el.innerHTML = ({ actions: actionsDialog, tablepick: tablePickDialog, cancel: cancelDialog, edit: editDialog, bill: billDialog, void: voidDialog, item: itemDialog, cat: catDialog }[d.type])(d);
    dlgAnim = false;
  });
  if (focusTitle) { const h = $('#dlg-h'); if (h) h.focus({ preventScroll: true }); }
}
function openDialog(d) { S.dialog = d; dlgAnim = true; renderDialog(true); }
function closeDialog() { S.dialog = null; renderDialog(); }

/* ---------- Game leaderboard (Settings) ----------
   Shows who's on top today (or this week), lets staff remove a rude or fake name,
   and lists the last winners so staff can hand over the prize and mark it given. */
function lbFetch(pg, n) {
  const col = collection(db, 'cafes', S.cafeId, 'scores');
  const tidy = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(x => !x.hidden && typeof x.score === 'number').sort((a, b) => b.score - a.score).slice(0, 10);
  return getDocs(query(col, where('pg', '==', pg), orderBy('score', 'desc'), limit(n))).then(tidy)
    .catch(() => getDocs(query(col, where('pg', '==', pg), limit(100))).then(tidy));
}
async function loadLb() {
  if (!S.cafe) return;
  const P = lbPeriods(S.cafe.settings);
  S.lb = Object.assign({}, S.lb || {}, { loading: true, at: Date.now() });
  try {
    const cur = {}, prev = {};
    await Promise.all(LB_GAMES.map(async ([g]) => { cur[g] = await lbFetch(P.cur + '_' + g, 15); prev[g] = (await lbFetch(P.prev + '_' + g, 5))[0] || null; }));
    S.lb = { cur, prev, P, at: Date.now(), loading: false, err: false };
  } catch (e) { S.lb = Object.assign(S.lb, { loading: false, err: true }); }
  const el = $('#lb-panel'); if (el) el.outerHTML = lbPanelHtml();
}
function lbPanelHtml() {
  if (S.cafe && (!S.lb || (!S.lb.loading && Date.now() - S.lb.at > 60000))) setTimeout(loadLb, 0);
  const lb = S.lb || {}, P = lb.P || lbPeriods(S.cafe.settings), cw = P.week ? 'this week' : 'today', pw = P.week ? 'last week' : 'yesterday';
  const prize = S.cafe.settings.prize;
  const winners = LB_GAMES.map(([g, name]) => { const w = lb.prev && lb.prev[g]; if (!w) return '';
    return '<li class="lb-win"><span class="lb-trophy" aria-hidden="true">\u{1F3C6}</span><span class="lb-who"><b>' + esc(w.name) + '</b><small>' + esc(name) + ' winner ' + pw + ', ' + w.score + ' points' + (w.table ? ', Table ' + w.table : '') + '</small></span>' +
      (w.claimed ? '<span class="lb-given">\u2713 Prize given</span>' : prize ? '<button type="button" class="btn-primary inline lb-give" data-action="lb-claim" data-id="' + esc(w.id) + '">Mark prize given</button>' : '') + '</li>'; }).join('');
  const list = (g) => { const rows = (lb.cur && lb.cur[g]) || [];
    return rows.length ? '<ol class="lb-list">' + rows.map((x, i) => '<li><span class="lb-rank">' + (i + 1) + '</span><span class="lb-who"><b>' + esc(x.name) + '</b>' + (x.table ? '<small>Table ' + x.table + '</small>' : '') + '</span><b class="lb-score">' + x.score + '</b><button type="button" class="mini" data-action="lb-hide" data-id="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">Remove</button></li>').join('') + '</ol>'
      : '<p class="muted lb-empty">' + (lb.loading ? 'Loading\u2026' : lb.err ? 'Couldn\u2019t load. Tap Refresh.' : 'No scores ' + cw + ' yet.') + '</p>'; };
  return '<section class="panel-lite" id="lb-panel"><div class="sec-head" style="margin:0 0 6px"><h3>Game leaderboard</h3><button type="button" class="btn-ghost" data-action="lb-refresh">Refresh</button></div>' +
    '<p class="muted" style="margin-bottom:12px">' + (prize ? 'Prize: <b>' + esc(prize) + '</b>. ' : 'No prize set. Add one above to get more customers playing. ') + 'The winner shows a gold card with a ticking clock on their phone. Check the name, then tap Mark prize given.</p>' +
    (winners ? '<ul class="lb-wins">' + winners + '</ul>' : '') +
    '<div class="lb-cols">' + LB_GAMES.map(([g, name]) => '<div><h4 class="lb-h">' + esc(name) + ', ' + cw + '</h4>' + list(g) + '</div>').join('') + '</div></section>';
}
async function lbSet(id, data, msg) {
  try { await updateDoc(doc(db, 'cafes', S.cafeId, 'scores', id), data); toast(msg); } catch (e) { toast('That didn\u2019t save. Check your internet.'); }
  loadLb();
}

/* ---------- Printing ---------- */
function doPrint(kind, html, pageCss) { printOut(kind, html, pageCss); }
function receiptHead() {
  const st = S.cafe.settings;
  return (S.cafe.brand.logo ? '<p class="r-c"><img class="r-logo" src="' + S.cafe.brand.logo + '" alt=""></p>' : '') + '<p class="r-c r-big">' + esc(S.cafe.name) + '</p>' + (st.address ? '<p class="r-c">' + esc(st.address) + '</p>' : '') + (st.phone ? '<p class="r-c">Phone: ' + esc(st.phone) + '</p>' : '') + (st.gstin ? '<p class="r-c">GSTIN: ' + esc(st.gstin) + '</p>' : '');
}
const rrow = (a, z, cls) => '<p class="r-row' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><span>' + z + '</span></p>';
function printReceipt(b) {
  const st = S.cafe.settings;
  doPrint('receipt', '<div class="receipt w' + st.paper + '">' + receiptHead() + '<hr>' + rrow('Bill No: ' + b.billNo, fmtDateTime(b.createdAt)) + rrow(esc(b.label), '') + '<hr>' +
    '<p class="r-row r-b"><span class="r-item">Item</span><span class="r-q">Qty</span><span class="r-a">Amount</span></p>' +
    b.lines.map(l => '<p class="r-row"><span class="r-item">' + esc(l.name) + '</span><span class="r-q">' + l.qty + '</span><span class="r-a">' + money2(l.qty * l.price) + '</span></p>').join('') + '<hr>' +
    rrow('Subtotal', money2(b.subtotal)) + (b.discount ? rrow('Discount', '-' + money2(b.discount)) : '') +
    (b.gstPct ? rrow('CGST ' + (b.gstPct / 2) + '%', money2(b.gst / 2)) + rrow('SGST ' + (b.gstPct / 2) + '%', money2(b.gst / 2)) : '') +
    (b.roundOff ? rrow('Round off', money2(b.roundOff)) : '') + '<hr>' + rrow('TOTAL', 'Rs ' + money2(b.total), 'r-big r-b') + rrow('Paid by', PAY.find(p => p[0] === b.pay)[1]) +
    (b.void ? '<p class="r-c r-b">CANCELLED BILL</p>' : '') + '<hr>' + (st.footer ? '<p class="r-c">' + esc(st.footer) + '</p>' : '') + '<p class="r-c r-small">Ordering by YUNO</p></div>', '@page{margin:0}');
}
function printReport() {
  const bills = dayBills() || [], r = reportData(bills), st = S.cafe.settings;
  doPrint('receipt', '<div class="receipt w' + st.paper + '">' + receiptHead() + '<hr><p class="r-c r-b">SALES REPORT</p><p class="r-c">' + esc(S.reportDate.split('-').reverse().join('-')) + '</p><hr>' +
    rrow('Bills', r.count) + rrow('Total sales', money2(r.total), 'r-b') + rrow('Cash', money2(r.pay.cash)) + rrow('UPI', money2(r.pay.upi)) + rrow('Card', money2(r.pay.card)) +
    rrow('GST collected', money2(r.gst)) + rrow('Discounts', money2(r.discount)) + rrow('Cancelled bills', r.voided) + '<hr><p class="r-b">Top items</p>' +
    r.top.map(([n, x]) => rrow(esc(n) + ' x ' + x.qty, money2(x.amt))).join('') + '<hr><p class="r-c r-small">Printed ' + fmtDateTime(Date.now()) + '</p></div>', '@page{margin:0}');
}

/* ---------- Actions ---------- */
function addToDraft(id, delta) {
  const d = draftFor(S.pos.key), m = menuById()[id];
  const x = d.items.find(i => i.id === id);
  if (x) { x.qty = Math.min(99, x.qty + delta); if (x.qty <= 0) d.items = d.items.filter(i => i !== x); }
  else if (delta > 0 && m && m.available) d.items.push({ id, name: m.name, qty: 1, price: m.price });
}
async function sendDraft() {
  const key = S.pos.key, d = draftFor(key);
  if (!d.items.length) return;
  const nameEl = $('#draft-name'); if (nameEl) d.name = nameEl.value;
  const noteEl = $('#draft-note'); if (noteEl) d.note = noteEl.value;
  const items = d.items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }));
  const data = {
    type: S.pos.type, table: S.pos.type === 'table' ? S.pos.table : 0, group: S.pos.type === 'table' ? '' : key,
    name: String(d.name || '').trim().slice(0, 40), items, note: String(d.note || '').trim().slice(0, 200),
    total: items.reduce((s, i) => s + i.qty * i.price, 0), status: 'preparing', prepMins: S.cafe.settings.prepMins,
    acceptedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), source: 'staff'
  };
  const backup = JSON.parse(JSON.stringify(d));
  S.drafts[key] = { items: [], note: '', name: d.name }; render();
  try { await addDoc(collection(db, 'cafes', S.cafeId, 'orders'), data); toast('Sent to the kitchen.'); }
  catch (e) { S.drafts[key] = backup; render(); toast('That didn\u2019t send. Check your internet and try again.'); }
}
function openBill(orderIds, label) {
  openDialog({ type: 'bill', orderIds, label, skip: {}, discount: '', gstPct: S.cafe.settings.gstPct, pay: '', busy: false, err: '' });
}
// One-tap bill: no pop-up. Uses the normal GST, no discount, and prints straight away.
function quickTotal(key) { return billCalc({ orderIds: billable(key).map(o => o.id), skip: {}, discount: '', gstPct: S.cafe.settings.gstPct }).total; }
async function quickBill(pay) {
  if (S.quickBusy || !S.pos) return;
  const os = billable(S.pos.key); if (!os.length) return;
  S.quickBusy = true; render();
  await saveBill(true, { orderIds: os.map(o => o.id), label: keyTitle(S.pos.key), skip: {}, discount: '', gstPct: S.cafe.settings.gstPct, pay, busy: false, err: '' });
  S.quickBusy = false; render();
}
async function saveBill(print, quick) {
  const d = quick || S.dialog;
  const show = () => { if (quick) { if (d.err) toast(d.err); } else renderDialog(); };
  if (!d.pay) { d.err = 'Choose how the customer paid.'; show(); return; }
  const b = billCalc(d);
  if (!b.orders.length) { d.err = 'Tick at least one order.'; show(); return; }
  d.busy = true; d.err = ''; if (!quick) renderDialog();
  const types = [...new Set(b.orders.map(o => o.type))];
  try {
    const billRef = doc(collection(db, 'cafes', S.cafeId, 'bills'));
    const counterRef = doc(db, 'cafes', S.cafeId, 'meta', 'counters');
    const saved = await runTransaction(db, async tx => {
      const c = await tx.get(counterRef);
      for (const o of b.orders) {
        const sn = await tx.get(orderRef(o.id)), x = sn.exists() ? sn.data() : null;
        if (!x) throw Object.assign(new Error('gone'), { code: 'gone' });
        if (x.billId) throw Object.assign(new Error('billed'), { code: 'already-billed' });
        if (x.status === 'cancelled' || x.status === 'rejected') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      }
      const billNo = ((c.exists() && parseInt(c.data().billNo, 10)) || 0) + 1;
      const data = {
        billNo, label: d.label, name: (b.orders.find(o => o.name) || {}).name || '', type: types.length === 1 ? types[0] : 'mixed',
        tables: [...new Set(b.orders.filter(o => o.type === 'table').map(o => o.table))], orderIds: b.orders.map(o => o.id),
        lines: b.lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
        subtotal: b.subtotal, discount: b.discount, gstPct: b.gstPct, gst: b.gst, roundOff: b.roundOff, total: b.total,
        pay: d.pay, void: false, createdAt: serverTimestamp(), by: S.user.uid
      };
      tx.set(counterRef, { billNo }, { merge: true });
      tx.set(billRef, data);
      const [dk, delta] = summaryDelta(Object.assign({}, data, { createdAt: Date.now() }), 1);
      tx.set(dayRef(dk), delta, { merge: true });
      b.orders.forEach(o => tx.update(orderRef(o.id), { billId: billRef.id, updatedAt: serverTimestamp() }));
      return normBill(billRef.id, Object.assign({}, data, { createdAt: Date.now() }));
    });
    if (!quick) closeDialog();
    toast('Bill #' + saved.billNo + ' saved' + (quick ? ', ' + rupee(saved.total) + ' by ' + PAY.find(p => p[0] === saved.pay)[1] : '') + '.');
    if (print) printReceipt(saved);
    if (S.view === 'pos' && S.pos) setTimeout(() => { if (S.pos && !openOrders(S.pos.key).length && !draftFor(S.pos.key).items.length) { S.view = 'tables'; S.pos = null; render(); } }, 400);
  } catch (e) {
    d.busy = false;
    d.err = e && e.code === 'already-billed' ? 'One of these orders was already billed on another screen.' : e && e.code === 'cancelled' ? 'One of these orders was cancelled.' : 'The bill didn\u2019t save. Check your internet and try again.';
    show();
  }
}
async function moveOrders(orderIds, table) {
  try {
    const batch = writeBatch(db);
    orderIds.forEach(id => batch.update(orderRef(id), { type: 'table', table, group: '', updatedAt: serverTimestamp() }));
    await batch.commit();
    return true;
  } catch (e) { toast('That didn\u2019t save. Try again.'); return false; }
}

document.addEventListener('click', async e => {
  const wasReady = audioReady();
  unlockAudio();
  if (!wasReady && S.phase === 'ready') setTimeout(() => { if (audioReady()) render(); }, 300);
  if (S.calOpen && !e.target.closest('.day-pick')) { closeCal(); render(); }
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action, id = t.dataset.id, d = S.dialog;
  switch (a) {
    case 'view': S.view = t.dataset.v; S.pos = S.view === 'pos' ? S.pos : null; S.settingsDirty = false; closeCal(); if (S.view === 'bills') subscribeMonth(); render(); window.scrollTo(0, 0); break;
    case 'cal-toggle': S.calOpen = !S.calOpen; if (S.calOpen) subscribeMonth(); render(); break;
    case 'pick-day': S.reportDate = t.dataset.day; S.calOpen = false; subscribeDayBills(); render(); break;
    case 'cal-prev': case 'cal-next': {
      const [y, m] = S.calMonth.split('-').map(Number), dt = new Date(y, m - 1 + (a === 'cal-next' ? 1 : -1), 1);
      const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      if (mk > today().slice(0, 7)) break;
      S.calMonth = mk; subscribeMonth(); render(); break;
    }
    case 'bill-table': { const n = t.dataset.t, os = billable('t:' + n); if (os.length) openBill(os.map(o => o.id), 'Table ' + n); break; }
    case 'unlock': render(); break;
    case 'sound': S.soundOn = !S.soundOn; ls.set('yumotap:sound', S.soundOn); if (!S.soundOn) stopAlarm(); render(); if (S.soundOn) chime(); break;
    case 'open-table': openPos('t:' + t.dataset.t, 'table', parseInt(t.dataset.t, 10)); break;
    case 'open-group': { const o = S.orders.find(x => groupKey(x) === t.dataset.k); openPos(t.dataset.k, o ? o.type : 'parcel'); break; }
    case 'new-group': openPos((t.dataset.type === 'parcel' ? 'p:' : 'c:') + newId(), t.dataset.type); break;
    case 'pos-cat': S.posCat = t.dataset.c; render(); break;
    case 'add': addToDraft(id, 1); render(); break;
    case 'dec': addToDraft(id, -1); render(); break;
    case 'send': sendDraft(); break;
    case 'cart-open': S.cartOpen = true; render(); break;
    case 'cart-close': S.cartOpen = false; render(); break;
    case 'quick-bill': quickBill(t.dataset.p); break;
    case 'bill-pos': { const os = billable(S.pos.key); if (os.length) openBill(os.map(o => o.id), keyTitle(S.pos.key)); break; }
    case 'pick-time': S.acceptMins[id] = parseInt(t.dataset.m, 10); render(); break;
    case 'accept': { const mins = S.acceptMins[id] || S.cafe.settings.prepMins; decideOrder(id, { status: 'preparing', prepMins: mins, acceptedAt: serverTimestamp() }, 'Accepted. Sent to the kitchen, ready in ' + mins + ' min.'); break; }
    case 'time': { const o = S.orders.find(x => x.id === id); if (o) updateOrder(id, { prepMins: Math.max(1, (o.prepMins || 0) + parseInt(t.dataset.d, 10)) }, 'Time updated. The customer sees it too.'); break; }
    case 'set': updateOrder(id, Object.assign({ status: t.dataset.st }, t.dataset.st === 'ready' ? { readyAt: serverTimestamp() } : {})); break;
    case 'call-done': try { await deleteDoc(doc(db, 'cafes', S.cafeId, 'calls', id)); } catch (err) { toast('That didn\u2019t clear. Try again.'); } break;
    case 'pos-menu': openDialog({ type: 'actions', title: keyTitle(S.pos.key), items: [
      ...(S.pos.type === 'table' ? [['move-table', 'Move to another table'], ['merge-table', 'Merge another table here']] : []),
      ...(billable(S.pos.key).length ? [['bill-pos', 'Bill']] : [])] }); break;
    case 'order-menu': {
      const o = S.orders.find(x => x.id === id); if (!o) break;
      openDialog({ type: 'actions', title: 'Order ' + shortCode(o.id), items: [['edit-order', 'Edit items', ' data-id="' + esc(o.id) + '"'], ['print-kot', 'Print KOT (kitchen ticket)', ' data-id="' + esc(o.id) + '"'], ['open-cancel', o.status === 'new' ? 'Reject order' : 'Cancel order', ' data-id="' + esc(o.id) + '"', true]] });
      break;
    }
    case 'move-table': openDialog({ type: 'tablepick', mode: 'move' }); break;
    case 'merge-table': openDialog({ type: 'tablepick', mode: 'merge' }); break;
    case 'pick-table': {
      const n = parseInt(t.dataset.t, 10), mode = d && d.mode; closeDialog();
      if (mode === 'move') { const ids = openOrders(S.pos.key).map(o => o.id); const draft = S.drafts[S.pos.key]; if (await moveOrders(ids, n)) { if (draft) { S.drafts['t:' + n] = draft; delete S.drafts[S.pos.key]; } toast('Moved to table ' + n + '.'); openPos('t:' + n, 'table', n); } }
      else if (mode === 'merge') { const ids = openOrders('t:' + n).map(o => o.id); if (await moveOrders(ids, S.pos.table)) toast('Table ' + n + ' merged into ' + keyTitle(S.pos.key) + '.'); }
      break;
    }
    case 'edit-order': {
      const o = S.orders.find(x => x.id === id); if (!o) break;
      if (o.billId) { toast('This order is billed. Cancel the bill first.'); break; }
      openDialog({ type: 'edit', orderId: o.id, items: o.items.map(i => Object.assign({}, i)), note: o.note, search: '', busy: false, err: '' });
      break;
    }
    case 'ed-inc': case 'ed-dec': {
      if (!d) break;
      const x = d.items.find(i => i.id === id), m = menuById()[id];
      if (x) { x.qty += a === 'ed-inc' ? 1 : -1; if (x.qty <= 0) d.items = d.items.filter(i => i !== x); }
      else if (a === 'ed-inc' && m) d.items.push({ id, name: m.name, qty: 1, price: m.price });
      renderDialog(); break;
    }
    case 'save-edit': {
      if (!d) break;
      const o = S.orders.find(x => x.id === d.orderId);
      if (!o || o.billId) { d.err = 'This order was billed or closed.'; renderDialog(); break; }
      d.busy = true; renderDialog();
      try { await updateDoc(orderRef(d.orderId), { items: d.items, note: String(d.note || '').trim().slice(0, 200), total: d.items.reduce((s, i) => s + i.qty * i.price, 0), source: 'staff', updatedAt: serverTimestamp() }); closeDialog(); toast('Order updated.'); }
      catch (err) { d.busy = false; d.err = 'That didn\u2019t save. Try again.'; renderDialog(); }
      break;
    }
    case 'open-cancel': openDialog({ type: 'cancel', orderId: id, reason: '', other: '', busy: false, err: '' }); break;
    case 'reason': if (d) { d.reason = t.dataset.r; d.err = ''; renderDialog(); } break;
    case 'confirm-cancel': {
      if (!d) break;
      const o = S.orders.find(x => x.id === d.orderId);
      if (!o) { closeDialog(); break; }
      if (o.billId) { d.err = 'This order is billed. Cancel the bill first (in Bills).'; renderDialog(); break; }
      if (!d.reason) { d.err = 'Pick a reason.'; renderDialog(); break; }
      const reason = d.reason === 'Other' ? (String(d.other || '').trim() || 'Other') : d.reason;
      d.busy = true; renderDialog();
      const ok = o.status === 'new'
        ? await decideOrder(o.id, { status: 'rejected', cancelledBy: 'cafe', cancelReason: reason.slice(0, 100) }, 'Order rejected.')
        : await updateOrder(o.id, { status: 'cancelled', cancelledBy: 'cafe', cancelReason: reason.slice(0, 100) }, 'Order cancelled.');
      if (ok) closeDialog(); else { d.busy = false; renderDialog(); }
      break;
    }
    case 'pay': if (d) { d.pay = t.dataset.p; d.err = ''; renderDialog(); } break;
    case 'save-bill': saveBill(t.dataset.print === '1'); break;
    case 'bill-menu': {
      const b = S.bills.concat(S.dayBills || []).find(x => x.id === id); if (!b) break;
      openDialog({ type: 'actions', title: 'Bill #' + b.billNo, items: [['reprint', 'Print again', ' data-id="' + esc(b.id) + '"'], ...(b.void ? [] : [['open-void', 'Cancel this bill', ' data-id="' + esc(b.id) + '"', true]])] });
      break;
    }
    case 'lb-refresh': loadLb(); break;
    case 'lb-hide': lbSet(id, { hidden: true }, 'Removed from the leaderboard.'); break;
    case 'lb-claim': lbSet(id, { claimed: true }, 'Marked as given. Enjoy!'); break;
    case 'print-kot': { const o = S.orders.find(x => x.id === id); closeDialog(); if (o) { kotPrintedOnce(S.cafeId, o.id); printKot(o, S.cafe, { reprint: o.status !== 'new' && o.status !== 'preparing' }); } break; }
    case 'kot-auto': kotAuto.set(!kotAuto.get()); render(); toast(kotAuto.get() ? 'KOT will print by itself on this device when an order goes to the kitchen.' : 'Auto KOT is off on this device.'); break;
    case 'test-kot': printKot({ id: 'test01', type: 'table', table: 1, name: '', items: [{ name: 'Masala tea', qty: 2 }, { name: 'Chicken puffs', qty: 1 }], note: 'Less sugar', prepMins: S.cafe.settings.prepMins, createdAt: Date.now() }, S.cafe); break;
    case 'reprint': { const b = S.bills.concat(S.dayBills || []).find(x => x.id === id); closeDialog(); if (b) printReceipt(b); break; }
    case 'open-void': openDialog({ type: 'void', billId: id, reason: '', busy: false, err: '' }); break;
    case 'confirm-void': {
      if (!d) break;
      const b = S.bills.concat(S.dayBills || []).find(x => x.id === d.billId); if (!b) { closeDialog(); break; }
      d.busy = true; renderDialog();
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'cafes', S.cafeId, 'bills', b.id), { void: true, voidReason: String(d.reason || '').slice(0, 100), updatedAt: serverTimestamp() });
        const [dk, delta] = summaryDelta(b, -1); batch.set(dayRef(dk), delta, { merge: true });
        b.orderIds.forEach(oid => { if (S.orders.some(o => o.id === oid)) batch.update(orderRef(oid), { billId: null, updatedAt: serverTimestamp() }); });
        await batch.commit(); closeDialog(); toast('Bill #' + b.billNo + ' cancelled.');
      } catch (err) { d.busy = false; d.err = 'That didn\u2019t save. Try again.'; renderDialog(); }
      break;
    }
    case 'print-report': printReport(); break;
    case 'print-qr': doPrint('qr', '<div class="qr-grid print">' + qrCards() + '</div>', '@page{size:A4;margin:10mm}'); break;
    case 'test-print': printReceipt({ billNo: 0, label: 'Table 1', createdAt: Date.now(), lines: [{ name: 'Test item', qty: 2, price: 50 }], subtotal: 100, discount: 0, gstPct: S.cafe.settings.gstPct, gst: S.cafe.settings.gstPct, roundOff: 0, total: Math.round(100 + S.cafe.settings.gstPct), pay: 'cash', void: false }); break;
    case 'test-alarm': if (alarmPlaying()) { stopAlarm(); testRinging = false; t.textContent = 'Play the alarm (20 seconds)'; } else { unlockAudio(); testRinging = true; t.textContent = 'Stop the alarm'; setTimeout(() => alarm(), 80); setTimeout(() => { testRinging = false; }, 20500); } break;
    case 'copy-kitchen': try { await navigator.clipboard.writeText(kitchenLink()); toast('Kitchen link copied.'); } catch (err) { toast(kitchenLink()); } break;
    case 'toggle-repeat': S.alarmRepeat = !S.alarmRepeat; ls.set('yumotap:alarmRepeat', S.alarmRepeat); t.setAttribute('aria-checked', String(S.alarmRepeat)); break;
    case 'toggle-accepting': { const next = !S.cafe.acceptingOrders; t.setAttribute('aria-checked', String(next)); writeCafe({ acceptingOrders: next }, next ? 'Phone orders are on.' : 'Phone orders are paused.').catch(() => {}); break; }
    case 'toggle-item': { const menu = S.cafe.menu.map(m => m.id === id ? Object.assign({}, m, { available: !m.available }) : m); const it = menu.find(m => m.id === id); writeCafe({ menu }, it ? it.name + (it.available ? ' is back on.' : ' is sold out.') : '').catch(() => {}); break; }
    case 'add-item': loadPhotos(); openDialog({ type: 'item', isNew: true, item: { id: newId(), name: '', desc: '', price: '', veg: true, cat: t.dataset.cat, available: true, spice: -1, allergens: [] } }); break;
    case 'edit-item': { const m = S.cafe.menu.find(x => x.id === id); if (m) { loadPhotos(); openDialog({ type: 'item', isNew: false, item: Object.assign({}, m, { allergens: (m.allergens || []).slice() }) }); } break; }
    case 'chef': if (d && d.type === 'item') { syncItemForm(d); d.item.chef = !d.item.chef; renderDialog(); } break;
    case 'spice': if (d && d.type === 'item') { syncItemForm(d); const v = parseInt(t.dataset.v, 10) || 0; d.item.spice = d.item.spice === v ? -1 : v; renderDialog(); } break;
    case 'allergen': if (d && d.type === 'item') { syncItemForm(d); const al = d.item.allergens || (d.item.allergens = []), k = t.dataset.a, i = al.indexOf(k); if (i >= 0) al.splice(i, 1); else al.push(k); renderDialog(); } break;
    case 'photo-remove': if (d && d.type === 'item') { syncItemForm(d); d.photoNew = ''; renderDialog(); } break;
    case 'veg': if (d && d.type === 'item') { syncItemForm(d); d.item.veg = t.dataset.v === '1'; renderDialog(); } break;
    case 'delete-item': {
      if (!d) break;
      if (!d.armDelete) { d.armDelete = true; syncItemForm(d); renderDialog(); break; }
      d.busy = true; renderDialog();
      try {
        await writeCafe({ menu: S.cafe.menu.filter(m => m.id !== d.item.id) }, 'Item deleted.');
        if (d.item.photo) setDoc(doc(db, 'cafes', S.cafeId, 'media', 'photos'), { p: { [d.item.id]: '' } }, { merge: true }).catch(() => {});
        closeDialog();
      } catch (err) { d.busy = false; renderDialog(); }
      break;
    }
    case 'add-cat': openDialog({ type: 'cat', isNew: true, cat: { id: '', name: '' } }); break;
    case 'edit-cat': { const c = S.cafe.categories.find(x => x.id === id); if (c) openDialog({ type: 'cat', isNew: false, cat: Object.assign({}, c) }); break; }
    case 'delete-cat': {
      if (!d || S.cafe.menu.some(m => m.cat === d.cat.id)) break;
      if (!d.armDelete) { d.armDelete = true; renderDialog(); break; }
      d.busy = true; renderDialog();
      try { await writeCafe({ categories: S.cafe.categories.filter(c => c.id !== d.cat.id && c.id !== '_more') }, 'Category deleted.'); closeDialog(); } catch (err) { d.busy = false; renderDialog(); }
      break;
    }
    case 'close': closeDialog(); break;
    case 'close-bg': if (e.target === t) closeDialog(); break;
    case 'signout': await signOut(auth); toast('Signed out.'); break;
    case 'forgot': {
      const f = $('#login-form'); const email = f ? f.email.value.trim() : '';
      if (!email) { S.loginErr = 'Type your email above, then tap \u201CForgot password?\u201D again.'; S.loginRerender = true; render(); break; }
      try { await sendPasswordResetEmail(auth, email); } catch (err) {}
      toast('If that email has a login, a reset link is on its way.');
      break;
    }
  }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.dataset) return;
  if (t.dataset.actionChange === 'switch-cafe') location.href = '/counter?cafe=' + encodeURIComponent(t.value);
  if (t.dataset.actionChange === 'bill-include' && S.dialog) { S.dialog.skip[t.dataset.id] = !t.checked; renderDialog(); }
});
let qrTimer = null;
document.addEventListener('input', e => {
  const t = e.target, d = S.dialog;
  if (t.closest && t.closest('#settings-form')) S.settingsDirty = true;
  if (t.id === 'pos-search') { S.posSearch = t.value; render(); }
  if (t.id === 'draft-note' && S.pos) draftFor(S.pos.key).note = t.value;
  if (t.id === 'draft-name' && S.pos) draftFor(S.pos.key).name = t.value;
  if (d) {
    if (t.id === 'd-discount') { d.discount = t.value; renderDialog(); }
    else if (t.id === 'd-gst') { d.gstPct = t.value; renderDialog(); }
    else if (t.id === 'ed-search') { d.search = t.value; renderDialog(); }
    else if (t.id === 'ed-note') d.note = t.value;
    else if (t.id === 'd-other') d.other = t.value;
    else if (t.id === 'd-void') d.reason = t.value;
  }
  if (t.id === 'qr-base') {
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => {
      let v = t.value.trim(); if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
      S.qrBase = v || location.origin; ls.set('yumotap:qrBase', S.qrBase);
      const s = $('#qr-sample'); if (s) s.textContent = tableLink(1);
    }, 400);
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'login-form') {
    const email = f.email.value.trim(), pw = f.password.value;
    if (!email || !pw) { S.loginErr = 'Enter your email and password.'; S.loginRerender = true; render(); return; }
    S.loginBusy = true; S.loginErr = ''; S.loginRerender = true; render();
    const again = $('#login-form'); if (again) { again.email.value = email; again.password.value = pw; }
    try { await signInWithEmailAndPassword(auth, email, pw); S.loginBusy = false; }
    catch (err) {
      const c = err && err.code;
      S.loginErr = loginError(err);
      S.loginBusy = false; S.loginRerender = true; render();
      const f2 = $('#login-form'); if (f2) f2.email.value = email;
    }
  } else if (f.id === 'item-form') {
    const d = S.dialog, m = d.item;
    syncItemForm(d);
    const name = m.name.trim(), price = Number(m.price);
    if (!name) { d.err = 'Add a name.'; renderDialog(); return; }
    if (String(m.price).trim() === '' || !(price >= 0 && price <= 100000)) { d.err = 'Add a price.'; renderDialog(); return; }
    const photoChanged = d.photoNew !== undefined;
    const item = { id: m.id, name: name.slice(0, 60), desc: m.desc.trim().slice(0, 120), price: Math.round(price), veg: m.veg !== false, cat: m.cat, available: m.available !== false,
      chef: !!m.chef, photo: photoChanged ? !!d.photoNew : !!m.photo, spice: m.spice === undefined ? -1 : m.spice, allergens: (m.allergens || []).slice(),
      made: String(m.made || '').trim().slice(0, 300), taste: String(m.taste || '').trim().slice(0, 200),
      made_ml: String(m.made_ml || '').trim().slice(0, 300), taste_ml: String(m.taste_ml || '').trim().slice(0, 200) };
    const menu = S.cafe.menu.slice(); const i = menu.findIndex(x => x.id === item.id); if (i >= 0) menu[i] = item; else menu.push(item);
    if (photoChanged) {
      const all = Object.assign({}, S.photos || {}); all[item.id] = d.photoNew;
      if (Object.values(all).reduce((n, v) => n + (v ? v.length : 0), 0) > 900000) { d.err = 'Photo space is full (about 50 photos). Remove a few photos from other dishes first.'; renderDialog(); return; }
    }
    d.busy = true; d.err = ''; renderDialog();
    try {
      if (photoChanged) {
        await setDoc(doc(db, 'cafes', S.cafeId, 'media', 'photos'), { p: { [item.id]: d.photoNew } }, { merge: true });
        S.photos = Object.assign({}, S.photos || {}, { [item.id]: d.photoNew });
      }
      await writeCafe(Object.assign({ menu }, photoChanged ? { photosV: Date.now() } : {}), d.isNew ? item.name + ' added.' : 'Saved.'); closeDialog();
    } catch (err) { d.busy = false; if (!d.err) d.err = 'That didn\u2019t save. Check your internet and try again.'; renderDialog(); }
  } else if (f.id === 'cat-form') {
    const d = S.dialog, name = f.name.value.trim();
    if (!name) { d.err = 'Add a category name.'; renderDialog(); return; }
    const cats = S.cafe.categories.filter(c => c.id !== '_more' || S.cafe.menu.some(m => m.cat === '_more')).map(c => ({ id: c.id, name: c.name }));
    if (d.isNew) cats.push({ id: 'c' + newId().slice(1), name: name.slice(0, 40) }); else { const c = cats.find(x => x.id === d.cat.id); if (c) c.name = name.slice(0, 40); }
    d.busy = true; d.err = ''; renderDialog();
    try { await writeCafe({ categories: cats }, 'Saved.'); closeDialog(); } catch (err) { d.busy = false; renderDialog(); }
  } else if (f.id === 'settings-form') {
    const name = f.name.value.trim(), tables = parseInt(f.tables.value, 10), prepMins = parseInt(f.prepMins.value, 10), gstPct = num(f.gstPct.value);
    if (!name) { toast('Add your cafe\u2019s name.'); return; }
    if (!(tables >= 1 && tables <= 100)) { toast('Tables must be between 1 and 100.'); return; }
    if (!(prepMins >= 1 && prepMins <= 120)) { toast('Preparation time must be 1 to 120 minutes.'); return; }
    if (!(gstPct >= 0 && gstPct <= 28)) { toast('GST must be between 0 and 28%.'); return; }
    const settings = {
      prepMins, gstPct, address: f.address.value.trim().slice(0, 120), phone: f.phone.value.trim().slice(0, 30), gstin: f.gstin.value.trim().toUpperCase().slice(0, 20), footer: f.footer.value.trim().slice(0, 80), paper: f.paper.value === '58' ? '58' : '80',
      dayEndHour: Math.max(0, Math.min(6, parseInt(f.dayEndHour.value, 10) || 0)), unpaidMins: Math.max(0, Math.min(120, parseInt(f.unpaidMins.value, 10) || 0)),
      prize: f.prize ? f.prize.value.trim().slice(0, 60) : S.cafe.settings.prize, lbPeriod: f.lbPeriod ? (f.lbPeriod.value === 'week' ? 'week' : 'day') : S.cafe.settings.lbPeriod
    };
    S.savingSettings = true; S.settingsDirty = false; render();
    try { await writeCafe({ name: name.slice(0, 60), tables, settings }, 'Settings saved.'); } catch (err) {}
    S.savingSettings = false; render();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (S.dialog) closeDialog(); else if (S.calOpen) { closeCal(); render(); } else if (S.cartOpen) { S.cartOpen = false; render(); }
});

render();
