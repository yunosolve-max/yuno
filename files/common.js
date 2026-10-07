// Small helpers shared by every YUNO page.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const rupee = (n) => '\u20B9' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const shortCode = (id) => '#' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
export const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const toMs = (ts) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : (typeof ts === 'number' ? ts : Date.now());
export function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  return Math.floor(m / 60) + ' hr ago';
}
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}

// Two-note chime for new orders. Browsers only allow sound after a tap, so pages unlock it on the first click.
let audioCtx = null;
export function unlockAudio() {
  try {
    if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
export function chime() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = t + i * 0.16;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.38);
      o.connect(g); g.connect(audioCtx.destination); o.start(s); o.stop(s + 0.42);
    });
  } catch (e) {}
}
// Loud alarm for new orders: sharp high-low beeps, like a kitchen alarm, for 20 seconds.
// stopAlarm() cuts it off early (for example when the order is accepted).
let alarmOut = null, alarmEnd = 0;
export function alarm(seconds = 20) {
  if (!audioCtx) return;
  stopAlarm();
  try {
    const t0 = audioCtx.currentTime + 0.02, cycle = 1.8;
    const out = audioCtx.createGain(); out.gain.value = 1; out.connect(audioCtx.destination);
    const notes = [1046, 784, 1046, 784, 1046, 784];
    for (let c = 0; c * cycle < seconds; c++) {
      notes.forEach((f, i) => {
        const s = t0 + c * cycle + i * 0.2 + (i >= 3 ? 0.25 : 0);
        if (s - t0 > seconds) return;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.32, s + 0.01);
        g.gain.setValueAtTime(0.32, s + 0.14); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
        o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.2);
      });
    }
    alarmOut = out; alarmEnd = Date.now() + seconds * 1000;
  } catch (e) {}
}
export function stopAlarm() { if (alarmOut) { try { alarmOut.disconnect(); } catch (e) {} } alarmOut = null; alarmEnd = 0; }
export function alarmPlaying() { return Date.now() < alarmEnd; }
export function audioReady() { return !!(audioCtx && audioCtx.state === 'running'); }

// Web names (the part of the link after the domain) that pages already use.
export const RESERVED = ['counter', 'kitchen', 'admin', 'menu', 'index', 'css', 'js', 'api', 'qr'];
export function slugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
export function slugProblem(slug) {
  if (!slug) return 'Add a web name.';
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return 'Use 2 to 40 small letters, numbers, or dashes.';
  if (RESERVED.some(r => slug.startsWith(r))) return 'Web names can\u2019t start with counter, kitchen, admin, or menu.';
  return '';
}

