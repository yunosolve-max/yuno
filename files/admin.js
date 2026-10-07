// YUNO admin: only you (the YUNO owner) can use this page.
// Create a cafe, then give its staff a login for the counter screen.
import {
  db, auth, firebaseConfig, initializeApp, getAuth, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, getDocs, query, limit,
  serverTimestamp, writeBatch, arrayUnion, arrayRemove, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, createUserWithEmailAndPassword, sendPasswordResetEmail
} from './fb.js';
import { $, esc, toast, slugify, slugProblem, SAMPLE_MENU, BRAND_SVG, cleanCafe, THEMES, FESTS, applyBrand, processLogo, loginError } from './common.js';

// A second, separate Firebase connection used only to create staff logins,
// so creating one doesn't sign you out of this page.
let helperAuth = null;
function staffMaker() {
  if (!helperAuth) helperAuth = getAuth(initializeApp(firebaseConfig, 'staff-maker'));
  return helperAuth;
}

const S = { phase: 'auth', user: null, cafes: [], staff: {}, slugTouched: false, loginErr: '', loginBusy: false };
let subs = [], staffSubs = {}, cardEls = {};
function stopSubs() {
  subs.forEach(u => { try { u(); } catch (e) {} }); subs = [];
  Object.values(staffSubs).forEach(u => { try { u(); } catch (e) {} }); staffSubs = {}; cardEls = {};
}

/* ---------- Views ---------- */
function loginView() {
  return '<div class="login"><div class="brand">' + BRAND_SVG + 'YUNO</div>' +
    '<h1>Admin login</h1><p class="lead">For the YUNO owner only. Cafe staff should use the counter login.</p>' +
    '<form id="login-form" novalidate>' +
    '<label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username" required></label>' +
    '<label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>' +
    (S.loginErr ? '<p class="err" role="alert">' + esc(S.loginErr) + '</p>' : '') +
    '<button class="btn-primary" type="submit"' + (S.loginBusy ? ' disabled' : '') + '>' + (S.loginBusy ? 'Signing in\u2026' : 'Sign in') + '</button></form>' +
    '<p class="fine" style="margin-top:14px"><button type="button" class="linkbtn" data-action="forgot">Forgot password?</button></p></div>';
}
function adminView() {
  return '<div class="wrap counter"><div class="o-head"><div><h1 class="o-title">Your cafes</h1><p class="o-sub">Signed in as ' + esc(S.user.email) + '</p></div></div>' +
    '<div class="admin-grid"><section class="panel"><div id="cafe-list"><p class="empty">Loading cafes\u2026</p></div></section>' +
    '<section class="panel"><h2>Add a cafe</h2><form id="cafe-form" novalidate>' +
    '<label class="field"><span>Cafe name</span><input class="input" name="name" maxlength="60" required placeholder="Corner Cup Caf\u00E9"></label>' +
    '<label class="field"><span>Web name</span><input class="input" name="slug" maxlength="40" required placeholder="cornercup" autocapitalize="off" spellcheck="false">' +
    '<small id="slug-help">Customers\u2019 link will be ' + esc(location.origin) + '/menu.html?cafe=<b id="slug-preview">cornercup</b>. This can\u2019t change after QR codes are printed.</small></label>' +
    '<label class="field"><span>Number of tables</span><input class="input" name="tables" type="number" min="1" max="100" value="10"></label>' +
    '<label class="field" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="sample" checked style="width:20px;height:20px"><span style="margin:0">Start with a sample menu the cafe can edit</span></label>' +
    '<p class="err" id="cafe-err" role="alert" hidden></p>' +
    '<button class="btn-primary" type="submit" id="cafe-submit">Create cafe</button></form></section></div></div>';
}
function noteView(title, text) {
  return '<div class="center-note panel"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p style="margin-top:16px"><button class="btn-ghost" data-action="signout">Sign out</button></p></div>';
}
function render() {
  $('#topbar').hidden = S.phase !== 'admin';
  const app = $('#app');
  if (S.phase === 'auth') { app.innerHTML = '<div class="center-note"><p>Loading\u2026</p></div>'; return; }
  if (S.phase === 'login') { app.innerHTML = loginView(); return; }
  if (S.phase === 'checkfail') { app.innerHTML = '<div class="center-note panel"><h1>Couldn\u2019t check your login</h1><p>Signed in as ' + esc(S.user ? S.user.email : '') + ', but YUNO couldn\u2019t confirm admin access. This is usually a weak internet connection.</p><p style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn-primary inline" data-action="retry">Try again</button><button class="btn-ghost" data-action="signout">Sign out</button></p></div>'; return; }
  if (S.phase === 'notadmin') { app.innerHTML = noteView('Not the admin account', 'You\u2019re signed in as ' + (S.user ? S.user.email : '') + ', which isn\u2019t the YUNO admin. Cafe staff can use the counter screen instead.'); return; }
  app.innerHTML = adminView();
  renderCafes();
}

