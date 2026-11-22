// Customer menu: opened by scanning a table's QR code, e.g. /cornercup?table=3
// Firebase loads in the background (see Start below), so the menu can appear before it's ready.
let fbP = null;
const FB = () => fbP || (fbP = import('./fb-menu.js'));
FB();
import { $, esc, rupee, shortCode, ls, toast, cleanCafe, iconFor, reducedMotion, toMs, payAmount, applyBrand, setFavicon, festNow, ALLERGENS, SPICE, SPICE_ML, SAMPLE_MENU } from './common.js';

const params = new URLSearchParams(location.search);
function readCafeId() {
  let c = params.get('cafe');
  if (!c) {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    if (seg && !/\.html?$/i.test(seg) && seg !== 'menu') c = seg;
  }
  try { c = decodeURIComponent(c || ''); } catch (e) { c = ''; }
  return c.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
}
const cafeId = readCafeId();
const qrTable = parseInt(params.get('table') || params.get('t'), 10);
const ORDERS_KEY = 'yumotap:' + cafeId + ':orders';

/* ---------- Table pass: only a phone that just scanned the table's QR can order ----------
   Scanning gives this browser tab a pass for that table. The table number is then removed
   from the address, so reopening the page later from history or a saved link can't order.
   The pass ends when the bill is paid, or 2 hours after the scan. Scanning again starts a new one. */
const PASS_KEY = 'yuno:pass:' + cafeId, PASS_MS = 2 * 3600000;
let memPass = null;
function readPass() {
  try { const p = JSON.parse(sessionStorage.getItem(PASS_KEY) || 'null'); if (p && p.t > 0) return p; } catch (e) {}
  return memPass;
}
function savePass(p) { memPass = p; try { sessionStorage.setItem(PASS_KEY, JSON.stringify(p)); } catch (e) {} }
function passState() {
  const p = readPass();
  if (!p) return 'none';
  if (p.done) return 'paid';
  if (Date.now() - p.at > PASS_MS) return 'expired';
  return 'ok';
}
if (qrTable > 0) {
  savePass({ t: qrTable, at: Date.now(), ids: [] });
  try {
    const u = new URL(location.href); u.searchParams.delete('table'); u.searchParams.delete('t');
    history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
  } catch (e) {}
}
const passTable = () => passState() === 'ok' ? readPass().t : null;
// When every order placed with this pass is paid (or was turned down), the visit is over.
function checkPassDone() {
  const p = readPass(); if (!p || p.done || !p.ids || !p.ids.length) return;
  const os = p.ids.map(id => S.orders[id]);
  if (os.some(o => !o)) return;
  if (os.every(o => o.paid || o.status === 'rejected' || o.status === 'cancelled') && os.some(o => o.paid)) {
    p.done = Date.now(); savePass(p); S.table = null; S.cart = {}; S.note = '';
    if (S.overlay === 'cart' || S.overlay === 'dish') { S.overlay = null; renderOverlay(); }
  }
}
const canOrder = () => S.demo || passState() === 'ok';
const NO_PASS_MSG = { paid: 'Your bill is paid. Thank you for coming! To order again, scan the QR code on your table.', expired: 'This order link has timed out. Scan the QR code on your table to order.', none: 'To order, scan the QR code on your table.' };