// Clean up menu data from the database so the page never breaks on odd values.
export function cleanCafe(d) {
  d = d || {};
  const categories = Array.isArray(d.categories) ? d.categories.filter(c => c && c.id).map(c => ({ id: String(c.id), name: String(c.name || 'Menu').slice(0, 40) })) : [];
  const menu = Array.isArray(d.menu) ? d.menu.filter(m => m && m.id).map(m => ({
    id: String(m.id), name: String(m.name || 'Item').slice(0, 60), desc: String(m.desc || '').slice(0, 120),
    price: Math.max(0, Number(m.price) || 0), veg: m.veg !== false, cat: String(m.cat || ''), available: m.available !== false,
    // Extras: Chef's pick badge, photo flag, and the facts the dish helper answers from.
    chef: m.chef === true, photo: m.photo === true,
    // Spice: -1 means the cafe hasn't said, so the helper won't guess. 0 not spicy ... 3 hot.
    spice: (m.spice === undefined || m.spice === null || m.spice === '' || isNaN(parseInt(m.spice, 10))) ? -1 : Math.max(-1, Math.min(3, parseInt(m.spice, 10))),
    made: String(m.made || '').slice(0, 300), taste: String(m.taste || '').slice(0, 200),
    made_ml: String(m.made_ml || '').slice(0, 300), taste_ml: String(m.taste_ml || '').slice(0, 200),
    allergens: Array.isArray(m.allergens) ? m.allergens.filter(a => ALLERGENS.some(x => x[0] === a)) : []
  })) : [];
  const known = new Set(categories.map(c => c.id));
  if (menu.some(m => !known.has(m.cat))) categories.push({ id: '_more', name: 'More' });
  menu.forEach(m => { if (!known.has(m.cat)) m.cat = '_more'; });
  const st = (d.settings && typeof d.settings === 'object') ? d.settings : {};
  const settings = {
    gstPct: Math.max(0, Math.min(28, Number(st.gstPct) || 0)),
    prepMins: Math.max(1, Math.min(120, parseInt(st.prepMins, 10) || 15)),
    address: String(st.address || '').slice(0, 120),
    phone: String(st.phone || '').slice(0, 30),
    gstin: String(st.gstin || '').slice(0, 20),
    footer: String(st.footer == null ? 'Thank you! Visit again.' : st.footer).slice(0, 80),
    paper: st.paper === '58' ? '58' : '80',
    // The sales day ends at this hour (0 = midnight, 3 = 3 AM), so late nights count as one day.
    dayEndHour: st.dayEndHour == null ? 3 : Math.max(0, Math.min(6, parseInt(st.dayEndHour, 10) || 0)),
    // Warn the counter when a table has eaten but not paid after this many minutes. 0 = off.
    unpaidMins: st.unpaidMins == null ? 20 : Math.max(0, Math.min(120, parseInt(st.unpaidMins, 10) || 0))
  };
  return {
    name: String(d.name || 'Cafe').slice(0, 60),
    tables: Math.max(1, Math.min(100, parseInt(d.tables, 10) || 10)),
    acceptingOrders: d.acceptingOrders !== false,
    categories, menu, settings, brand: cleanBrand(d.brand),
    popular: Array.isArray(d.popular) ? d.popular.filter(x => typeof x === 'string').slice(0, 5) : [],
    popularAt: typeof d.popularAt === 'string' ? d.popularAt : '',
    photosV: Number(d.photosV) || 0
  };
}

// Allergens a cafe can mark on a dish: [key, English, Malayalam].
export const ALLERGENS = [['milk', 'Milk', '\u0D2A\u0D3E\u0D7D'], ['nuts', 'Nuts', '\u0D28\u0D1F\u0D4D\u0D38\u0D4D'], ['gluten', 'Wheat (gluten)', '\u0D17\u0D4B\u0D24\u0D2E\u0D4D\u0D2A\u0D4D'],
  ['egg', 'Egg', '\u0D2E\u0D41\u0D1F\u0D4D\u0D1F'], ['soy', 'Soy', '\u0D38\u0D4B\u0D2F'], ['fish', 'Fish or seafood', '\u0D2E\u0D40\u0D7B']];
export const SPICE = ['Not spicy', 'Mild', 'Medium', 'Hot'];
export const SPICE_ML = ['\u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D07\u0D32\u0D4D\u0D32', '\u0D1A\u0D46\u0D31\u0D3F\u0D2F \u0D0E\u0D30\u0D3F\u0D35\u0D4D', '\u0D07\u0D1F\u0D24\u0D4D\u0D24\u0D30\u0D02', '\u0D28\u0D32\u0D4D\u0D32 \u0D0E\u0D30\u0D3F\u0D35\u0D4D'];

