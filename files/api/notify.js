// POST /api/notify   { cafe, kind: 'order' | 'call', id }
//
// The kitchen, counter, waiter and customer screens call this right after something happens
// (a new order, an order accepted or ready, a customer tapping "Call waiter").
// Customers are not signed in, so this server never trusts the request: it reads the real order
// from the database, looks at its real status, and sends each alert only once.
const { admin, db, mayUse, okCafe, okDocId, body, tooMany } = require('./_lib');

const MAX_AGE_MS = 10 * 60 * 1000; // ignore anything older than 10 minutes

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const num = (v) => parseInt(v, 10) || 0;
function who(o) {
  if (o.type === 'parcel') return 'Parcel' + (o.name ? ' \u00B7 ' + clip(o.name, 30) : '');
  if (o.type === 'counter') return 'Counter' + (o.name ? ' \u00B7 ' + clip(o.name, 30) : '');
  return 'Table ' + (num(o.table) || '?');
}
function itemsText(o) {
  const list = Array.isArray(o.items) ? o.items.filter(x => x && typeof x === 'object') : [];
  const s = list.map(i => (num(i.qty) || 1) + '\u00D7 ' + clip(i.name || 'Item', 40)).join(', ');
  return clip(s, 150);
}
const withNote = (o, s) => (o.note ? clip(s + ' \u00B7 Note: ' + clip(o.note, 80), 220) : s);
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

// What to send for an order that is now in this status. Each entry: who gets it and what it says.
function plan(o, status, id) {
  const w = who(o), items = itemsText(o), out = [];
  if (status === 'new') {
    const by = o.source === 'waiter' && o.waiterName ? ' (waiter ' + clip(o.waiterName, 20) + ')' : '';
    out.push({ roles: ['kitchen', 'counter'], title: '\uD83D\uDD14 New order \u00B7 ' + w + by, body: withNote(o, items), tag: 'o-' + id, sticky: '1' });
  } else if (status === 'preparing') {
    if (o.decidedBy !== 'kitchen') {
      out.push({ roles: ['kitchen'], title: '\uD83D\uDC68\u200D\uD83C\uDF73 Start cooking \u00B7 ' + w, body: withNote(o, items), tag: 'c-' + id, sticky: '1' });
    }
    if (o.waiterUid) {
      out.push({ roles: ['waiter'], onlyUid: o.waiterUid, title: '\uD83D\uDC4D Accepted \u00B7 ' + w, body: num(o.prepMins) ? 'Ready in about ' + num(o.prepMins) + ' min.' : items, tag: 'a-' + id });
    }
  } else if (status === 'ready') {
    out.push({ roles: ['counter'], title: '\u2705 Ready \u00B7 ' + w, body: items, tag: 'r-' + id });
    out.push({ roles: ['waiter'], onlyUid: o.waiterUid || '', fallbackAll: true, title: '\u2705 Ready to serve \u00B7 ' + w, body: items, tag: 'r-' + id, sticky: '1' });
  } else if (status === 'rejected') {
    if (o.waiterUid) out.push({ roles: ['waiter'], onlyUid: o.waiterUid, title: '\u274C Order rejected \u00B7 ' + w, body: clip(o.cancelReason || 'The cafe could not take this order.', 120), tag: 'a-' + id, sticky: '1' });
  } else if (status === 'cancelled') {
    if (o.cancelledBy === 'cafe') {
      out.push({ roles: ['kitchen'], title: '\uD83D\uDED1 Stop cooking \u00B7 ' + w, body: clip(o.cancelReason || 'The counter cancelled this order.', 120), tag: 'c-' + id, sticky: '1' });
    } else {
      out.push({ roles: ['kitchen', 'counter'], title: '\u26A0\uFE0F Order cancelled \u00B7 ' + w, body: 'Cancelled before it was accepted.', tag: 'o-' + id });
    }
  }
  return out;
}

