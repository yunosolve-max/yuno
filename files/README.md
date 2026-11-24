# YUNO

Scan-to-order for cafes. Customers scan the QR code on their table, order from their phone,
and the cafe gets the order on the counter screen.

## Pages
- `/menu.html?cafe=<cafe>&table=3`  Customer menu (what the QR code opens). Example: `/menu.html?cafe=cornercup&table=3`
- `/<cafe>?table=3`  Short version of the same link (needs `_redirects` on Netlify)
- `/counter`         Counter screen for cafe staff (login needed): orders, menu, QR codes, settings
- `/kitchen`         Kitchen screen (staff login): accept, cook and mark orders ready
- `/waiter`          Waiter screen (waiter login): take table orders, follow them, collect payment
- `/admin`           Your admin page (only your admin login): create cafes, staff logins and waiter logins
- `/`                YUNO landing page with a live-demo QR code and WhatsApp buttons

## Files
- `fb.js`          Firebase connection (your project: yumotapit-5027e)
- `menu.js`        Customer menu
- `counter.js`     Counter screen
- `waiter.js`      Waiter screen (page: `waiter.html`)
- `admin.js`       Admin page
- `common.js`      Shared helpers and the sample menu
- `qrcode.js`      QR code maker (MIT license, Kazuhiko Arase)
- `app.css`       Soft lime, lavender and sky card design
- `firestore.rules`   Security rules to paste into Firebase
- `_redirects`        Makes `/cornercup` open the menu page on Netlify
- `vercel.json`       Page addresses for Vercel hosting (/admin, /counter, /kitchen, /waiter, /<cafe>)

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

## Cafe leaderboard games and prizes

Two leaderboard games are in the customer's games menu (the purple **Play & win** button):

- **Tea Stack**: tap to drop each layer onto the tower. Only the part that lands stays.
- **Chai Rush**: ride the scooter down a 3-lane road; swipe or tap left/right, grab tea, dodge traffic.

Each cafe has its own **Top 10**, which starts fresh every day at closing time (or every Monday).
Only phones that scanned a table QR in the last 4 hours can post a score.

**Prize:** counter **Settings → Games and prizes**: type a prize (like "Free masala tea") and pick
daily or weekly. Whoever is #1 when the leaderboard starts fresh wins. On their next visit their
phone shows a gold winner card with a ticking clock. Staff check the name in **Settings → Game
leaderboard** and tap **Mark prize given**. Staff can also **Remove** rude or fake names there.

**One-time Firebase setup:**
1. Publish the new `firestore.rules` (it adds the `scores` rules).
2. Recommended, for speed: Firestore → **Indexes** → **Composite** → **Create index**:
   Collection ID `scores`, fields `pg` Ascending and `score` Descending, scope Collection.
   Without it the leaderboard still works, just a little slower.

**Turning games on or off (admin only):** on the admin page, each cafe card has a **Customer games**
switch. Off hides every game, the leaderboard and the prize from that cafe's menu and counter.
Cafe staff can't change it. Cafes are on by default.

## Which version is live?
Open `yoursite/version.txt`. If it says **YUNO v4**, the newest files are being served. If it is a 404, they are not.
The customer dish helper no longer has the "Tap and ask out loud" microphone button. Customers tap a question instead.

## Messages, poster and the bill choice (latest)
- **Paper bill / WhatsApp bill:** above Cash / UPI / Card (and in the full bill window) pick how the customer gets the bill.
  Paper prints as always. WhatsApp bill needs a phone number and opens WhatsApp to send. You can pick both. The choice is remembered on that device.
  With Paper only, a typed phone number still saves the customer for offers.
- **Edit every message (Customers > Messages):** write your own words for "We miss you", "Thanks for coming", "Our regulars" and the bill.
  Tap a button like **+ Customer name** to add their details. The grey preview shows exactly what they get. **Use ready-made words** brings back the standard text.
  Each reminder can be switched on or off, and you choose after how many days it is sent. The offer line, address and "Reply STOP" line can be switched off.
- **Poster:** in Customers > Messages, step 5, add a picture (a festival offer, a new dish) or paste a link (Instagram, Canva, Google Drive).
  An uploaded picture opens as a full-screen page at `yoursite/poster?cafe=yourcafe` with a See our menu button.
  In the Customers lists choose **What to send: Poster**, then tap Send for each customer. You can also add the poster link to the reminders and to the bill message.
- **Download list:** Customers > All > Download list gives a spreadsheet file (CSV) of your customers.
- No new Firebase rules are needed if you already published the rules from the previous package. The poster picture is stored in the cafe's public `media` record.

## WhatsApp bills and the customer club (added November 2026)
Off until you switch it on: admin page > the cafe's card > **WhatsApp bills and customer club**.