export const SAMPLE_MENU = {
  categories: [
    { id: 'coffee', name: 'Coffee' }, { id: 'tea', name: 'Tea & coolers' },
    { id: 'snacks', name: 'Snacks' }, { id: 'desserts', name: 'Desserts' }
  ],
  menu: [
    { id: 'c1', cat: 'coffee', name: 'Cappuccino', desc: 'Double shot, silky milk foam', price: 140, veg: true, available: true },
    { id: 'c2', cat: 'coffee', name: 'Cold Coffee', desc: 'Blended with ice and vanilla ice cream', price: 150, veg: true, available: true },
    { id: 'c3', cat: 'coffee', name: 'Hazelnut Latte', desc: 'Espresso, steamed milk, hazelnut syrup', price: 170, veg: true, available: true },
    { id: 't1', cat: 'tea', name: 'Masala Chai', desc: 'Ginger and cardamom, slow brewed', price: 60, veg: true, available: true },
    { id: 't2', cat: 'tea', name: 'Lemon Iced Tea', desc: 'Fresh lemon with a hint of mint', price: 110, veg: true, available: true },
    { id: 't3', cat: 'tea', name: 'Fresh Lime Soda', desc: 'Sweet, salted or mixed', price: 80, veg: true, available: true },
    { id: 's1', cat: 'snacks', name: 'Veg Club Sandwich', desc: 'Triple layer, grilled, with fries', price: 160, veg: true, available: true },
    { id: 's2', cat: 'snacks', name: 'Chicken Puff', desc: 'Flaky pastry, spiced chicken filling', price: 60, veg: false, available: true },
    { id: 's3', cat: 'snacks', name: 'Peri Peri Fries', desc: 'Crispy fries with peri peri seasoning', price: 130, veg: true, available: true },
    { id: 'd1', cat: 'desserts', name: 'Chocolate Brownie', desc: 'Eggless, warm, fudgy centre', price: 120, veg: true, available: true },
    { id: 'd2', cat: 'desserts', name: 'Banana Walnut Cake', desc: 'Eggless slice, lightly toasted', price: 90, veg: true, available: true }
  ]
};

const ICON = {
  coffee: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13H22V18A7 7 0 0 1 15 25H14A7 7 0 0 1 7 18Z"/><path d="M22 15h2a3 3 0 0 1 0 6h-2.6"/><path d="M11.5 5c0 2 2 2 2 4.5M16.5 5c0 2 2 2 2 4.5"/></svg>',
  tea: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h14l-2 16H11z"/><path d="M18 10l3-6h3"/><path d="M10 16h12"/></svg>',
  snacks: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14a10 7 0 0 1 20 0z"/><path d="M5 18.5h22"/><path d="M6 22.5h20v.5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/></svg>',
  desserts: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 25h24v-9L4 11z"/><path d="M4 16.5l24 3.5"/><circle cx="21" cy="9.5" r="2.2"/></svg>',
  plate: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="17" r="9"/><circle cx="16" cy="17" r="5"/><path d="M4 6v7M6 6v7M4 13h2M5 13v13M28 6c-2 0-3 3-3 6s1 3 3 3v11"/></svg>'
};
// Pick an icon from the category name, so new categories still get a picture.
export function iconFor(cat) {
  const n = ((cat && (cat.id + ' ' + cat.name)) || '').toLowerCase();
  if (/coffee|latte|espresso/.test(n)) return ['coffee', ICON.coffee];
  if (/tea|cool|drink|juice|shake|bever|soda|mocktail/.test(n)) return ['tea', ICON.tea];
  if (/dessert|cake|sweet|ice|bak/.test(n)) return ['desserts', ICON.desserts];
  if (/snack|burger|sandwich|fries|bite|starter|wrap/.test(n)) return ['snacks', ICON.snacks];
  return ['plate', ICON.plate];
}

export const BRAND_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M9 14.5h12v3.8a5.7 5.7 0 0 1-5.7 5.7h-.6A5.7 5.7 0 0 1 9 18.3z" fill="#fff"/><path d="M21 15.8h1.4a2.6 2.6 0 0 1 0 5.2H21" fill="none" stroke="#fff" stroke-width="2"/><path d="M12.6 10.9a3.4 3.4 0 0 1 4.8 0M10.4 8.4a6.6 6.6 0 0 1 9.2 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';

