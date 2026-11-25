// Phone alerts for staff screens (kitchen, counter, waiter).
// The "Alerts on/off" button in the top bar uses this file.
import { app } from './fb.js';
import { toast, ls } from './common.js';

// >>> PASTE YOUR KEY HERE (one time) <<<
// Firebase console > Project settings > Cloud Messaging > Web Push certificates > "Key pair"
// (a long piece of text that starts with the letter B). Keep the quote marks.
const VAPID_KEY = 'BLpdEboLBRbt_YauWrqtm55cBkyWQDEQUQu-dEc4HPuxOuP0Ul17R_vuyoxpH3PcFe2_2cFGf9rligA-w41BB6A';

const FIREBASE_MESSAGING = 'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js';
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isInstalled = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const configured = () => VAPID_KEY.length > 40 && VAPID_KEY.indexOf('PASTE') === -1;

// role: 'kitchen' | 'counter' | 'waiter'.  ctx(): { user, cafeId }.  onChange(): redraw the top bar.
export function pushUI({ role, ctx, onChange }) {
  const WANT = 'yuno:push:want:' + role, TOKEN = 'yuno:push:token:' + role;
  let busy = false;

  function state() {
    if (!configured()) return 'setup';
    if (!canPush()) return isIOS() && !isInstalled() ? 'install' : 'none';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted' && ls.get(WANT, false)) return 'on';
    return 'off';
  }
  function button() {
    const st = state();
    if (st === 'setup' || st === 'none') return '';
    const label = busy ? 'Alerts\u2026' : st === 'on' ? 'Alerts on' : st === 'blocked' ? 'Alerts blocked' : st === 'install' ? 'Get alerts' : 'Alerts off';
    return '<button type="button" class="btn-ghost' + (st === 'on' ? ' on' : '') + '" data-action="push" title="Phone alerts when the app is closed or the phone is locked">' + label + '</button>';
  }

  async function messagingToken() {
    const { getMessaging, getToken } = await import(FIREBASE_MESSAGING);
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  }
  async function call(body) {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      let m = ''; try { m = (await res.json()).error || ''; } catch (e) {}
      throw new Error(m || ('Server error ' + res.status));
    }
    return res.json();
  }

  async function turnOn(quiet) {
    const c = ctx();
    if (!c.user || !c.cafeId || busy) return;
    busy = true; onChange();
    try {
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { if (!quiet) toast('Alerts need permission. Tap Allow when your phone asks.'); return; }
      }
      const token = await messagingToken();
      if (!token) throw new Error('No token from Firebase');
      const idToken = await c.user.getIdToken();
      await call({ idToken, cafe: c.cafeId, role, token, test: !quiet });
      ls.set(WANT, true); ls.set(TOKEN, token);
      if (!quiet) toast('Alerts are on. A test alert is on its way.');
    } catch (e) {
      if (!quiet) toast('Could not turn alerts on: ' + String((e && e.message) || e).slice(0, 120));
    } finally { busy = false; onChange(); }
  }

  // Stop alerts on this phone. forget=true means "the person turned them off".
  async function detach(forget) {
    const c = ctx(); const token = ls.get(TOKEN, '');
    if (forget) ls.set(WANT, false);
    ls.set(TOKEN, '');
    if (token && c.user) { try { await call({ idToken: await c.user.getIdToken(), token, action: 'remove' }); } catch (e) {} }
  }

  async function toggle() {
    if (busy) return;
    const st = state();
    if (st === 'install') { toast('On iPhone: tap Share, then Add to Home Screen. Open YUNO from the home screen, then tap Get alerts.'); return; }
    if (st === 'blocked') { toast('Alerts are blocked. Allow notifications for this site in your phone settings, then tap here again.'); return; }
    if (st === 'on') { busy = true; onChange(); await detach(true); busy = false; toast('Alerts are off on this phone.'); onChange(); return; }
    turnOn(false);
  }

  // Call when the screen is ready: quietly keeps this phone registered if alerts were already on.
  function sync() { if (state() === 'on') turnOn(true); }
  // Call just before signing out, so a signed-out phone stops getting alerts.
  async function release() { await detach(false); }

  return { button, toggle, sync, release, state };
}
