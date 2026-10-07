# YUNO

Scan-to-order for cafes. Customers scan the QR code on their table, order from their phone,
and the cafe gets the order on the counter screen.

## Pages
- `/menu.html?cafe=<cafe>&table=3`  Customer menu (what the QR code opens). Example: `/menu.html?cafe=cornercup&table=3`
- `/<cafe>?table=3`  Short version of the same link (needs `_redirects` on Netlify)
- `/counter`         Counter screen for cafe staff (login needed): orders, menu, QR codes, settings
- `/admin`           Your admin page (only your admin login): create cafes and staff logins
- `/`                YUNO landing page with a live-demo QR code and WhatsApp buttons

## Files
- `fb.js`          Firebase connection (your project: yumotapit-5027e)
- `menu.js`        Customer menu
- `counter.js`     Counter screen
- `admin.js`       Admin page
- `common.js`      Shared helpers and the sample menu
- `qrcode.js`      QR code maker (MIT license, Kazuhiko Arase)
- `app.css`       Soft lime, lavender and sky card design
- `firestore.rules`   Security rules to paste into Firebase
- `_redirects`        Makes `/cornercup` open the menu page on Netlify
- `vercel.json`       Page addresses for Vercel hosting (/admin, /counter, /kitchen, /<cafe>)

## Setup (in order)
1. Firebase > Authentication > Users > Add user: your own admin email + password. Copy your User UID.
2. Your admin User UID is already filled in inside `firestore.rules`.
3. Firebase > Firestore Database > Rules: paste the whole file, click Publish.
4. Put this folder on Netlify (drag and drop the unzipped folder).
5. Firebase > Authentication > Settings > Authorized domains: add your Netlify domain.
6. Open `/admin`, sign in, create a cafe, create a staff login.
7. Open `/counter` with the staff login, print QR codes from the "QR codes" tab.

## Payments and sales (added October 2026)
- Counter > Settings > Sales day and payments:
  - Sales day ends at: pick a time after closing (default 3 AM), so late-night sales count for the right day.
  - Warn if a table hasn't paid after: the counter flags served tables with no bill (default 20 minutes).
- Counter > Bills: month calendar with each day's sales. Tap a day to see its bills.
- Admin: each cafe card has "Delete this cafe" (type the web name to confirm). Staff logins stay in
  Firebase Authentication; delete them there if no other cafe uses them.
- After updating, paste the new firestore.rules into Firebase and click Publish (needed for deleting cafes).
- Customers see "Your bill, please pay at the counter" once their food is ready. (Online UPI payment was removed.)
- Bills are never deleted when the sales day ends. Pick any past day with the calendar icon in Bills.

## Logo and theme (admin only)
- Admin > a cafe card > Logo and theme: upload a logo, pick a colour theme (or a custom colour),
  and choose whether the customer menu follows the phone's light/dark setting.
- The logo shows on the customer menu, browser tab, counter and kitchen top bar, printed bills and QR stickers.
- The theme colours the customer menu only. Counter and kitchen keep the standard status colours.
- Staff can't change the logo or theme: the existing security rules don't let them edit "brand".

## Kitchen accept and reject (added October 2026)
- New orders appear on the kitchen screen right away with Accept (pick a ready time) and Reject (pick a reason).
- The counter can still accept or reject too. Whoever taps first wins; the other screen is told who decided.
- Both screens show who accepted ("accepted in the kitchen" / "at the counter") and a list of rejected orders with reasons.
- New orders ring nonstop on both screens until someone accepts or rejects.

## Fast menu loading
- menu.html starts downloading the cafe's menu straight away and shows it before the live connection is ready.
- Phones keep a copy of the menu, so repeat scans show it instantly. Ordering waits for fresh data.
- If you change the Firebase project, update the project id and key in menu.html and fb-menu.js as well as fb.js.

## Photos, dish helper, games and more (added October 2026)
- Counter > Menu > edit a dish: add a photo, a Chef's pick badge, spice level, allergens, and
  "How it's made" / "How it tastes" (optionally in Malayalam). The dish helper answers only from these.
- Photos are made small automatically and kept in one record per cafe (about 50 photos fit).
- Popular badges: the 3 best sellers of the last 7 days, updated once a day by the counter.
- Customers: tap a dish for details and the helper; "Order again"; a celebration after ordering; games button at the top.
- Games: Memory, Tic-tac-toe, Connect four, Tap race, Reaction, Finger picker, Food quiz on one phone;
  Tic-tac-toe, Connect four and Food quiz across phones with a 4-letter room code.
- Kitchen: "Sold out" button hides a dish from customers at once.
- Bills: charts (busiest hours, average sales by day, best sellers) and today's waiting times.
- Daily totals: each bill also updates a small record for its day, so the calendar reads ~30 records a month.
  The counter builds these from older bills the first time it opens.
- Admin > Logo and theme: festival looks (Onam, Diwali, Christmas, Eid, New Year) with an end date.

## After uploading this version
1. Paste the new firestore.rules into Firebase and click Publish (needed for photos, daily totals and game rooms).
2. In Admin, create a cafe with the web name "demo" and tick the sample menu. The home page QR opens it.
3. WhatsApp number is set in index.html (`var WHATSAPP = '919061927047';`). Change it there if it ever changes.
4. Ask a Malayalam speaker to check the phrases in helper.js before launch.

## Demo for new shops
- The home page shows a "Scan to try the demo" QR (also on phones) and a "Show QR full screen" button for pitching.
- The QR opens /menu.html?cafe=demo&table=1. If no cafe called "demo" exists, a built-in sample cafe is shown:
  orders there go nowhere and play out by themselves (accepted, cooking, ready). Create a real "demo" cafe in Admin
  if you also want orders to reach a demo counter and kitchen.

## Kitchen tickets (KOT)

A KOT is a slip for the cook: table, items and quantities in big letters, no prices.
It prints on the same thermal printer and paper size (58 or 80 mm) as bills.

- **Print by hand, kitchen screen:** every cooking ticket has a **Print KOT** button.
- **Print by hand, counter:** open the table, tap **⋯** on the order, then **Print KOT**.
- **Print automatically:** kitchen screen top bar → **Auto KOT on**, or counter
  **Settings → Kitchen tickets (KOT)** → switch on. This is per device, so turn it on
  only on the computer connected to the printer. Each order prints once, even after a refresh.
- **Print with no pop-up window (recommended for auto KOT):** on the Windows computer with
  the printer, make the printer the Windows default, then make a Chrome shortcut whose
  Target ends with `--kiosk-printing`, for example
  `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://yuno-puce.vercel.app/kitchen`.
  Close every Chrome window and open YUNO from that shortcut. Tickets now print silently.

## One-tap bill

Open a table. When all its food has been sent to the kitchen, three big buttons show at the bottom:
**Cash**, **UPI**, **Card**. One tap saves the bill with that payment, using your normal GST and
no discount, and prints it straight away. For a discount, a different GST or splitting the bill,
tap **Discount, GST or split bill** underneath.
