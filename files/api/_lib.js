// Shared helpers for the YUNO alert server (runs on Vercel, not on phones).
const admin = require('firebase-admin');
const crypto = require('crypto');

let ready = false;
function init() {
  if (ready) return;
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing. Add it in Vercel > Settings > Environment Variables, then redeploy.');
  if (raw[0] !== '{') { try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { /* fall through */ } }
  let key;
  try { key = JSON.parse(raw); }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not the full key file. Paste the whole contents of the downloaded .json file.'); }
  if (key.private_key) key.private_key = key.private_key.replace(/\\n/g, '\n');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key) });
  ready = true;
}
const db = () => { init(); return admin.firestore(); };

// The admin logins (same two User UIDs as in firestore.rules). Override with ADMIN_UIDS in Vercel if they ever change.
const adminUids = () => (process.env.ADMIN_UIDS || 'TMEmAwS7H5O70tHMyMhm1TJINh52,ZTLPHkeWeBXEfzkYiGTtz0U38Wl1')
  .split(',').map(s => s.trim()).filter(Boolean);

// May this login use alerts for this cafe in this role? (Same rule the database uses.)
async function mayUse(firestore, cafe, role, uid) {
  if (adminUids().includes(uid)) return true;
  const sub = role === 'waiter' ? 'waiters' : 'staff';
  const snap = await firestore.doc('cafes/' + cafe + '/' + sub + '/' + uid).get();
  return snap.exists;
}

const tokenDocId = (token, cafe, role) => crypto.createHash('sha256').update(token + '|' + cafe + '|' + role).digest('hex');
const okCafe = (s) => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);
const okDocId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,60}$/.test(s);

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

// Very small speed limit per visitor (best effort; resets when the server restarts).
const hits = new Map();
function tooMany(req, max) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

module.exports = { admin, db, mayUse, tokenDocId, okCafe, okDocId, body, tooMany, adminUids };