// Who should get it: phones saved for this cafe and role, whose login still has access.
async function recipients(firestore, cafe, p) {
  const snap = await firestore.collection('pushTokens').where('cafe', '==', cafe).get();
  let list = snap.docs.map(d => Object.assign({ _ref: d.ref }, d.data())).filter(t => p.roles.includes(t.role));
  if (p.onlyUid) {
    const mine = list.filter(t => t.uid === p.onlyUid);
    if (mine.length || !p.fallbackAll) list = mine;
  }
  const verdict = new Map();
  await Promise.all([...new Set(list.map(t => t.uid + '|' + t.role))].map(async k => {
    const [uid, role] = k.split('|');
    verdict.set(k, await mayUse(firestore, cafe, role, uid).catch(() => true));
  }));
  const keep = [];
  for (const t of list) {
    if (verdict.get(t.uid + '|' + t.role)) keep.push(t);
    else t._ref.delete().catch(() => {}); // this login was removed from the cafe
  }
  return keep;
}

async function deliver(cafe, tokens, p) {
  const seen = new Set(), unique = [];
  tokens.forEach(t => { if (!seen.has(t.token)) { seen.add(t.token); unique.push(t); } });
  const dead = [];
  let sent = 0;
  for (const role of ['kitchen', 'counter', 'waiter']) {
    const group = unique.filter(t => t.role === role);
    for (let i = 0; i < group.length; i += 500) {
      const chunk = group.slice(i, i + 500);
      const data = { title: p.title, body: p.body, url: '/' + role + '?cafe=' + cafe };
      if (p.tag) data.tag = p.tag;
      if (p.sticky) data.sticky = p.sticky;
      const r = await admin.messaging().sendEachForMulticast({
        tokens: chunk.map(t => t.token), data,
        webpush: { headers: { Urgency: 'high', TTL: '600' } }
      });
      r.responses.forEach((x, j) => {
        if (x.success) sent++;
        else if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(String(x.error && x.error.code))) dead.push(chunk[j]._ref);
        else console.error('send failed', x.error && x.error.code, x.error && x.error.message);
      });
    }
  }
  await Promise.all(dead.map(ref => ref.delete().catch(() => {})));
  return sent;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (tooMany(req, 90)) return res.status(429).json({ error: 'Too many requests' });
  try {
    const b = body(req);
    const { cafe, kind, id } = b;
    if (!okCafe(cafe) || !okDocId(id) || !['order', 'call'].includes(kind)) return res.status(400).json({ error: 'Bad request' });

    const firestore = db();
    const ref = firestore.doc('cafes/' + cafe + '/' + (kind === 'order' ? 'orders' : 'calls') + '/' + id);

    // Read the real record, check it is fresh, and mark this alert as sent (once only).
    const claim = await firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { skip: 'gone' };
      const d = snap.data() || {};
      const status = kind === 'order' ? String(d.status || '') : 'call';
      const age = Date.now() - (ms(d.updatedAt) || ms(d.createdAt));
      if (!(age < MAX_AGE_MS)) return { skip: 'old' };
      if (d.pushed && d.pushed[status]) return { skip: 'already sent' };
      tx.update(ref, { ['pushed.' + status]: admin.firestore.Timestamp.now() });
      return { d, status };
    });
    if (claim.skip) return res.status(200).json({ ok: true, skipped: claim.skip });

    let plans;
    if (kind === 'call') {
      plans = [{ roles: ['waiter', 'counter'], title: '\uD83D\uDE4B Table ' + (num(claim.d.table) || '?') + ' is calling', body: 'A customer tapped \u201CCall waiter\u201D.', tag: 'call-' + id, sticky: '1' }];
    } else {
      plans = plan(claim.d, claim.status, id);
    }

    let sent = 0;
    for (const p of plans) {
      const tokens = await recipients(firestore, cafe, p);
      if (tokens.length) sent += await deliver(cafe, tokens, p);
    }
    return res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error('notify error', e);
    return res.status(500).json({ error: 'Could not send alerts' });
  }
};