// Money with two decimals, for bills.
export const money2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// Business day: with dayEndHour = 3, anything before 3 AM belongs to the day before.
export function bizDay(endHour, ms) { return dayKey(new Date((ms == null ? Date.now() : ms) - (endHour || 0) * 3600000)); }
export function bizStart(key, endHour) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, endHour || 0); }
// What the customer pays: order subtotal plus GST, rounded like the bill.
export function payAmount(subtotal, gstPct) { const g = Math.round(subtotal * (gstPct || 0)) / 100; return Math.round(subtotal + g); }
export function shortMoney(n) { n = Math.round(n || 0); if (n < 1000) return '\u20B9' + n; if (n < 100000) return '\u20B9' + (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k'; return '\u20B9' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L'; }
export function dayKey(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
export function fmtTime(ms) { return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); }
export function fmtDateTime(ms) { const d = new Date(ms); return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + fmtTime(ms); }

/* ---------- Cafe brand: logo, colour theme, light/dark ---------- */
// Each theme sets the four soft card colours (tiles, + buttons, pay button) and the brand colour.
// Customers' phones show these; the counter and kitchen keep YUNO's status colours.
export const THEMES = {
  fresh:  { name: 'Fresh',        a: '#D6E96E', b: '#ABA0F7', c: '#B9CFEE', d: '#F5E9A9', deep: '#6F5CE6' },
  coffee: { name: 'Coffee house', a: '#F0C590', b: '#D8B49A', c: '#E9DCCB', d: '#F3E3B5', deep: '#7A4A2A' },
  mint:   { name: 'Mint',         a: '#9FE5C2', b: '#A9D7F0', c: '#CDEEDB', d: '#F5EAA8', deep: '#1E8A62' },
  sunset: { name: 'Sunset',       a: '#FFB48C', b: '#F6A6C6', c: '#FFD6A2', d: '#FBE6A6', deep: '#D2435C' },
  ocean:  { name: 'Ocean',        a: '#92D4F3', b: '#A9B9FF', c: '#B8E4EA', d: '#F4E7A6', deep: '#2F6FD6' },
  classic:{ name: 'Classic',      a: '#E4E4E8', b: '#D4D4DC', c: '#ECECF0', d: '#E0DED6', deep: '#17181D' }
};
// Festival looks the admin can switch on for a while, e.g. Onam week. They sit on top of the normal theme.
export const FESTS = {
  onam:      { name: 'Onam',      a: '#F4D58D', b: '#A8D5A2', c: '#FBE7C6', d: '#F9C784', deep: '#2E7D32', deco: '\u{1F33C}', msg: 'Happy Onam!' },
  diwali:    { name: 'Diwali',    a: '#FFC857', b: '#FFB4A2', c: '#FFD9A0', d: '#FBE38E', deep: '#B4232C', deco: '\u{1FA94}', msg: 'Happy Diwali!' },
  christmas: { name: 'Christmas', a: '#F28B82', b: '#A8D5BA', c: '#E3F0E8', d: '#F6E7A8', deep: '#C62828', deco: '\u{1F384}', msg: 'Merry Christmas!' },
  eid:       { name: 'Eid',       a: '#A7E3D0', b: '#C8B6FF', c: '#D6F0E9', d: '#F6E6A8', deep: '#00796B', deco: '\u{1F319}', msg: 'Eid Mubarak!' },
  newyear:   { name: 'New Year',  a: '#FFD166', b: '#C3B1E1', c: '#B5DEFF', d: '#FFE8A3', deep: '#3D348B', deco: '\u{1F389}', msg: 'Happy New Year!' }
};
export function festNow(brand) {
  const f = brand && FESTS[brand.fest];
  if (!f) return null;
  if (brand.festUntil && dayKey() > brand.festUntil) return null;
  return f;
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (h1, h2, t) => { const a = hexRgb(h1), b = hexRgb(h2); return rgbHex(a.map((v, i) => v + (b[i] - v) * t)); };
const lum = h => { const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function hueShift(h, deg) {
  let [r, g, b] = hexRgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; }
  hh = ((hh * 360 + deg) % 360 + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return rgbHex(s === 0 ? [l * 255, l * 255, l * 255] : [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]);
}
const isHex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export function cleanBrand(b) {
  b = b && typeof b === 'object' ? b : {};
  const logo = typeof b.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) && b.logo.length <= 300000 ? b.logo : '';
  const theme = b.theme === 'custom' && isHex(b.accent) ? 'custom' : (THEMES[b.theme] ? b.theme : 'fresh');
  const festUntil = typeof b.festUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.festUntil) ? b.festUntil : '';
  return { theme, accent: isHex(b.accent) ? b.accent.toUpperCase() : '#6F5CE6', mode: ['light', 'dark'].includes(b.mode) ? b.mode : 'auto', logo,
    fest: FESTS[b.fest] ? b.fest : '', festUntil };
}
// The final colours for a brand. A custom colour builds a matching soft palette around it.
export function themeColors(brand) {
  const f = festNow(brand); if (f) return f;
  if (brand.theme !== 'custom') return THEMES[brand.theme] || THEMES.fresh;
  const acc = brand.accent;
  const deep = lum(acc) > 0.35 ? mix(acc, '#000000', 0.45) : acc;
  return { name: 'Custom', a: mix(acc, '#FFFFFF', 0.55), b: mix(hueShift(acc, 35), '#FFFFFF', 0.5), c: mix(hueShift(acc, -35), '#FFFFFF', 0.62), d: mix('#F5E9A9', acc, 0.12), deep };
}
export function brandVars(brand, dark) {
  const t = themeColors(brand), deep = dark ? mix(t.deep, '#FFFFFF', lum(t.deep) < 0.05 ? 0.85 : 0.3) : t.deep;
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
  return {
    '--lime': t.a, '--violet': t.b, '--sky': t.c, '--butter': t.d,
    '--violet-deep': deep, '--violet-text': deep, '--focus': deep, '--violet-tint': rgba(deep, dark ? 0.17 : 0.12),
    '--hero-a': dark ? mix(t.deep, '#1C1D23', 0.74) : mix(t.b, '#FFFFFF', 0.55),
    '--glow-1': rgba(t.a, dark ? 0.16 : 0.55), '--glow-2': rgba(t.b, dark ? 0.22 : 0.45), '--glow-3': rgba(t.c, dark ? 0.16 : 0.55)
  };
}
// Paint a brand onto the page (or onto one preview box). Follows the phone's light/dark setting when mode is auto.
let brandMq = null, brandNow = null;
export function applyBrand(brand, el, forceMode) {
  const root = el || document.documentElement, mode = forceMode || brand.mode;
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const vars = brandVars(brand, dark);
  Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
  if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  if (!el) {
    brandNow = brand;
    if (!brandMq) { brandMq = window.matchMedia('(prefers-color-scheme: dark)'); brandMq.addEventListener('change', () => { if (brandNow) applyBrand(brandNow); }); }
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#121317' : '#EEEDF3';
  }
}
export function setFavicon(dataUrl) {
  if (!dataUrl) return;
  let l = document.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.href = dataUrl;
}
// Shrink an uploaded logo to fit 256x256 so the menu loads fast on phones. Keeps transparency.
// WebP is much smaller than PNG; browsers that can't make WebP fall back to PNG.
export function processLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('type')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('big')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 256, k = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const png = cv.toDataURL('image/png'), webp = cv.toDataURL('image/webp', 0.9);
      let out = /^data:image\/webp/.test(webp) && webp.length < png.length ? webp : png;
      if (out.length > 200000) out = cv.toDataURL('image/jpeg', 0.85);
      if (out.length > 280000) { reject(new Error('big')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}

// Food photo: crop to a square and shrink to 240 px. WebP keeps it around 10-20 KB,
// so a whole menu's photos fit in one small database record on the free plan.
export function processPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('type')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('big')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2, out = 240;
      const cv = document.createElement('canvas'); cv.width = out; cv.height = out;
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      let data = cv.toDataURL('image/webp', 0.72);
      if (!/^data:image\/webp/.test(data)) data = cv.toDataURL('image/jpeg', 0.75);
      if (data.length > 60000) data = cv.toDataURL('image/jpeg', 0.6);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}

// A clear message for each way signing in can fail, so a network problem never looks like a wrong password.
export function loginError(err) {
  const c = (err && err.code) || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'That email and password don\u2019t match. Check them, or tap \u201CForgot password?\u201D.';
  if (c === 'auth/invalid-email' || c === 'auth/missing-email') return 'That email address doesn\u2019t look right.';
  if (c === 'auth/missing-password') return 'Type your password.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes, then try again.';
  if (c === 'auth/network-request-failed') return 'Couldn\u2019t reach the login server. Check your internet and try again.';
  if (c === 'auth/operation-not-allowed') return 'Email login is switched off. In Firebase, open Authentication, then Sign-in method, and turn on Email/Password.';
  if (c === 'auth/unauthorized-domain' || c.indexOf('auth/requests-from-referer') === 0) return 'This website address isn\u2019t allowed to sign in. In Firebase, open Authentication, then Settings, then Authorized domains, and add ' + location.hostname + '.';
  if (c === 'auth/user-disabled') return 'This login has been switched off in Firebase.';
  return 'Couldn\u2019t sign in' + (c ? ' (' + c.replace('auth/', '') + ')' : '') + '. Please try again.';
}

/* ---------- Printing (bills, reports, kitchen tickets) ----------
   One print at a time. Several jobs (two KOTs at once, say) wait in a queue
   and print one after another, so nothing gets lost. */
const printJobs = [];
let printing = false;
function nextPrint() {
  if (printing || !printJobs.length) return;
  printing = true;
  const { kind, html, pageCss } = printJobs.shift();
  let area = document.getElementById('print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; area.setAttribute('aria-hidden', 'true'); document.body.appendChild(area); }
  area.innerHTML = html;
  let st = document.getElementById('page-style');
  if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); }
  st.textContent = '@media print{' + pageCss + '}';
  document.body.dataset.print = kind;
  setTimeout(() => {
    let done = false;
    const finish = () => { if (done) return; done = true; window.removeEventListener('afterprint', finish); delete document.body.dataset.print; printing = false; setTimeout(nextPrint, 400); };
    window.addEventListener('afterprint', finish);
    try { window.print(); } catch (e) {}
    if (!('onafterprint' in window)) setTimeout(finish, 1500); // older browsers without afterprint
  }, 60);
}
export function printOut(kind, html, pageCss) { printJobs.push({ kind, html, pageCss: pageCss || '@page{margin:0}' }); nextPrint(); }

