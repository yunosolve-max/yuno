// POST /api/register
// A signed-in staff phone says "send alerts to me". We check the login is really linked to that cafe,
// then save the phone's alert address (token) in the database. Nobody else can read these.
const { admin, db, mayUse, tokenDocId, okCafe, body, tooMany } = require('./_lib');

const ROLES = ['kitchen', 'counter', 'waiter'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (tooMany(req, 30)) return res.status(429).json({ error: 'Too many tries. Wait a minute.' });
  try {
    const b = body(req);
    const token = typeof b.token === 'string' ? b.token : '';
    if (token.length < 50 || token.length > 4096) return res.status(400).json({ error: 'Bad alert address.' });

    const firestore = db();
    let uid;
    try { uid = (await admin.auth().verifyIdToken(String(b.idToken || ''))).uid; }
    catch (e) { return res.status(401).json({ error: 'Please sign in again.' }); }

    // Phone stops getting alerts (turned off, or signed out).
    if (b.action === 'remove') {
      const snap = await firestore.collection('pushTokens').where('token', '==', token).get();
      await Promise.all(snap.docs.filter(d => d.data().uid === uid).map(d => d.ref.delete()));
      return res.status(200).json({ ok: true });
    }

    const cafe = b.cafe, role = b.role;
    if (!okCafe(cafe) || !ROLES.includes(role)) return res.status(400).json({ error: 'Bad request.' });
    if (!(await mayUse(firestore, cafe, role, uid))) {
      return res.status(403).json({ error: 'This login is not linked to this cafe for that screen.' });
    }

    await firestore.collection('pushTokens').doc(tokenDocId(token, cafe, role)).set({
      token, cafe, role, uid,
      ua: String(req.headers['user-agent'] || '').slice(0, 160),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // First time turning on: send one test alert so staff know it works.
    if (b.test === true) {
      try {
        await admin.messaging().send({
          token,
          data: {
            title: '\u2705 YUNO alerts are on',
            body: role === 'kitchen' ? 'New orders will show here, even when the phone is locked.' : 'You will get alerts here, even when the phone is locked.',
            tag: 'yuno-test', url: '/' + role + '?cafe=' + cafe
          },
          webpush: { headers: { Urgency: 'high', TTL: '120' } }
        });
      } catch (e) {
        console.error('test send failed', e && e.code, e && e.message);
        return res.status(502).json({ error: 'Saved, but the test alert failed: ' + String((e && e.message) || 'unknown error').slice(0, 200) });
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('register error', e);
    return res.status(500).json({ error: String((e && e.message) || 'Server error').slice(0, 200) });
  }
};
