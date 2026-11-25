# YUNO phone alerts: start here

After this, the kitchen, counter and waiters get a notification on their phone **even when the phone is locked
or YUNO is minimized**:

| Who | Gets an alert when |
|---|---|
| Kitchen | a new order comes in, the counter accepts an order (start cooking), an order is cancelled |
| Counter | a new order comes in, food is ready, a table taps "Call waiter" |
| Waiters | food is ready to serve, their order was accepted or rejected, a table taps "Call waiter" |

Nothing changes for customers. The sound you already have on the open screens still works as before.
You do **not** need to publish new Firestore rules.

Do these 3 parts once. Take your time, each step is small.

---

## Part 1: Get two things from Firebase (5 minutes)

Open https://console.firebase.google.com and click your project **yumotapit-5027e**.
Then click the **gear icon** (top left) > **Project settings**.

**1. The Web Push key**
1. Click the **Cloud Messaging** tab.
2. Scroll to **Web Push certificates** and click **Generate key pair**.
3. A long text starting with the letter **B** appears. Copy it.
4. Open the file **push.js** in this folder. Near the top find:
   `const VAPID_KEY = 'PASTE_YOUR_WEB_PUSH_KEY_HERE';`
   Replace `PASTE_YOUR_WEB_PUSH_KEY_HERE` with your key. Keep the quote marks. Save.
5. Still on the Cloud Messaging tab, check that **Firebase Cloud Messaging API (V1)** says **Enabled**.
   If it says Disabled, click the three dots next to it > **Manage API in Google Cloud Console** > **Enable**.

**2. The service account key (lets your website send the alerts)**
1. Click the **Service accounts** tab.
2. Click **Generate new private key** > **Generate key**. A `.json` file downloads.
3. Keep that file **private**. Do not put it inside the YUNO folder and do not upload it to GitHub.

---

## Part 2: Put it on Vercel (5 minutes)

**1. Upload the new files** the same way you uploaded YUNO before (GitHub commit, or `vercel --prod`).
Replace the old files with the ones in this folder. New files and folders to include:
`api/` (a folder), `package.json`, `push.js`, `push-send.js`, `firebase-messaging-sw.js`,
`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, and three `manifest-*.json` files.

**2. Give Vercel the service account key**
1. Open vercel.com > your project > **Settings** > **Environment Variables**.
2. Name: `FIREBASE_SERVICE_ACCOUNT`
3. Value: open the downloaded `.json` file in Notepad, select everything (Ctrl+A), copy, paste it here.
4. Tick all environments (Production, Preview, Development) and click **Save**.

**3. Redeploy** (needed so Vercel notices the new key)
Vercel > **Deployments** > click the three dots next to the top one > **Redeploy**.

**4. Check it**
Open `https://YOUR-SITE.vercel.app/api/health` in a browser.
- You should see `"ok":true`. 
- Also open `/version.txt`. It should say **YUNO v4.1**.
- If you see `"ok":false`, read the `problem` line. It says exactly what is missing.

---

## Part 3: Turn alerts on, on each phone

Each person does this once, on their own phone, on **their own screen**:
kitchen phone on `/kitchen`, counter phone on `/counter`, waiters on `/waiter`.

**Android (Chrome)**
1. Open the screen and sign in.
2. Tap **Alerts off** in the top bar. Tap **Allow** when the phone asks.
3. The button changes to **Alerts on** and a test alert arrives. 

**iPhone (iOS 16.4 or newer, must use Safari)**
1. Open the screen in **Safari**.
2. Tap the **Share** button > **Add to Home Screen** > **Add**.
3. Open YUNO **from the new home screen icon** (not from Safari).
4. Sign in, tap **Get alerts**, tap **Allow**.

**Computer** (Chrome or Edge): same as Android. Tap Alerts off > Allow.

Tap **Alerts on** again any time to switch alerts off on that phone. Signing out also stops alerts on that phone.
When someone signs in again, alerts turn back on by themselves.

---

## Good to know

- **Sound:** a phone alert uses the phone's normal notification sound. The loud repeating ring only plays while the
  screen is open. For a kitchen tablet, keep the screen open and plugged in as before, and let alerts cover the times
  the screen is off.
- **Android tip:** in the phone settings, set Chrome (or the installed YUNO icon) to "Notifications: allowed" and
  battery "Unrestricted", or Android may delay alerts to save battery.
- **How alerts are triggered:** right after a customer or staff member saves an order or a call, that phone tells your
  server, and the server checks the real order in the database before sending. If a customer's phone loses internet
  in the very second after ordering, that one alert can be missed (the open kitchen screen still rings).
  Fully automatic alerts, even then, need Firebase Cloud Functions, which require Firebase's paid "Blaze" plan.
  Ask me if you want that later.
- **Not included yet:** "Your order is ready" alerts for customers.
- **Safe:** nobody can send alerts by guessing. The server only sends for orders that really exist and only once.
  The list of phones is stored in a new `pushTokens` collection that your existing rules already block from the public.

## If something goes wrong

| What you see | What to do |
|---|---|
| No "Alerts" button on the screen | You haven't pasted the key into `push.js` yet (Part 1, step 4), or the new files aren't uploaded yet |
| "Alerts blocked" | Notifications are blocked in the phone/browser settings for this site. Allow them, then tap again |
| Toast: "FIREBASE_SERVICE_ACCOUNT is missing" | Part 2, step 2, then Redeploy |
| Toast: "not the full key file" | Paste the whole `.json` contents, from `{` to `}` |
| Toast: "Saved, but the test alert failed ... API has not been used" | Enable **Firebase Cloud Messaging API (V1)** (Part 1, step 5) and wait a minute |
| iPhone shows "Get alerts" but nothing happens | Open YUNO from the Home Screen icon, not from Safari. iOS must be 16.4 or newer |
| `/api/health` shows `ok:false` | Read the `problem` text on that page |