// KOT: Kitchen Order Ticket. Big table name and quantities, no prices.
export function orderLabel(o) { return o.type === 'table' ? 'TABLE ' + o.table : (o.type === 'parcel' ? 'PARCEL' : 'COUNTER'); }
export function kotHtml(o, cafe, opts) {
  opts = opts || {};
  const paper = cafe && cafe.settings && cafe.settings.paper === '58' ? '58' : '80';
  const qty = (o.items || []).reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0);
  const when = o.acceptedAt || o.createdAt || Date.now();
  return '<div class="receipt kot w' + paper + '">' +
    '<p class="r-c r-b">KOT' + (opts.reprint ? ' (REPRINT)' : '') + '</p>' +
    '<p class="r-c r-small">' + esc(cafe ? cafe.name : '') + '</p><hr>' +
    '<p class="r-c kot-who">' + esc(orderLabel(o)) + '</p>' +
    (o.name ? '<p class="r-c r-b">' + esc(o.name) + '</p>' : '') +
    '<p class="r-row"><span>Order ' + esc(shortCode(o.id)) + '</span><span>' + esc(fmtTime(when)) + '</span></p>' +
    (o.prepMins ? '<p class="r-row"><span>Ready in</span><span>' + o.prepMins + ' min</span></p>' : '') + '<hr>' +
    (o.items || []).map(i => '<p class="kot-line"><b>' + (parseInt(i.qty, 10) || 1) + ' x</b><span>' + esc(i.name) + '</span></p>').join('') + '<hr>' +
    (o.note ? '<p class="kot-note">NOTE: ' + esc(o.note) + '</p><hr>' : '') +
    '<p class="r-row r-small"><span>' + qty + ' item' + (qty === 1 ? '' : 's') + '</span><span>' + esc(fmtDateTime(Date.now())) + '</span></p></div>';
}
export function printKot(o, cafe, opts) { printOut('receipt', kotHtml(o, cafe, opts), '@page{margin:0}'); }

// Auto-print is a setting for this device only (the one plugged into the kitchen printer).
// We remember which orders already printed here, so a refresh never prints them twice.
export const kotAuto = { get: () => !!ls.get('yumotap:kotauto', false), set: (v) => ls.set('yumotap:kotauto', !!v) };
export function kotPrintedOnce(cafeId, id) {
  const key = 'yumotap:kotdone:' + cafeId, list = ls.get(key, []);
  const arr = Array.isArray(list) ? list : [];
  if (arr.includes(id)) return false;
  arr.push(id); ls.set(key, arr.slice(-300));
  return true;
}