**Bill on WhatsApp**
- When billing, type the customer's phone number. It is **optional**, so in a rush just skip it and the bill saves as always.
  The counter has a phone box above the Cash / UPI / Card buttons, and in the full bill window. The waiter screen has the same box.
- After the bill saves, a window shows the message the customer will get (items, GST, total, how they paid, stamp-card progress, your offer)
  with a green **Send on WhatsApp** button. It opens WhatsApp with the message ready, and you tap Send there.
  On the waiter screen a green bar appears instead. Past bills can be sent from **Bills > the three dots > Send on WhatsApp**.

**Customers (saved automatically, kept apart from sales)**
- Each phone number saves one customer: name (optional), visits, total spent, last visit. Nothing else is stored.
- The **Customers** tab (counter) sorts them into lists on its own:
  **Come back** (not seen for 14+ days, best spenders first), **Second visit** (came once, 2+ days ago), **Regulars** (5+ visits, quiet for a week),
  and **All** (with search). The tab shows a number badge when someone is waiting.
- **Send to next customer** opens WhatsApp with the right message for that list, then removes them from it. **Skip** hides them for now.
  **Mute** means never message them again (do this when someone replies STOP).
- Counter > Settings > **Customer club**: your offer text (like "a free Masala Chai with any snack"), after how many days away to say
  "we miss you", how long an offer is valid, and an optional **stamp card** (a reward every 5 to 15 visits).

**What is automatic, and what is not**
- Automatic: saving customers, counting visits, building the "who to message" lists, writing each message, the stamp-card count, the badge.
- Not automatic: the final tap on **Send**. WhatsApp only sends by itself through the paid WhatsApp Business Platform
  (Meta approval, message templates, and a small server to send them). This app does not use it, so there is no cost and no setup.
  If your client wants fully hands-free sending later, that platform is the next step and these lists and messages can feed it.
- Only message people who gave their number to get their bill, keep offers occasional, and honour STOP. Too many unwanted messages can get a WhatsApp number blocked.

## Games switches, purchases and profit (added November 2026)
- **Two game switches (admin page, on each cafe card):** *Entertaining games* (memory, tic-tac-toe, connect four, quiz, online rooms)
  and *Leaderboard and prize* (Tea Stack, Chai Rush, the Top 10 and the prize). Turn either on or off on its own.
  A cafe that had games off before keeps the leaderboard off until you switch it on.
- **Counter > Purchases:** note what the cafe buys (ingredients, packaging, salary, rent, utilities) with the amount and how it was paid.
  It shows **Profit this month** (sales without GST minus purchases), purchases by type, and **Cash in drawer today**
  (cash bills minus cash purchases). Use the arrows to look at earlier months. Waiters can't see or add purchases.
- Publish the new `firestore.rules` once for these (it adds the `expenses` rules and the leaderboard switch).

## Waiter screen (added November 2026)
Waiters get their own login and a phone-friendly screen at `/waiter`.

**What a waiter can do**
- See every table: Free, Waiting (for the counter or kitchen to accept), In kitchen, Ready, Not paid.
- Tap a table, tap items, add a note, **Send order**. The order goes to the counter and kitchen as
  **Waiting**, exactly like a customer's order, and shows the waiter's name ("by waiter Anu").
  The counter or kitchen taps **Accept** (or Reject) as usual.
- Follow each order (Waiting, In kitchen with the time left, Ready, Served). Tap **Served** when food reaches the table.
- **Cancel** their own order while it is still Waiting (two taps).
- Get a chime and a notice when food is ready, an order is accepted or rejected, or a table taps **Call waiter**.
  Calls and rejected orders show under **Needs attention**.
- See the table's bill (subtotal, GST, total) and take payment with **Cash / UPI / Card**
  (tap twice to confirm). The bill is saved with the cafe's normal GST and shows in the counter's
  **Bills** tab, where it can be printed. Daily sales totals update the same way as counter bills.

**What a waiter can't do:** edit the menu or settings, see sales history or other bills, give discounts,
void bills, take parcel or counter orders, or accept and reject orders.

**One-time setup**
1. Publish the new `firestore.rules` in Firebase (it adds the waiter role). Waiter screens won't work until you do.
2. Admin page > the cafe's card > **Waiter logins**: type the waiter's name, email and a password, tap **Create waiter login**.
   (Or **This waiter already has a login** if the email already exists in Firebase.)
3. Give the waiter the link `https://<your-site>/waiter`, their email and password.
4. **Waiter screen** on the admin card opens the screen for that cafe (the admin login works there too, handy for testing).

A login can be both a staff login and a waiter login. Removing a waiter on the admin page stops that login
opening the waiter screen straight away.