/* ---------- Cafe cards (updated in place so typing isn't lost) ---------- */
function cardSkeleton(slug) {
  const s = esc(slug);
  return '<div class="cc-head"></div>' +
    '<div class="links"><a class="btn-ghost" target="_blank" rel="noopener" href="/menu.html?cafe=' + s + '&table=1">Open menu</a>' +
    '<a class="btn-ghost" target="_blank" rel="noopener" href="/counter?cafe=' + s + '">Open counter</a>' +
    '<a class="btn-ghost" target="_blank" rel="noopener" href="/kitchen?cafe=' + s + '">Kitchen screen</a>' +
    '<a class="btn-ghost" target="_blank" rel="noopener" href="/counter?cafe=' + s + '&view=settings">QR codes</a></div>' +
    '<div class="feat-row"></div>' +
    '<p class="muted" style="font-size:14px;font-weight:600;margin-top:6px">Staff logins</p><ul class="staff-list"></ul>' +
    '<form class="add-staff" data-slug="' + s + '" novalidate><div class="row">' +
    '<label class="field"><span>Staff email</span><input class="input" type="email" name="email" autocomplete="off" placeholder="owner@cafe.com"></label>' +
    '<label class="field"><span>Password</span><input class="input" type="text" name="password" autocomplete="off" placeholder="At least 8 characters"></label></div>' +
    '<p class="err" hidden role="alert"></p><button class="btn-primary inline" type="submit">Create staff login</button></form>' +
    '<details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:14px">This person already has a login</summary>' +
    '<form class="link-staff" data-slug="' + s + '" novalidate style="margin-top:10px"><div class="row">' +
    '<label class="field"><span>User UID</span><input class="input" name="uid" autocomplete="off" placeholder="From Firebase, Authentication, Users"></label>' +
    '<label class="field"><span>Email (for your reference)</span><input class="input" type="email" name="email" autocomplete="off"></label></div>' +
    '<p class="err" hidden role="alert"></p><button class="btn-ghost" type="submit">Link login</button></form></details>' +
    brandHtml(s) +
    '<details class="danger-zone"><summary>Delete this cafe</summary>' +
    '<form class="del-cafe" data-slug="' + s + '" novalidate><p class="muted">This permanently deletes the cafe\u2019s menu, every order, all bills and sales history, and removes staff access. Printed QR codes will stop working. This can\u2019t be undone.</p>' +
    '<label class="field"><span>Type <b>' + s + '</b> to confirm</span><input class="input" name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<p class="err" hidden role="alert"></p><button class="btn btn-danger" type="submit">Delete forever</button></form></details>';
}
const gamesBusy = {};
async function toggleGames(slug) {
  const c = S.cafes.find(x => x.id === slug); if (!c || gamesBusy[slug]) return;
  gamesBusy[slug] = true; renderCafes();
  try { await updateDoc(doc(db, 'cafes', slug), { games: !c.games, updatedAt: serverTimestamp() }); toast(c.name + ': games turned ' + (c.games ? 'off.' : 'on.')); }
  catch (e) { toast('Couldn\u2019t change that. Check your internet.'); }
  delete gamesBusy[slug]; renderCafes();
}
function renderCafes() {
  const box = $('#cafe-list'); if (!box) return;
  if (!S.cafes.length) { box.innerHTML = '<p class="empty">No cafes yet. Add your first one on the right.</p>'; cardEls = {}; return; }
  const empty = box.querySelector('.empty'); if (empty) empty.remove();
  const ids = new Set(S.cafes.map(c => c.id));
  Object.keys(cardEls).forEach(id => { if (!ids.has(id)) { cardEls[id].remove(); delete cardEls[id]; } });
  S.cafes.forEach(c => {
    let el = cardEls[c.id];
    if (!el) { el = document.createElement('article'); el.className = 'cafe-card'; el.id = 'cafe-' + c.id; el.innerHTML = cardSkeleton(c.id); cardEls[c.id] = el; }
    el.querySelector('.cc-head').innerHTML = '<h3>' + (c.brand.logo ? '<img class="cc-logo" src="' + c.brand.logo + '" alt="">' : '') + esc(c.name) + '</h3><p class="muted" style="font-size:14px">' + esc(location.origin + '/menu.html?cafe=' + c.id) +
      ', ' + c.tables + ' tables, ' + c.menu.length + ' menu items, ' + (c.acceptingOrders ? 'taking orders' : 'orders paused') + '</p>';
    el.querySelector('.feat-row').innerHTML = '<div><b>Customer games</b><small>' + (c.games ? 'On: games, leaderboard and prizes show on the menu.' : 'Off: customers don\u2019t see any games.') + '</small></div>' +
      '<button type="button" class="sw" role="switch" aria-checked="' + c.games + '" aria-label="Customer games for ' + esc(c.name) + '" data-action="toggle-games" data-slug="' + esc(c.id) + '"' + (gamesBusy[c.id] ? ' disabled' : '') + '></button>';
    const staff = S.staff[c.id] || [];
    el.querySelector('.staff-list').innerHTML = staff.length ? staff.map(p =>
      '<li><span>' + esc(p.email || p.id) + '</span><button type="button" class="btn-ghost" data-action="remove-staff" data-slug="' + esc(c.id) + '" data-uid="' + esc(p.id) + '">Remove</button></li>').join('')
      : '<li class="muted">No staff logins yet.</li>';
    box.appendChild(el);
  });
  Object.keys(brandDraft).forEach(paintBrand);
}
function watchStaff(slug) {
  if (staffSubs[slug]) return;
  staffSubs[slug] = onSnapshot(collection(db, 'cafes', slug, 'staff'), snap => {
    S.staff[slug] = snap.docs.map(d => ({ id: d.id, email: (d.data() || {}).email || '' }));
    renderCafes();
  }, () => {});
}

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async user => {
  stopSubs();
  S.user = user;
  if (!user) { S.phase = 'login'; render(); return; }
  // Only the admin can read config/*. If this read is refused, this login isn't the admin.
  // Only a "permission denied" answer means this isn't the admin. Anything else (like a weak connection) can be retried.
  try { await getDoc(doc(db, 'config', 'admin')); }
  catch (e) { S.phase = e && e.code === 'permission-denied' ? 'notadmin' : 'checkfail'; render(); return; }
  S.phase = 'admin'; render();
  subs.push(onSnapshot(collection(db, 'cafes'), snap => {
    S.cafes = snap.docs.map(d => Object.assign({ id: d.id }, cleanCafe(d.data()))).sort((a, b) => a.name.localeCompare(b.name));
    const live = new Set(S.cafes.map(c => c.id));
    Object.keys(staffSubs).forEach(slug => { if (!live.has(slug)) { try { staffSubs[slug](); } catch (e) {} delete staffSubs[slug]; delete S.staff[slug]; } });
    S.cafes.forEach(c => watchStaff(c.id));
    renderCafes();
  }, () => toast('Couldn\u2019t load cafes. Refresh the page.')));
});