const STATUS_TEXT = {
  new: 'Waiting for the cafe to confirm',
  preparing: 'Your order is being prepared',
  ready: 'Your order is ready',
  served: 'Enjoy your food!',
  rejected: 'The cafe couldn\u2019t take this order',
  cancelled: 'This order was cancelled'
};
const SHORT = { new: 'waiting for the cafe', preparing: 'being prepared', ready: 'ready', served: 'served', rejected: 'not accepted', cancelled: 'cancelled' };
const TRACK = [['new', 'Sent'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served']];

const S = {
  state: cafeId ? 'loading' : 'nocafe',
  cafe: null,
  fresh: false,
  photos: {}, dishId: null, hLang: 'en', hAnswer: null, listening: false,
  table: passTable(),
  tableFromQR: true,
  cart: {}, note: '', noteOpen: false, overlay: null, view: 'menu', activeCat: null,
  orders: {}, placing: false, lastCallAt: 0, cancelArm: null
};

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const TONES = ['lime', 'sky', 'violet', 'butter'];

/* ---------- Helpers ---------- */
function menuById() { const m = {}; (S.cafe ? S.cafe.menu : []).forEach(i => { m[i.id] = i; }); return m; }
function myOrders() {
  return Object.values(S.orders).sort((a, b) => b.at - a.at);
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

/* ---------- Remember this phone's orders ---------- */
function tracked() {
  const list = ls.get(ORDERS_KEY, []);
  const cutoff = Date.now() - 12 * 3600 * 1000;
  return Array.isArray(list) ? list.filter(o => o && typeof o.id === 'string' && o.at > cutoff).slice(0, 5) : [];
}
function remember(id) { ls.set(ORDERS_KEY, [{ id, at: Date.now() }].concat(tracked().filter(o => o.id !== id)).slice(0, 5)); }
function forget(id) { ls.set(ORDERS_KEY, tracked().filter(o => o.id !== id)); }

const orderSubs = {};
function trackOrder(id, at) {
  if (orderSubs[id] || !/^[A-Za-z0-9]{10,40}$/.test(id)) return;
  orderSubs[id] = 'starting';
  FB().then(({ db, doc, onSnapshot }) => { if (orderSubs[id] !== 'starting') return; orderSubs[id] = onSnapshot(doc(db, 'cafes', cafeId, 'orders', id), snap => {
    if (!snap.exists()) { dropOrder(id); return; }
    let d;
    try { d = snap.data({ serverTimestamps: 'estimate' }) || {}; } catch (e) { d = snap.data() || {}; }
    const items = Array.isArray(d.items) ? d.items : [];
    S.orders[id] = {
      id, at: at || Date.now(),
      status: ['new', 'preparing', 'ready', 'served', 'rejected', 'cancelled'].includes(d.status) ? d.status : 'new',
      table: parseInt(d.table, 10) || 0,
      items: items.map(i => ({ name: String((i && i.name) || 'Item'), qty: parseInt(i && i.qty, 10) || 1, price: Number(i && i.price) || 0 })),
      total: Number(d.total) || 0,
      prepMins: parseInt(d.prepMins, 10) || 0,
      acceptedAt: d.acceptedAt ? toMs(d.acceptedAt) : 0,
      cancelledBy: d.cancelledBy === 'customer' ? 'customer' : 'cafe',
      cancelReason: typeof d.cancelReason === 'string' ? d.cancelReason.slice(0, 120) : '',
      paid: typeof d.billId === 'string' && d.billId.length > 0
    };
    checkPassDone();
    render();
  }, () => dropOrder(id)); }).catch(() => { delete orderSubs[id]; });
}
function dropOrder(id) {
  if (typeof orderSubs[id] === 'function') orderSubs[id](); delete orderSubs[id];
  delete S.orders[id];
  forget(id);
  render();
}

/* ---------- Paying ---------- */
// Once food is ready or served, remind the customer of their bill and to pay at the counter.
const orderSub = (o) => o.items.reduce((s, i) => s + i.qty * i.price, 0) || o.total;
function payPanel() {
  const due = myOrders().filter(o => !o.paid && (o.status === 'ready' || o.status === 'served'));
  if (!due.length) return '';
  const amount = payAmount(due.reduce((s, o) => s + orderSub(o), 0), S.cafe.settings.gstPct);
  return '<section class="pay-card"><p class="pay-k">Your bill</p><p class="pay-amt">' + rupee(amount) + '</p><p class="pay-msg">Please pay at the counter before you leave. Thank you!</p></section>';
}

/* ---------- Food photos ---------- */
// All of a cafe's photos are in one small record. The phone keeps a copy and only downloads
// again when the cafe changes a photo, so repeat scans cost nothing.
const FS_DOCS = 'https://firestore.googleapis.com/v1/projects/yumotapit-5027e/databases/(default)/documents/cafes/';
const FS_KEY = 'AIzaSyBe-MKZqI-z6HiSgBd3xK_3Vht8XY2KMgc'; // same public key as fb-menu.js
const PHOTO_KEY = 'yumotap:photos:' + cafeId;
let photosFor = -1;
function gotPhotos(p, v) {
  const clean = {}; Object.keys(p || {}).forEach(k => { if (typeof p[k] === 'string' && p[k].startsWith('data:image/')) clean[k] = p[k]; });
  S.photos = clean; ls.set(PHOTO_KEY, { v, p: clean }); render(); if (S.overlay === 'dish') renderOverlay();
}
function loadPhotos() {
  const c = S.cafe; if (!c || !c.menu.some(m => m.photo) || photosFor === c.photosV) return;
  photosFor = c.photosV;
  const saved = ls.get(PHOTO_KEY, null);
  if (saved && saved.p) { S.photos = saved.p; if (saved.v === c.photosV) return; }
  fetch(FS_DOCS + cafeId + '/media/photos?key=' + FS_KEY)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(j => gotPhotos((fromRest(j.fields || {}).p) || {}, c.photosV))
    .catch(() => FB().then(({ db, doc, getDoc }) => getDoc(doc(db, 'cafes', cafeId, 'media', 'photos')))
      .then(sn => gotPhotos(sn.exists() ? sn.data().p : {}, c.photosV)).catch(() => {}));
}

/* ---------- Dish details and the dish helper ---------- */
let hpP = null, helper = null;
const HP = () => hpP || (hpP = import('./helper.js').then(m => { helper = m; return m; }));
function badges(m) {
  return (m.chef ? '<span class="badge chef">\u2B50 Chef\u2019s pick</span>' : '') + (S.cafe.popular.includes(m.id) ? '<span class="badge pop">\u{1F525} Popular</span>' : '');
}
function dishSheet() {
  const byId = menuById(), m = byId[S.dishId]; if (!m || !helper) return '';
  const cat = S.cafe.categories.find(c => c.id === m.cat), [tone, svg] = iconFor(cat), photo = S.photos[m.id], ml = S.hLang === 'ml';
  const facts = [];
  const made = ml ? (m.made_ml || m.made) : m.made, taste = ml ? (m.taste_ml || m.taste) : m.taste;
  if (made) facts.push([ml ? '\u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46 \u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41' : 'How it\u2019s made', made]);
  if (taste) facts.push([ml ? '\u0D30\u0D41\u0D1A\u0D3F' : 'Taste', taste]);
  if (m.spice >= 0) facts.push([ml ? '\u0D0E\u0D30\u0D3F\u0D35\u0D4D' : 'Spice', (ml ? SPICE_ML : SPICE)[m.spice]]);
  if (m.allergens.length) facts.push([ml ? '\u0D05\u0D1F\u0D19\u0D4D\u0D19\u0D3F\u0D2F\u0D35' : 'Contains', m.allergens.map(k => { const a = ALLERGENS.find(x => x[0] === k); return a ? (ml ? a[2] : a[1]) : k; }).join(', ')]);
  const q = S.cart[m.id] || 0, A = S.hAnswer;
  const act = !m.available ? '<p class="sold-tag" style="display:inline-block">Sold out today</p>'
    : !canOrder() ? '<p class="pass-note">' + esc(NO_PASS_MSG[passState()]) + '</p>'
    : q ? '<div class="dish-act"><div class="step"><button type="button" data-action="dec" data-id="' + esc(m.id) + '" aria-label="Remove one">\u2212</button><span aria-live="polite">' + q + '</span><button type="button" data-action="inc" data-id="' + esc(m.id) + '" aria-label="Add one more">+</button></div><button type="button" class="btn-primary inline" data-action="close">Done</button></div>'
    : '<button type="button" class="btn-primary" data-action="inc" data-id="' + esc(m.id) + '">Add to order, ' + rupee(m.price) + '</button>';
  return '<div class="overlay" data-action="close-bg"><div class="sheet dish-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"><div class="grabber" aria-hidden="true"></div>' +
    (photo ? '<img class="dish-photo" src="' + photo + '" alt="Photo of ' + esc(m.name) + '">' : '<div class="dish-hero tile-' + tone + '" aria-hidden="true">' + svg + '</div>') +
    '<div class="sheet-top"><h2 id="sheet-h" tabindex="-1">' + esc(m.name) + '</h2><button type="button" class="x" data-action="close" aria-label="Close">\u2715</button></div>' +
    '<p class="dish-meta"><span class="vegmark' + (m.veg ? '' : ' nonveg') + '" role="img" aria-label="' + (m.veg ? 'Vegetarian' : 'Non-vegetarian') + '"></span><b>' + rupee(m.price) + '</b>' + badges(m) + '</p>' +
    (m.desc ? '<p class="dish-desc">' + esc(m.desc) + '</p>' : '') +
    (facts.length ? '<dl class="dish-facts">' + facts.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>' : '') +
    '<section class="helper" aria-label="Ask about this dish"><div class="helper-head"><h3>' + (ml ? '\u0D08 \u0D35\u0D3F\u0D2D\u0D35\u0D24\u0D4D\u0D24\u0D46\u0D15\u0D4D\u0D15\u0D41\u0D31\u0D3F\u0D1A\u0D4D\u0D1A\u0D4D \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D42' : 'Ask about this dish') + '</h3>' +
      '<div class="seg" role="group" aria-label="Language"><button type="button" data-action="hlang" data-l="en" aria-pressed="' + !ml + '">English</button><button type="button" data-action="hlang" data-l="ml" aria-pressed="' + ml + '">\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02</button></div></div>' +
      (helper.canListen() ? '<button type="button" class="mic-btn' + (S.listening ? ' on' : '') + '" data-action="mic" aria-pressed="' + !!S.listening + '"><span aria-hidden="true">\u{1F3A4}</span>' +
        (S.listening ? (ml ? '\u0D15\u0D47\u0D7E\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41\u2026' : 'Listening\u2026 ask now') : (ml ? '\u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D24\u0D4D \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D42' : 'Tap and ask out loud')) + '</button>' : '<p class="ha-note no-mic">' + esc(helper.noMicNote(S.hLang)) + '</p>') +
      '<div class="chips helper-qs">' + helper.QUESTIONS[ml ? 'ml' : 'en'].map(([k, l]) => '<button type="button" class="chip" data-action="ask" data-q="' + k + '">' + esc(l) + '</button>').join('') + '</div>' +
      (A ? '<div class="helper-ans" aria-live="polite">' + (A.heard ? '<p class="ha-q">\u201C' + esc(A.heard) + '\u201D</p>' : '') + '<p>' + esc(A.text) + '</p>' +
        (A.error ? '' : A.noVoice ? '<p class="ha-note">' + (ml ? '\u0D08 \u0D2B\u0D4B\u0D23\u0D3F\u0D28\u0D4D \u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02 \u0D35\u0D3E\u0D2F\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D7B \u0D15\u0D34\u0D3F\u0D2F\u0D3F\u0D32\u0D4D\u0D32. \u0D09\u0D24\u0D4D\u0D24\u0D30\u0D02 \u0D2E\u0D41\u0D15\u0D33\u0D3F\u0D7D \u0D15\u0D3E\u0D23\u0D3E\u0D02.' : 'This phone can\u2019t read this aloud. The answer is shown above.') + '</p>'
          : '<button type="button" class="linkbtn" data-action="say">\u{1F50A} ' + (ml ? '\u0D35\u0D40\u0D23\u0D4D\u0D1F\u0D41\u0D02 \u0D15\u0D47\u0D7E\u0D15\u0D4D\u0D15\u0D42' : 'Hear it again') + '</button>') + '</div>' : '') +
      '<p class="fine left">' + (ml ? '\u0D15\u0D2B\u0D47 \u0D0E\u0D34\u0D41\u0D24\u0D3F\u0D2F \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D2E\u0D3E\u0D24\u0D4D\u0D30\u0D02 \u0D05\u0D1F\u0D3F\u0D38\u0D4D\u0D25\u0D3E\u0D28\u0D2E\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F\u0D3E\u0D23\u0D4D \u0D09\u0D24\u0D4D\u0D24\u0D30\u0D02.' : 'Answers come only from what the cafe wrote about this dish.') + '</p></section>' +
    '<div class="dish-foot">' + act + '</div></div></div>';
}
function helperSay(heard, topic, asked) {
  const m = menuById()[S.dishId]; if (!m || !helper) return;
  const text = helper.answer(m, topic, S.hLang, asked), ans = { heard, text, noVoice: false };
  S.hAnswer = ans; withFocus(renderOverlay);
  helper.speak(text, S.hLang).then(ok => { if (!ok && S.hAnswer === ans && S.overlay === 'dish') { ans.noVoice = true; withFocus(renderOverlay); } });
}
async function openDish(id, trigger) {
  await HP();
  S.dishId = id; S.hAnswer = null; S.listening = false;
  openOverlay('dish', trigger);
}

/* ---------- After ordering: a little celebration, then games ---------- */
function placedSheet() {
  let confetti = '';
  if (!reducedMotion) for (let i = 0; i < 22; i++) confetti += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + ['#D6E96E', '#ABA0F7', '#B9CFEE', '#F5E9A9', '#FFB48C'][i % 5] + ';animation-delay:' + (Math.random() * 0.5).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random()).toFixed(2) + 's"></i>';
  return '<div class="overlay" data-action="close-bg"><div class="sheet placed-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"><div class="confetti" aria-hidden="true">' + confetti + '</div>' +
    '<div class="placed-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>' +
    '<h2 id="sheet-h" tabindex="-1">The cafe has your order!</h2><p class="placed-sub">We\u2019ll show it here as soon as the cafe accepts it and the food is ready.</p>' +
    (S.cafe && S.cafe.games ? '<button type="button" class="btn-primary" data-action="games">' + GAME_ICON_W + ' Play a game while you wait</button>' : '') +
    '<button type="button" class="btn-soft placed-later" data-action="close">See my order</button></div></div>';
}
// Leaderboard scores count only from phones that scanned a table QR in the last 4 hours (paid or not).
function openGames() {
  if (!S.cafe || !S.cafe.games) return;
  const p = readPass(), inCafe = !!p && Date.now() - p.at < 4 * 3600000;
  import('./games.js').then(g => g.openGames({ cafeId, demo: !!S.demo, inCafe, table: p ? p.t : 0, settings: S.cafe ? S.cafe.settings : {} }))
    .catch(() => toast('Couldn\u2019t open the games. Check your internet.'));
}
// The game button: a controller with a little crown, and "Play & win" when the cafe offers a prize.
const GAME_ICON_W = '<svg class="pg-ico" viewBox="0 0 32 32" aria-hidden="true"><path d="M10.5 12h11a6.5 6.5 0 0 1 6.3 8.1l-.6 2.4a3.3 3.3 0 0 1-5.6 1.5L19.7 22h-7.4l-1.9 2a3.3 3.3 0 0 1-5.6-1.5l-.6-2.4A6.5 6.5 0 0 1 10.5 12z" fill="currentColor"/></svg>';
const GAME_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10.5 12h11a6.5 6.5 0 0 1 6.3 8.1l-.6 2.4a3.3 3.3 0 0 1-5.6 1.5L19.7 22h-7.4l-1.9 2a3.3 3.3 0 0 1-5.6-1.5l-.6-2.4A6.5 6.5 0 0 1 10.5 12z" fill="currentColor"/><path d="M9.5 15.6v4M7.5 17.6h4" stroke="var(--gi-on,#fff)" stroke-width="1.8" stroke-linecap="round"/><circle cx="21" cy="16.4" r="1.4" fill="var(--gi-on,#fff)"/><circle cx="24" cy="19" r="1.4" fill="var(--gi-on,#fff)"/><path d="M12.5 9.6 14 5.8l2 2.4 2-2.4 1.5 3.8z" fill="#D6E96E" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';
function gameBtn() { if (!S.cafe || !S.cafe.games) return ''; const pz = S.cafe && S.cafe.settings.prize; return '<button type="button" class="c-games' + (pz ? ' win' : '') + '" data-action="games" data-key="games" aria-label="' + (pz ? 'Play games and win' : 'Games') + '">' + GAME_ICON + '<span>' + (pz ? 'Play & win' : 'Play') + '</span></button>'; }

/* ---------- Order again ---------- */
const LAST_KEY = 'yumotap:' + cafeId + ':last';
function lastOrder() {
  const last = ls.get(LAST_KEY, null), byId = menuById();
  if (!last || !Array.isArray(last.items) || Date.now() - last.at > 60 * 86400000) return [];
  return last.items.filter(x => byId[x.id] && byId[x.id].available).map(x => ({ id: x.id, qty: Math.max(1, Math.min(20, x.qty | 0)), name: byId[x.id].name }));
}
function reorderCard() {
  const items = lastOrder(); if (!items.length || !canOrder()) return '';
  return '<section class="reorder"><div><b>Order again?</b><span>' + items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '</span></div><button type="button" class="btn-primary inline" data-action="reorder" data-key="reorder">Add</button></section>';
}

/* ---------- Render ---------- */
function itemRow(m, cat) {
  const q = S.cart[m.id] || 0;
  const [tone, svg] = iconFor(cat);
  let act;
  if (!m.available) act = '<span class="sold-tag">Sold out</span>';
  else if (!canOrder()) act = '';
  else if (q) act = '<div class="step"><button type="button" data-action="dec" data-id="' + esc(m.id) + '" data-key="dec-' + esc(m.id) + '" aria-label="Remove one ' + esc(m.name) + '">\u2212</button><span aria-live="polite">' + q + '</span><button type="button" data-action="inc" data-id="' + esc(m.id) + '" data-key="inc-' + esc(m.id) + '" aria-label="Add one more ' + esc(m.name) + '">+</button></div>';
  else act = '<button type="button" class="btn-add" data-action="inc" data-id="' + esc(m.id) + '" data-key="inc-' + esc(m.id) + '" aria-label="Add ' + esc(m.name) + '">' + PLUS + '</button>';
  const photo = S.photos[m.id], idA = esc(m.id);
  return '<li class="item' + (m.available ? '' : ' is-sold') + '"><button type="button" class="tile-btn" data-action="dish" data-id="' + idA + '" data-key="dish-' + idA + '" aria-label="About ' + esc(m.name) + '">' +
    (photo ? '<img class="tile tile-photo" src="' + photo + '" alt="">' : '<span class="tile tile-' + tone + '" aria-hidden="true">' + svg + '</span>') + '</button>' +
    '<div class="item-main"><button type="button" class="item-open" data-action="dish" data-id="' + idA + '"><span class="item-title"><span class="vegmark' + (m.veg ? '' : ' nonveg') + '" role="img" aria-label="' + (m.veg ? 'Vegetarian' : 'Non-vegetarian') + '"></span><h3>' + esc(m.name) + '</h3></span>' +
    (m.chef || S.cafe.popular.includes(m.id) ? '<span class="badges">' + badges(m) + '</span>' : '') +
    (m.desc ? '<span class="item-desc">' + esc(m.desc) + '</span>' : '') + '</button>' +
    '<div class="item-foot"><p class="price">' + rupee(m.price) + '</p>' + act + '</div></div></li>';
}
function readyText(o) {
  if (!o.acceptedAt || !o.prepMins) return '';
  const m = Math.round((o.acceptedAt + o.prepMins * 60000 - Date.now()) / 60000);
  return m > 1 ? 'Ready in about ' + m + ' minutes' : m === 1 ? 'Ready in about 1 minute' : 'Almost ready';
}
function statusCard(o) {
  const stopped = o.status === 'rejected' || o.status === 'cancelled';
  const idx = o.status === 'served' ? 4 : ({ new: 0, preparing: 1, ready: 2 })[o.status];
  const track = stopped ? '' : '<ol class="track">' + TRACK.map((t, i) => '<li class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + t[1] + '</li>').join('') + '</ol>';
  let title = STATUS_TEXT[o.status], msg = '';
  if (o.status === 'new') msg = '<p class="st-msg">' + 'The kitchen starts as soon as the cafe accepts it. You can cancel until then.' + '</p>';
  if (o.status === 'preparing') { const rt = readyText(o); if (rt) msg = '<p class="st-eta">' + esc(rt) + '</p>'; }
  if (o.status === 'cancelled') title = o.cancelledBy === 'customer' ? 'You cancelled this order' : 'The cafe cancelled this order';
  if (stopped && o.cancelledBy !== 'customer') msg = '<p class="st-msg">' + (o.cancelReason ? 'Reason: ' + esc(o.cancelReason) + '. ' : '') + 'Please ask the staff at the counter for help.</p>';
  const armed = S.cancelArm === o.id;
  const cancelBtn = o.status === 'new' ? '<button type="button" class="btn-soft st-cancel' + (armed ? ' armed' : '') + '" data-action="cancel-order" data-id="' + esc(o.id) + '" data-key="cx-' + esc(o.id) + '">' + (armed ? 'Tap again to cancel' : 'Cancel order') + '</button>' : '';
  return '<article class="st-card s-' + o.status + '"><div class="st-top"><span>Order ' + shortCode(o.id) + '</span><span>Table ' + o.table + '</span></div>' +
    '<h2 class="st-title">' + esc(title) + '</h2>' + track + msg + (o.paid && !stopped ? '<p class="paid-pill">Paid. Thank you!</p>' : '') +
    '<p class="st-items">' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(', ') + '</p>' +
    '<p class="st-total">' + rupee(o.items.reduce((s, i) => s + i.qty * i.price, 0) || o.total) + (S.cafe && S.cafe.settings.gstPct ? ' <span class="muted">+ GST</span>' : '') + '</p>' + cancelBtn + '</article>';
}
function note(title, text) {
  return '<div class="center-note panel"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></div>';
}
function render() {
  withFocus(renderMain);
}
// Shown while the menu loads: the shape of the page, so it feels instant. Same markup as menu.html.
const SKELETON = '<div class="skel" aria-label="Loading the menu"><div class="sk-hero"><i class="sk-chip"></i><i class="sk-t1"></i><i class="sk-t2"></i></div>' +
  '<div class="sk-tiles"><i></i><i></i><i></i><i></i></div><div class="sk-list"><i></i><i></i><i></i></div></div>';
function renderMain() {
  const app = $('#app');
  if (S.state === 'nocafe') { app.innerHTML = note('Scan to see the menu', 'Scan the QR code on your table to open this cafe\u2019s menu.'); return; }
  if (S.state === 'loading') { app.innerHTML = SKELETON; return; }
  if (S.state === 'slow') { app.innerHTML = note('Still loading\u2026', 'Your internet seems slow. Keep this page open, or try again.') .replace('</div>', '<p style="margin-top:16px"><button type="button" class="btn-primary inline" data-action="reload">Try again</button></p></div>'); return; }
  if (S.state === 'missing') { app.innerHTML = note('Menu not found', 'We couldn\u2019t find this menu. Please scan the QR code on your table again.'); return; }
  if (S.state === 'error') { app.innerHTML = note('Couldn\u2019t load the menu', 'Check your internet connection, then refresh this page.'); return; }

  const c = S.cafe, byId = menuById(), mine = myOrders();
  let view = S.view;
  if (view === 'status' && !mine.length) view = 'menu';
  let count = 0, total = 0;
  Object.keys(S.cart).forEach(id => { if (byId[id]) { count += S.cart[id]; total += byId[id].price * S.cart[id]; } });

  const tableChip = S.demo
    ? '<button type="button" class="chip-table" data-action="open-table" data-key="table">' + (S.table ? 'Table ' + S.table : 'Pick table') + '</button>'
    : canOrder() && S.table ? '<span class="chip-table">Table ' + S.table + '</span>' : '<span class="chip-table off">Scan to order</span>';
  let h = '<header class="c-head' + (festNow(c.brand) ? ' fest' : '') + '"' + (festNow(c.brand) ? ' data-deco="' + festNow(c.brand).deco + '"' : '') + '><div class="c-top">' + tableChip + '<span class="c-top-r">' + gameBtn() + '' + (canOrder() ? '<button type="button" class="c-call" data-action="call" data-key="call" aria-label="Call a waiter">' + BELL + '<span class="cc-t">Call waiter</span></button>' : '') + '</span></div>' +
    (c.brand.logo ? '<img class="c-logo" src="' + c.brand.logo + '" alt="' + esc(c.name) + ' logo">' : '') + '<h1 class="c-cafe">' + esc(c.name) + '</h1>' + (festNow(c.brand) ? '<p class="c-fest"><span aria-hidden="true">' + festNow(c.brand).deco + '</span> ' + festNow(c.brand).msg + '</p>' : '') + '<p class="c-sub">' + (view === 'menu' ? (canOrder() ? 'Tap + to add food. Tap Place order when you\u2019re done.' : 'Have a look at our menu.') : 'Thanks for your order! You can follow it here.') + '</p></header>';
  if (!canOrder() && view === 'menu') h += '<p class="banner pass-banner">' + NO_PASS_MSG[passState()] + '</p>';
  if (!c.acceptingOrders) h += '<p class="banner">The cafe isn\u2019t taking phone orders right now. You can still see the menu. Please order at the counter.</p>';

  if (view === 'menu') {
    const cats = c.categories.filter(cat => c.menu.some(m => m.cat === cat.id));
    if (!cats.length) {
      h += '<div class="status"><p class="empty">The menu is being updated. Please check back in a minute.</p></div>';
    } else {
      if (!S.activeCat || !cats.some(x => x.id === S.activeCat)) S.activeCat = cats[0].id;
      if (cats.length > 1) h += '<nav class="c-tiles" aria-label="Menu sections">' + cats.map((cat, i) => { const n = c.menu.filter(m => m.cat === cat.id).length; return '<button type="button" class="c-tile t-' + TONES[i % 4] + '" data-action="cat" data-cat="' + esc(cat.id) + '" data-key="tile-' + esc(cat.id) + '"><b>' + esc(cat.name) + '</b><span>' + n + (n === 1 ? ' dish' : ' dishes') + '</span></button>'; }).join('') + '</nav>';
      if (S.demo) h += '<p class="banner demo-banner">This is a demo cafe. Orders aren\u2019t sent anywhere, so try everything: order, ask about dishes, play games.</p>';
      if (count === 0) h += reorderCard();
      if (c.games && mine.some(o => ['new', 'preparing'].includes(o.status))) h += '<button type="button" class="games-banner" data-action="games"><span class="gb-ico">' + GAME_ICON + '</span><span><b>Waiting for your food?</b> ' + (c.settings.prize ? 'Top the cafe leaderboard and win ' + esc(c.settings.prize) + '.' : 'Play a quick game with your table.') + '</span></button>';
      if (cats.length > 1) h += '<nav class="cats" aria-label="Jump to a section">' + cats.map(cat => '<button type="button" data-action="cat" data-cat="' + esc(cat.id) + '" data-key="cat-' + esc(cat.id) + '" aria-pressed="' + (S.activeCat === cat.id) + '">' + esc(cat.name) + '</button>').join('') + '</nav>';
      h += cats.map(cat => '<section class="cat-sec" id="sec-' + esc(cat.id) + '"><h2 class="cat-h">' + esc(cat.name) + '</h2><ul class="items">' +
        c.menu.filter(m => m.cat === cat.id).map(m => itemRow(m, cat)).join('') + '</ul></section>').join('');
    }
    h += '<p class="c-foot">Ordering by <b>YUNO</b></p>';
    if (count > 0) {
      h += '<div class="cartbar"><button type="button" class="cartbtn" data-action="open-cart" data-key="open-cart"><span><span class="cb-count">' + count + ' item' + (count > 1 ? 's' : '') + '</span><span class="cb-total">' + rupee(total) + '</span></span><span class="cb-go">Place order</span></button></div>';
    } else {
      const active = mine.find(o => o.status === 'new' || o.status === 'preparing' || o.status === 'ready');
      if (active) h += '<div class="cartbar"><button type="button" class="trackbtn" data-action="show-status" data-key="track"><span>Order ' + shortCode(active.id) + ' is ' + SHORT[active.status] + '</span><span class="cb-go">Track</span></button></div>';
    }
  } else {
    h += '<div class="status" aria-live="polite">' + payPanel() + mine.slice(0, 3).map(statusCard).join('') +
      (c.games && mine.some(o => ['new', 'preparing', 'ready'].includes(o.status)) ? '<button type="button" class="games-banner" data-action="games"><span class="gb-ico">' + GAME_ICON + '</span><span><b>Play while you wait</b> Tea Stack, Chai Rush, quiz and more. Get on the cafe leaderboard!</span></button>' : '') +
      (canOrder()
        ? '<div class="st-btns"><button type="button" class="btn-primary" data-action="more" data-key="more">Order more food</button><button type="button" class="btn-soft" data-action="call" data-key="call2">Call a waiter</button></div>'
        : '<section class="visit-done"><div class="vd-check" aria-hidden="true">' + (passState() === 'paid' ? '\u2713' : '\u{1F4F7}') + '</div>' +
          '<h2>' + (passState() === 'paid' ? 'Bill paid. Thank you!' : 'Scan to order') + '</h2><p>' + esc(NO_PASS_MSG[passState()]) + '</p>' +
          '<button type="button" class="btn-soft" data-action="more" data-key="more">See the menu</button></section>') + '</div>';
    h += '<p class="c-foot">Ordering by <b>YUNO</b></p>';
  }
  app.innerHTML = h;
  updateCats();
}
// The slim section bar only appears once the big category tiles have scrolled away,
// and it highlights the section you're reading.
function updateCats() {
  const tiles = document.querySelector('.c-tiles'), bar = document.querySelector('.cats');
  const show = !!tiles && tiles.getBoundingClientRect().bottom < 0;
  document.body.classList.toggle('show-cats', show);
  if (!bar) return;
  bar.inert = !show;
  let cur = null;
  document.querySelectorAll('.cat-sec').forEach(sec => { if (sec.getBoundingClientRect().top < 120) cur = sec.id.slice(4); });
  if (cur) bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cur)));
}
let catsTick = false;
window.addEventListener('scroll', () => { if (catsTick) return; catsTick = true; requestAnimationFrame(() => { catsTick = false; updateCats(); }); }, { passive: true });

function cartSheet() {
  const byId = menuById();
  const ids = Object.keys(S.cart).filter(id => S.cart[id] > 0 && byId[id]);
  const total = ids.reduce((s, id) => s + byId[id].price * S.cart[id], 0);
  const paused = !S.cafe.acceptingOrders;
  let body;
  if (ids.length) {
    body = '<ul class="lines">' + ids.map(id => {
      const m = byId[id], q = S.cart[id];
      return '<li class="line"><span class="line-name">' + esc(m.name) + '<small>' + rupee(m.price) + ' each</small></span><div class="step step-sm"><button type="button" data-action="dec" data-id="' + esc(id) + '" data-key="sdec-' + esc(id) + '" aria-label="Remove one ' + esc(m.name) + '">\u2212</button><span>' + q + '</span><button type="button" data-action="inc" data-id="' + esc(id) + '" data-key="sinc-' + esc(id) + '" aria-label="Add one more ' + esc(m.name) + '">+</button></div><span class="line-price">' + rupee(m.price * q) + '</span></li>';
    }).join('') + '</ul>' +
      (S.noteOpen || S.note
        ? '<label class="note-label" for="note">Note for the kitchen</label><textarea id="note" data-key="note" maxlength="200" placeholder="Less sugar, no onion, extra spicy">' + esc(S.note) + '</textarea>'
        : '<button type="button" class="note-toggle" data-action="note-open" data-key="note-open">' + PLUS + 'Add a note for the kitchen (optional)</button>') +
      '<div class="sum"><span>Total' + (S.cafe.settings.gstPct ? ' <small>+ GST</small>' : '') + '</span><b>' + rupee(total) + '</b></div>' +
      (canOrder() ? '' : '<p class="pass-note">' + NO_PASS_MSG[passState()] + '</p>') +
      '<button type="button" class="btn-primary" data-action="place" data-key="place"' + (S.placing || paused || !S.fresh || !canOrder() ? ' disabled' : '') + '>' +
      (S.placing ? 'Placing order\u2026' : !canOrder() ? 'Scan the table QR to order' : paused ? 'Ordering is paused' : !S.fresh ? 'Getting the latest menu\u2026' : 'Place order for ' + rupee(total)) + '</button>' +
      '<p class="fine">' + 'The cafe confirms your order before the kitchen starts.' + '</p>';
  } else {
    body = '<p class="empty">Your order is empty. Add something from the menu.</p>';
  }
  return '<div class="overlay" data-action="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"><div class="grabber" aria-hidden="true"></div>' +
    '<div class="sheet-top"><h2 id="sheet-h" tabindex="-1">Your order</h2>' + (S.table ? '<span class="sheet-sub">Table ' + S.table + '</span>' : '') +
    '<button type="button" class="x" data-action="close" data-key="close" aria-label="Close">\u2715</button></div>' + body + '</div></div>';
}
function tableSheet() {
  let b = '';
  for (let i = 1; i <= S.cafe.tables; i++) b += '<button type="button" data-action="pick-table" data-t="' + i + '" data-key="t-' + i + '" aria-pressed="' + (S.table === i) + '">' + i + '</button>';
  return '<div class="overlay" data-action="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h"><div class="grabber" aria-hidden="true"></div>' +
    '<div class="sheet-top"><h2 id="sheet-h" tabindex="-1">Which table are you at?</h2><button type="button" class="x" data-action="close" data-key="close" aria-label="Close">\u2715</button></div>' +
    '<p class="sheet-sub">The number is printed next to the QR code on your table.</p><div class="tgrid">' + b + '</div></div></div>';
}
let animNext = false;
function renderOverlay() {
  const el = $('#overlay');
  if (!S.cafe) { el.innerHTML = ''; return; }
  let h = S.overlay === 'cart' ? cartSheet() : S.overlay === 'table' ? tableSheet() : S.overlay === 'dish' ? dishSheet() : S.overlay === 'placed' ? placedSheet() : '';
  if (animNext) h = h.replace('<div class="overlay"', '<div class="overlay anim"');
  animNext = false;
  el.innerHTML = h;
}
let lastTrigger = null;
function openOverlay(kind, trigger) {
  S.overlay = kind; lastTrigger = trigger && trigger.dataset.key; animNext = true; renderOverlay();
  const h = $('#sheet-h'); if (h) h.focus({ preventScroll: true });
}
function closeOverlay() {
  if (S.overlay === 'dish' && helper) { helper.stopSpeaking(); helper.stopListening(); S.listening = false; }
  S.overlay = null; renderOverlay();
  if (lastTrigger) { const el = document.querySelector('[data-key="' + CSS.escape(lastTrigger) + '"]'); if (el) el.focus({ preventScroll: true }); }
}

/* ---------- Actions ---------- */
async function placeOrder() {
  if (S.placing || !S.cafe || !S.fresh) return;
  if (!canOrder()) { toast(NO_PASS_MSG[passState()]); render(); renderOverlay(); return; }
  if (!S.cafe.acceptingOrders) { toast('The cafe isn\u2019t taking phone orders right now.'); return; }
  if (!(S.table >= 1 && S.table <= S.cafe.tables)) { openOverlay('table'); toast('Pick your table first.'); return; }
  const byId = menuById();
  const ids = Object.keys(S.cart).filter(id => S.cart[id] > 0 && byId[id] && byId[id].available);
  if (!ids.length) return;
  const items = ids.map(id => ({ id, name: byId[id].name, qty: S.cart[id], price: byId[id].price }));
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  if (S.demo) {
    demoPlace(items, total);
    ls.set(LAST_KEY, { items: items.map(i => ({ id: i.id, qty: i.qty })), at: Date.now() });
    S.cart = {}; S.note = ''; S.noteOpen = false; S.view = 'status'; S.overlay = 'placed'; animNext = true;
    window.scrollTo(0, 0); renderOverlay(); render(); return;
  }
  S.placing = true; withFocus(renderOverlay);
  const slow = setTimeout(() => { if (S.placing) toast('Still sending\u2026 check your internet connection.'); }, 12000);
  try {
    const { db, collection, addDoc, serverTimestamp } = await FB();
    const ref = await addDoc(collection(db, 'cafes', cafeId, 'orders'), {
      table: S.table, items, note: S.note.trim().slice(0, 200), total, status: 'new', createdAt: serverTimestamp()
    });
    remember(ref.id);
    { const p = readPass(); if (p) { p.ids = (p.ids || []).concat(ref.id).slice(-30); savePass(p); } }
    trackOrder(ref.id, Date.now());
    ls.set(LAST_KEY, { items: items.map(i => ({ id: i.id, qty: i.qty })), at: Date.now() });
    S.cart = {}; S.note = ''; S.noteOpen = false; S.view = 'status'; S.overlay = 'placed'; animNext = true;
    window.scrollTo(0, 0);
  } catch (e) {
    toast(e && e.code === 'permission-denied'
      ? 'The cafe isn\u2019t taking phone orders right now. Please order at the counter.'
      : 'The order didn\u2019t go through. Check your internet and try again.');
  } finally {
    clearTimeout(slow);
    S.placing = false; renderOverlay(); render();
  }
}
async function callWaiter() {
  if (!S.cafe) return;
  if (!canOrder()) { toast(NO_PASS_MSG[passState()]); return; }
  if (!(S.table >= 1 && S.table <= S.cafe.tables)) { openOverlay('table'); toast('Pick your table first.'); return; }
  if (S.demo) { toast('Demo: at a real cafe, a waiter would now come to table ' + S.table + '.'); return; }
  if (Date.now() - S.lastCallAt < 30000) { toast('A waiter is already on the way.'); return; }
  S.lastCallAt = Date.now();
  try {
    const { db, collection, addDoc, serverTimestamp } = await FB();
    await addDoc(collection(db, 'cafes', cafeId, 'calls'), { table: S.table, createdAt: serverTimestamp() });
    toast('A waiter is on the way to table ' + S.table + '.');
  } catch (e) {
    S.lastCallAt = 0;
    toast('The call didn\u2019t go through. Please wave to the staff.');
  }
}
function refreshCart(bump) {
  withFocus(() => { renderMain(); if (S.overlay === 'cart' || S.overlay === 'dish') renderOverlay(); });
  if (bump && !reducedMotion) { const cb = document.querySelector('.cartbtn'); if (cb) cb.classList.add('bump'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action, id = t.dataset.id, byId = menuById();
  switch (a) {
    case 'cat': {
      S.activeCat = t.dataset.cat; render();
      const sec = document.getElementById('sec-' + t.dataset.cat);
      if (sec) sec.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      break;
    }
    case 'inc': if (!canOrder()) { toast(NO_PASS_MSG[passState()]); break; } if (byId[id] && byId[id].available) { S.cart[id] = Math.min(20, (S.cart[id] || 0) + 1); refreshCart(true); } break;
    case 'dec': if (S.cart[id]) { S.cart[id]--; if (S.cart[id] <= 0) delete S.cart[id]; } refreshCart(false); break;
    case 'open-cart': openOverlay('cart', t); break;
    case 'open-table': if (S.demo) openOverlay('table', t); break;
    case 'close': closeOverlay(); break;
    case 'close-bg': if (e.target === t) closeOverlay(); break;
    case 'pick-table': {
      S.table = parseInt(t.dataset.t, 10) || S.table;
      const wasOrdering = Object.keys(S.cart).length > 0;
      S.overlay = wasOrdering ? 'cart' : null; renderOverlay(); render();
      toast('You\u2019re ordering for table ' + S.table + '.');
      break;
    }
    case 'place': placeOrder(); break;
    case 'show-status': S.view = 'status'; render(); window.scrollTo(0, 0); break;
    case 'more': S.view = 'menu'; render(); window.scrollTo(0, 0); break;
    case 'call': callWaiter(); break;
    case 'dish': openDish(id, t); break;
    case 'games': if (S.overlay) { S.overlay = null; renderOverlay(); } openGames(); break;
    case 'reorder': if (!canOrder()) break; { lastOrder().forEach(x => { S.cart[x.id] = Math.min(20, (S.cart[x.id] || 0) + x.qty); }); refreshCart(true); toast('Added your last order. Change anything you like.'); break; }
    case 'hlang': S.hLang = t.dataset.l === 'ml' ? 'ml' : 'en'; S.hAnswer = null; if (helper) helper.stopSpeaking(); withFocus(renderOverlay); break;
    case 'ask': if (helper) helper.unlockSpeech(); helperSay('', t.dataset.q, []); break;
    case 'say': if (helper && S.hAnswer) { helper.unlockSpeech(); helper.speak(S.hAnswer.text, S.hLang); } break;
    case 'mic': {
      if (!helper) break;
      if (S.listening) { helper.stopListening(); S.listening = false; withFocus(renderOverlay); break; }
      helper.stopSpeaking(); helper.unlockSpeech();
      S.listening = true; S.hAnswer = null; withFocus(renderOverlay);
      helper.listen(S.hLang).then(heard => { S.listening = false; const u = helper.understand(heard); helperSay(heard.split(' | ')[0], u.topic, u.asked); })
        .catch(err => { S.listening = false; S.hAnswer = { heard: '', text: helper.voiceError(err && err.message, S.hLang), noVoice: true, error: true }; withFocus(renderOverlay); });
      break;
    }
    case 'reload': location.reload(); break;
    case 'note-open': { S.noteOpen = true; renderOverlay(); const n = $('#note'); if (n) n.focus(); break; }
    case 'cancel-order': {
      if (S.cancelArm !== id) {
        S.cancelArm = id; render();
        setTimeout(() => { if (S.cancelArm === id) { S.cancelArm = null; render(); } }, 3500);
        break;
      }
      S.cancelArm = null;
      if (orderSubs[id] === 'demo') { (demoTimers[id] || []).forEach(clearTimeout); demoStep(id, { status: 'cancelled', cancelledBy: 'customer' }); break; }
      FB().then(({ db, doc, updateDoc, serverTimestamp }) => updateDoc(doc(db, 'cafes', cafeId, 'orders', id), { status: 'cancelled', cancelledBy: 'customer', updatedAt: serverTimestamp() }))
        .then(() => toast('Your order is cancelled.'))
        .catch(() => toast('The cafe already accepted your order. Please ask the staff if you want to cancel.'));
      break;
    }
  }
});
document.addEventListener('input', e => { if (e.target && e.target.id === 'note') S.note = e.target.value; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.overlay) closeOverlay(); });

/* ---------- Built-in demo ---------- */
// The home page QR opens cafe=demo. If nobody has created a "demo" cafe in Admin, this sample
// cafe is shown instead, so the demo always works for new shops. Orders here go nowhere:
// they play out by themselves (accepted, cooking, ready, served) so people can see the whole flow.
const isDemoId = cafeId === 'demo';
const DEMO_DETAILS = {
  c1: { made: 'A double shot of espresso topped with steamed milk and a thick layer of milk foam.', taste: 'Smooth, creamy and gently bitter.', spice: 0, allergens: ['milk'] },
  c2: { made: 'Coffee blended with ice, milk and a scoop of vanilla ice cream.', taste: 'Cold, sweet and creamy.', spice: 0, allergens: ['milk'], chef: true },
  c3: { made: 'Espresso with steamed milk and hazelnut syrup.', taste: 'Sweet and nutty.', spice: 0, allergens: ['milk', 'nuts'] },
  t1: { made: 'Tea leaves boiled with milk, ginger, cardamom and a little sugar.', taste: 'Strong, sweet and warming.', spice: 1, allergens: ['milk'],
        made_ml: 'പാലിൽ ചായപ്പൊടി, ഇഞ്ചി, ഏലക്ക, പഞ്ചസാര എന്നിവ ചേർത്ത് തിളപ്പിക്കുന്നു.', taste_ml: 'കടുപ്പമുള്ള, മധുരമുള്ള ചായ.' },
  t2: { made: 'Black tea cooled over ice with fresh lemon juice and mint.', taste: 'Fresh, tangy and lightly sweet.', spice: 0, allergens: [] },
  t3: { made: 'Fresh lime juice with soda, made sweet, salted or mixed.', taste: 'Fizzy and refreshing.', spice: 0, allergens: [] },
  s1: { made: 'Three layers of toasted bread with vegetables, cheese and sauce, grilled and served with fries.', taste: 'Crunchy and cheesy.', spice: 1, allergens: ['gluten', 'milk'], chef: true },
  s2: { made: 'Flaky puff pastry filled with spiced chicken masala, then baked.', taste: 'Crispy and spicy.', spice: 2, allergens: ['gluten'],
        made_ml: 'മസാല ചേർത്ത ചിക്കൻ നിറച്ച പഫ്, ഓവനിൽ ബേക്ക് ചെയ്തത്.', taste_ml: 'മൊരിഞ്ഞതും എരിവുള്ളതും.' },
  s3: { made: 'Potato fries tossed in peri peri seasoning.', taste: 'Crispy, salty and hot.', spice: 3, allergens: [] },
  d1: { made: 'An eggless chocolate brownie, served warm.', taste: 'Rich, fudgy and sweet.', spice: 0, allergens: ['gluten', 'milk'] },
  d2: { made: 'Eggless banana cake baked with walnuts, lightly toasted.', taste: 'Soft, sweet and nutty.', spice: 0, allergens: ['gluten', 'nuts', 'milk'] }
};
const DEMO_CAFE = {
  name: 'YUNO Demo Cafe', tables: 10, acceptingOrders: true, popular: ['t1', 's2'],
  categories: SAMPLE_MENU.categories,
  menu: SAMPLE_MENU.menu.map(m => Object.assign({}, m, DEMO_DETAILS[m.id] || {})),
  settings: { gstPct: 0, prepMins: 1 }, brand: { theme: 'fresh', mode: 'auto' }
};
function showDemo() { S.demo = true; try { localStorage.removeItem(CACHE_KEY); } catch (e) {} showCafe(DEMO_CAFE, true); }
const demoTimers = {};
function demoStep(id, patch) { const o = S.orders[id]; if (!o || o.status === 'cancelled') return; Object.assign(o, patch); render(); }
function demoPlace(items, total) {
  const id = 'demo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  S.orders[id] = { id, at: Date.now(), status: 'new', table: S.table, items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price })), total,
    prepMins: 1, acceptedAt: 0, cancelledBy: 'cafe', cancelReason: '', paid: false };
  orderSubs[id] = 'demo';
  demoTimers[id] = [
    setTimeout(() => demoStep(id, { status: 'preparing', acceptedAt: Date.now() }), 4000),
    setTimeout(() => demoStep(id, { status: 'ready' }), 25000),
    setTimeout(() => demoStep(id, { status: 'served' }), 45000)
  ];
}

/* ---------- Start ---------- */
// Speed: the menu is shown from (1) this phone's saved copy, instantly, then (2) a quick
// one-off fetch started in menu.html, then (3) the live Firebase connection, which keeps it
// up to date. Ordering waits for fresh data, so nobody orders from an old price list.
const CACHE_KEY = 'yumotap:menu:' + cafeId;
function fromRest(fields) {
  const val = v => 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
    : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? Date.parse(v.timestampValue) : 'mapValue' in v ? fromRest(v.mapValue.fields || {})
    : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : null;
  const o = {}; Object.keys(fields || {}).forEach(k => { o[k] = val(fields[k]); }); return o;
}
function showCafe(data, fresh) {
  S.cafe = cleanCafe(data);
  S.state = 'ready';
  if (fresh) S.fresh = true;
  if (fresh) setTimeout(loadPhotos, 0);
  document.title = S.cafe.name + ' menu';
  applyBrand(S.cafe.brand); setFavicon(S.cafe.brand.logo);
  if (S.table && S.table > S.cafe.tables) S.table = null;
  const byId = menuById(), removed = [];
  Object.keys(S.cart).forEach(id => { if (!byId[id] || !byId[id].available) { removed.push(byId[id] ? byId[id].name : 'An item'); delete S.cart[id]; } });
  if (removed.length) toast(removed.join(', ') + (removed.length > 1 ? ' just sold out and were' : ' just sold out and was') + ' removed from your order.');
  render();
  if (S.overlay) withFocus(renderOverlay);
}
function cafeGone() { S.state = 'missing'; S.cafe = null; try { localStorage.removeItem(CACHE_KEY); } catch (e) {} render(); renderOverlay(); }
setInterval(() => { if (Object.values(S.orders).some(o => o.status === 'preparing')) render(); }, 30000);
if (cafeId) {
  let live = false;
  const saved = ls.get(CACHE_KEY, null);
  if (saved && saved.data && Date.now() - saved.at < 30 * 86400000) showCafe(saved.data, false);
  Promise.resolve(window.__cafeP).then(r => {
    if (live || !r) return;
    if (r === 'missing') { if (isDemoId) showDemo(); else cafeGone(); return; }
    if (r.fields) { const d = fromRest(r.fields); S.demo = false; showCafe(d, true); ls.set(CACHE_KEY, { at: Date.now(), data: d }); }
  }).catch(() => {});
  FB().then(({ db, doc, onSnapshot }) => {
    onSnapshot(doc(db, 'cafes', cafeId), snap => {
      live = true;
      if (!snap.exists()) { if (isDemoId) showDemo(); else cafeGone(); return; }
      const d = snap.data(); S.demo = false;
      showCafe(d, true);
      ls.set(CACHE_KEY, { at: Date.now(), data: d });
    }, () => { if (isDemoId) showDemo(); else if (!S.cafe) { S.state = 'error'; render(); } });
  }).catch(() => { if (isDemoId) showDemo(); else if (!S.cafe) { S.state = 'error'; render(); } });
  setTimeout(() => { if (S.state === 'loading') { if (isDemoId) showDemo(); else { S.state = 'slow'; render(); } } }, 12000);
  tracked().forEach(o => trackOrder(o.id, o.at));
}
render();
