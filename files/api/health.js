// Open yoursite/api/health in a browser to check that the alert server is set up correctly.
const { admin, db } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const firestore = db();
    await firestore.doc('config/health-check').get();      // proves the key can reach your database
    let messaging = 'ok';
    try { admin.messaging(); } catch (e) { messaging = 'problem'; }
    return res.status(200).json({ ok: true, database: 'connected', messaging, project: admin.app().options.credential?.projectId || undefined });
  } catch (e) {
    return res.status(200).json({ ok: false, problem: String((e && e.message) || e).slice(0, 300) });
  }
};