/* ---------- Logo and theme (admin only) ---------- */
// Staff can't change these: the security rules only let them edit the menu, name, tables and settings.
const brandDraft = {};
const sameBrand = (a, b) => a.theme === b.theme && a.mode === b.mode && a.logo === b.logo && (a.theme !== 'custom' || a.accent === b.accent) && (a.fest || '') === (b.fest || '') && (a.festUntil || '') === (b.festUntil || '');
function brandHtml(s) {
  const sw = Object.keys(THEMES).map(k => { const t = THEMES[k];
    return '<button type="button" class="swatch" data-action="pick-theme" data-theme="' + k + '" data-slug="' + s + '" aria-pressed="false">' +
      '<span class="sw-dots">' + [t.a, t.b, t.c, t.deep].map(c => '<i style="background:' + c + '"></i>').join('') + '</span>' + esc(t.name) + '</button>'; }).join('');
  return '<details class="brand-zone" data-slug="' + s + '"><summary>Logo and theme</summary><div class="brand-ed">' +
    '<div class="brand-controls">' +
      '<p class="bz-label">Logo</p><div class="logo-row"><div class="logo-box" data-role="logo-box"></div><div class="logo-acts">' +
        '<label class="btn-ghost file-btn">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" data-role="logo-file" data-slug="' + s + '"></label>' +
        '<button type="button" class="btn-ghost" data-action="logo-remove" data-slug="' + s + '">Remove</button>' +
        '<small class="muted">A square PNG with a see-through background looks best.</small></div></div>' +
      '<p class="bz-label">Colour theme <span class="muted">(customer menu)</span></p><div class="swatches">' + sw +
        '<label class="swatch custom" data-role="custom"><span class="sw-dots"><input type="color" data-role="accent" data-slug="' + s + '" aria-label="Pick a custom colour"></span>Custom colour</label></div>' +
      '<p class="bz-label">Festival look <span class="muted">(optional, on top of the theme)</span></p><div class="swatches">' +
        [['', 'None', '\u2014'], ...Object.keys(FESTS).map(k => [k, FESTS[k].name, FESTS[k].deco])].map(([k, n, ico]) => '<button type="button" class="swatch fest" data-action="pick-fest" data-fest="' + k + '" data-slug="' + s + '" aria-pressed="false"><span class="sw-ico" aria-hidden="true">' + ico + '</span>' + esc(n) + '</button>').join('') + '</div>' +
        '<label class="field fest-until" data-role="fest-until-wrap"><span>Show it until</span><input class="input" type="date" data-role="fest-until" data-slug="' + s + '"><small>After this day the normal theme comes back by itself. Leave empty to keep it on.</small></label>' +
      '<p class="bz-label">Customer menu appearance</p><div class="seg" role="group" aria-label="Appearance">' +
        [['auto', 'Match phone'], ['light', 'Always light'], ['dark', 'Always dark']].map(([m, l]) => '<button type="button" data-action="pick-mode" data-mode="' + m + '" data-slug="' + s + '" aria-pressed="false">' + l + '</button>').join('') + '</div>' +
      '<p class="err" data-role="brand-err" hidden role="alert"></p>' +
      '<div class="row-btns"><button type="button" class="btn-primary inline" data-action="brand-save" data-slug="' + s + '">Save look</button><span class="muted bz-state" data-role="bz-state"></span></div>' +
    '</div>' +
    '<div class="pp" data-role="preview" aria-hidden="true"><div class="pp-hero"><div class="pp-top"><span class="pp-chip">Table 4</span><span class="pp-call">Call waiter</span></div>' +
      '<div class="pp-logo" data-role="pp-logo"></div><b class="pp-name" data-role="pp-name"></b><span class="pp-sub">Tap + to add food.</span></div>' +
      '<div class="pp-tiles"><span class="t-a">Coffee</span><span class="t-c">Tea</span><span class="t-b">Snacks</span><span class="t-d">Desserts</span></div>' +
      '<div class="pp-item"><span class="pp-tile"></span><span class="pp-lines"><b>Cappuccino</b><i>\u20B9140</i></span><span class="pp-add">+</span></div>' +
      '<div class="pp-item"><span class="pp-tile t-c"></span><span class="pp-lines"><b>Masala Chai</b><i>\u20B960</i></span><span class="pp-add">+</span></div>' +
      '<div class="pp-bar"><span><small>2 items</small><b>\u20B9200</b></span><span class="pp-go">Place order</span></div></div>' +
    '</div></details>';
}
function paintBrand(slug) {
  const el = cardEls[slug], d = brandDraft[slug], cafe = S.cafes.find(c => c.id === slug);
  if (!el || !d || !cafe) return;
  const z = el.querySelector('.brand-zone');
  const logoImg = d.logo ? '<img src="' + d.logo + '" alt="">' : '<span>' + esc(cafe.name.trim().charAt(0).toUpperCase() || 'C') + '</span>';
  z.querySelector('[data-role="logo-box"]').innerHTML = logoImg;
  z.querySelector('[data-role="pp-logo"]').innerHTML = d.logo ? '<img src="' + d.logo + '" alt="">' : '';
  z.querySelector('[data-role="pp-logo"]').hidden = !d.logo;
  z.querySelector('[data-role="pp-name"]').textContent = cafe.name;
  z.querySelectorAll('[data-action="pick-theme"]').forEach(b => b.setAttribute('aria-pressed', String(d.theme === b.dataset.theme)));
  z.querySelector('[data-role="custom"]').classList.toggle('on', d.theme === 'custom');
  z.querySelector('[data-role="accent"]').value = d.accent;
  z.querySelectorAll('[data-action="pick-mode"]').forEach(b => b.setAttribute('aria-pressed', String(d.mode === b.dataset.mode)));
  z.querySelectorAll('[data-action="pick-fest"]').forEach(b => b.setAttribute('aria-pressed', String((d.fest || '') === b.dataset.fest)));
  z.querySelector('[data-role="fest-until-wrap"]').hidden = !d.fest;
  const fu = z.querySelector('[data-role="fest-until"]'); if (fu.value !== (d.festUntil || '')) fu.value = d.festUntil || '';
  applyBrand(d, z.querySelector('[data-role="preview"]'), d.mode);
  const dirty = !sameBrand(d, cafe.brand);
  z.querySelector('[data-role="bz-state"]').textContent = dirty ? 'Not saved yet' : 'Saved';
  z.querySelector('[data-action="brand-save"]').disabled = !dirty || !!d.busy;
}
function brandErr(slug, msg) { const p = cardEls[slug] && cardEls[slug].querySelector('[data-role="brand-err"]'); if (p) { p.textContent = msg || ''; p.hidden = !msg; } }
document.addEventListener('toggle', e => {
  const z = e.target; if (!z.classList || !z.classList.contains('brand-zone') || !z.open) return;
  const slug = z.dataset.slug, cafe = S.cafes.find(c => c.id === slug);
  if (cafe && !brandDraft[slug]) brandDraft[slug] = Object.assign({}, cafe.brand);
  paintBrand(slug);
}, true);
document.addEventListener('change', async e => {
  const t = e.target; if (t.dataset.role !== 'logo-file' || !t.files || !t.files[0]) return;
  const slug = t.dataset.slug; brandErr(slug, '');
  try { brandDraft[slug].logo = await processLogo(t.files[0]); paintBrand(slug); }
  catch (err) { brandErr(slug, err.message === 'big' ? 'That image is too large. Use a logo under 8 MB, ideally a simple PNG.' : 'Couldn\u2019t read that file. Use a PNG, JPG or WebP image.'); }
  t.value = '';
});
document.addEventListener('change', e => {
  const t = e.target; if (t.dataset.role !== 'fest-until') return;
  const d = brandDraft[t.dataset.slug]; if (!d) return;
  d.festUntil = t.value || ''; paintBrand(t.dataset.slug);
});
document.addEventListener('input', e => {
  const t = e.target; if (t.dataset.role !== 'accent') return;
  const d = brandDraft[t.dataset.slug]; if (!d) return;
  d.theme = 'custom'; d.accent = t.value.toUpperCase(); paintBrand(t.dataset.slug);
});
async function brandAction(t) {
  const slug = t.dataset.slug, d = brandDraft[slug]; if (!d) return;
  switch (t.dataset.action) {
    case 'pick-theme': d.theme = t.dataset.theme; break;
    case 'pick-mode': d.mode = t.dataset.mode; break;
    case 'pick-fest': d.fest = t.dataset.fest; if (!d.fest) d.festUntil = ''; break;
    case 'logo-remove': d.logo = ''; break;
    case 'brand-save': {
      d.busy = true; paintBrand(slug); brandErr(slug, '');
      try {
        await updateDoc(doc(db, 'cafes', slug), { brand: { theme: d.theme, accent: d.accent, mode: d.mode, logo: d.logo, fest: d.fest || '', festUntil: d.festUntil || '' }, updatedAt: serverTimestamp() });
        toast('Saved. Customers see the new look the next time the menu loads.');
      } catch (err) { brandErr(slug, err && err.code === 'permission-denied' ? 'Only the admin login can change the look.' : 'Couldn\u2019t save. Check your internet and try again.'); }
      d.busy = false; break;
    }
  }
  paintBrand(slug);
}

/* ---------- Deleting a cafe ---------- */
// Firestore doesn't delete a cafe's sub-collections with it, so remove every order, bill, call,
// counter, daily sales record, photo, game room and staff link first, then the cafe itself.
async function deleteCafe(slug, progress) {
  let removed = 0;
  const staffSnap = await getDocs(collection(db, 'cafes', slug, 'staff'));
  const staffUids = staffSnap.docs.map(d => d.id);
  for (const sub of ['orders', 'bills', 'calls', 'meta', 'days', 'media', 'rooms', 'scores', 'staff']) {
    for (;;) {
      const snap = await getDocs(query(collection(db, 'cafes', slug, sub), limit(400)));
      if (snap.empty) break;
      const b = writeBatch(db);
      snap.docs.forEach(d => b.delete(d.ref));
      await b.commit();
      removed += snap.size; progress(removed);
      if (snap.size < 400) break;
    }
  }
  if (staffUids.length) {
    const b = writeBatch(db);
    staffUids.forEach(uid => b.set(doc(db, 'staffIndex', uid), { cafes: arrayRemove(slug) }, { merge: true }));
    await b.commit();
  }
  await deleteDoc(doc(db, 'cafes', slug));
  return removed;
}

/* ---------- Actions ---------- */
function showErr(form, msg) { const p = form.querySelector('.err'); if (!p) return; p.textContent = msg || ''; p.hidden = !msg; }

document.addEventListener('input', e => {
  const f = e.target.form;
  if (!f || f.id !== 'cafe-form') return;
  if (e.target.name === 'slug') S.slugTouched = true;
  if (e.target.name === 'name' && !S.slugTouched) f.slug.value = slugify(f.name.value);
  if (e.target.name === 'slug') f.slug.value = f.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  $('#slug-preview').textContent = f.slug.value || 'cornercup';
});

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action]'); if (!t) return;
  if (t.dataset.action === 'signout') { await signOut(auth); toast('Signed out.'); }
  if (t.dataset.action === 'retry') { location.reload(); return; }
  if (t.dataset.action === 'forgot') {
    const f = $('#login-form'), email = f ? f.email.value.trim() : '';
    if (!email) { S.loginErr = 'Type your email above, then tap \u201CForgot password?\u201D again.'; render(); return; }
    try { await sendPasswordResetEmail(auth, email); toast('Password reset email sent to ' + email + '. Check your inbox and spam folder.'); }
    catch (err) { S.loginErr = loginError(err); render(); const f2 = $('#login-form'); if (f2) f2.email.value = email; }
    return;
  }
  if (['pick-theme', 'pick-mode', 'pick-fest', 'logo-remove', 'brand-save'].includes(t.dataset.action)) { brandAction(t); return; }
  if (t.dataset.action === 'toggle-games') { toggleGames(t.dataset.slug); return; }
  if (t.dataset.action === 'remove-staff') {
    if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Tap again to remove'; setTimeout(() => { t.dataset.armed = ''; t.textContent = 'Remove'; }, 3000); return; }
    const slug = t.dataset.slug, uid = t.dataset.uid;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, 'cafes', slug, 'staff', uid));
      b.set(doc(db, 'staffIndex', uid), { cafes: arrayRemove(slug) }, { merge: true });
      await b.commit();
      toast('Removed. That login can no longer open this cafe.');
    } catch (err) { toast('Couldn\u2019t remove that login. Try again.'); }
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;

  if (f.id === 'login-form') {
    const email = f.email.value.trim(), pw = f.password.value;
    S.loginBusy = true; S.loginErr = ''; render();
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch (err) {
      S.loginErr = loginError(err);
      S.loginBusy = false; render();
      const f2 = $('#login-form'); if (f2) f2.email.value = email;
    }
    S.loginBusy = false;
    return;
  }

  if (f.id === 'cafe-form') {
    const name = f.name.value.trim(), slug = f.slug.value.trim(), tables = parseInt(f.tables.value, 10);
    const err = $('#cafe-err');
    const problem = !name ? 'Add the cafe\u2019s name.' : slugProblem(slug) || (!(tables >= 1 && tables <= 100) ? 'Number of tables must be between 1 and 100.' : '');
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    err.hidden = true;
    const btn = $('#cafe-submit'); btn.disabled = true; btn.textContent = 'Creating\u2026';
    try {
      const ref = doc(db, 'cafes', slug);
      const existing = await getDoc(ref);
      if (existing.exists()) { err.textContent = 'That web name is already used. Try another.'; err.hidden = false; }
      else {
        const sample = f.sample.checked;
        await setDoc(ref, {
          name: name.slice(0, 60), tables, acceptingOrders: true,
          categories: sample ? SAMPLE_MENU.categories : [{ id: 'menu', name: 'Menu' }],
          menu: sample ? SAMPLE_MENU.menu : [],
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        toast(name + ' is ready. Now create a staff login for it.');
        f.reset(); S.slugTouched = false; $('#slug-preview').textContent = 'cornercup';
      }
    } catch (e2) {
      err.textContent = e2 && e2.code === 'permission-denied' ? 'This account isn\u2019t allowed to create cafes. Check the security rules.' : 'Couldn\u2019t create the cafe. Check your internet and try again.';
      err.hidden = false;
    }
    btn.disabled = false; btn.textContent = 'Create cafe';
    return;
  }

  if (f.classList.contains('add-staff')) {
    const slug = f.dataset.slug, email = f.email.value.trim(), pw = f.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { showErr(f, 'Add a valid email.'); return; }
    if (pw.length < 8) { showErr(f, 'Use a password with at least 8 characters.'); return; }
    showErr(f, '');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating\u2026';
    try {
      const helper = staffMaker();
      const cred = await createUserWithEmailAndPassword(helper, email, pw);
      const uid = cred.user.uid;
      await signOut(helper);
      const b = writeBatch(db);
      b.set(doc(db, 'cafes', slug, 'staff', uid), { email, addedAt: serverTimestamp() });
      b.set(doc(db, 'staffIndex', uid), { email, cafes: arrayUnion(slug) }, { merge: true });
      await b.commit();
      f.reset();
      toast('Staff login created. Share the email, password, and counter link with the cafe.');
    } catch (err) {
      const c = err && err.code;
      showErr(f, c === 'auth/email-already-in-use' ? 'That email already has a login. Use \u201CThis person already has a login\u201D below with its User UID.'
        : c === 'auth/invalid-email' ? 'That email doesn\u2019t look right.'
        : c === 'auth/weak-password' ? 'Choose a stronger password.'
        : c === 'auth/operation-not-allowed' ? 'Email login is off in Firebase. Turn on Email/Password in Authentication.'
        : 'Couldn\u2019t create the login. Check your internet and try again.');
    }
    btn.disabled = false; btn.textContent = 'Create staff login';
    return;
  }

  if (f.classList.contains('del-cafe')) {
    const slug = f.dataset.slug, typed = f.confirm.value.trim().toLowerCase();
    if (typed !== slug) { showErr(f, 'Type ' + slug + ' exactly to confirm.'); return; }
    showErr(f, '');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Deleting\u2026';
    try {
      await deleteCafe(slug, n => { btn.textContent = 'Deleting\u2026 ' + n + ' records removed'; });
      toast(slug + ' is deleted. Its staff logins still exist in Firebase Authentication; remove them there if no other cafe uses them.');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Delete forever';
      showErr(f, err && err.code === 'permission-denied'
        ? 'Not allowed yet. Publish the new firestore.rules in Firebase, then tap Delete forever again.'
        : 'Deleting stopped partway. Check your internet and tap Delete forever again to finish.');
    }
    return;
  }

  if (f.classList.contains('link-staff')) {
    const slug = f.dataset.slug, uid = f.uid.value.trim(), email = f.email.value.trim();
    if (!/^[A-Za-z0-9]{20,40}$/.test(uid)) { showErr(f, 'Paste the User UID from Firebase, Authentication, Users.'); return; }
    showErr(f, '');
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'cafes', slug, 'staff', uid), { email, addedAt: serverTimestamp() });
      b.set(doc(db, 'staffIndex', uid), { email, cafes: arrayUnion(slug) }, { merge: true });
      await b.commit();
      f.reset(); toast('Login linked to this cafe.');
    } catch (err) { showErr(f, 'Couldn\u2019t link that login. Try again.'); }
  }
});

render();
