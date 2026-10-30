# KOBG — backend & launch guide

This folder is **not published** by GitHub Pages (Jekyll skips folders starting with `_`).

| File | What it is |
|---|---|
| `order-apps-script.gs` | The order + admin backend (Google Apps Script web app). **Must be deployed — see step 1.** |
| `test-backend.js` | 50 automated tests for the backend (orders, admin, customer accounts, loyalty points, admin Clients view). Run `node _ops/test-backend.js`. |
| `gas-mock.js` | In-memory stand-in for Google's services, used by the tests and the dev server. |
| `dev-server.js` | Local preview at `http://localhost:8080/` with a **fake** backend (nothing reaches Google). Run `node _ops/dev-server.js`; admin key `dev-admin-key-0123456789`. E-mails the backend would send (password-reset links) are printed in the console instead, and listed at `/__mails`. |

---

## 1. Deploy the backend (required, ~10 min)

The site already posts orders to the Apps Script URL in `script.js` (`ORDER_ENDPOINT`) and `assets/admin.js` (`ADMIN_ENDPOINT`). The code that was running there was not in the repo, so it could not be audited. Replace it with `order-apps-script.gs`:

1. Open the Google Sheet that receives the orders → **Extensions › Apps Script**.
2. Select all the code in `Code.gs` (or whatever the file is called), delete it, paste the full content of `order-apps-script.gs`, **Save**.
3. In the function dropdown pick **`setup`** → **Run**. Approve the permissions Google asks for (Sheets, external requests to read the site's catalog, sending e-mail). The execution log should say the tabs are ready and the catalog was read. `setup` also creates the **Clients** tab (customer accounts), the **Points** tab (loyalty ledger) and the **Compte client** / **Points utilisés (DH)** columns at the end of **Commandes**; it is safe to run again.
4. Pick **`generateAdminKey`** → **Run**. Copy the key printed in the execution log into a password manager. This is the key for `admin.html`. (Or set your own in **Project Settings › Script Properties › `ADMIN_KEY`**, 12+ characters, random.)
5. Optional: in **Script Properties** add `NOTIFY_EMAIL` = the address that should get an e-mail for every new order.
6. **Deploy › Manage deployments ›** pencil icon on the existing deployment **› Version: New version › Deploy**.
   Editing the existing deployment keeps the same `/exec` URL, so `script.js` and `admin.js` need no change.
   (Only if you create a *new* deployment: *Execute as: Me*, *Who has access: Anyone*, then paste the new URL into `ORDER_ENDPOINT` in `script.js` and `ADMIN_ENDPOINT` in `assets/admin.js`.)
7. Test on the live site: place one real order, check it appears in the sheet and in `admin.html`, then set it to **Annulée**.

If you had an older **Gestion** tab, the script finds its columns by name (`N° commande`/`Commande`, `Statut`/`Etat`, `Note`…) and adds any missing ones.

### Customer accounts (`compte.html`)

Customers can create an account (optional: guest checkout still works), sign in, see their orders and statuses, save their name/phone/address/city (pre-filled in every order form), change their password and reset it by e-mail. It runs on the same Apps Script deployment, so there is **no new URL and no new Script Property**: after pasting the new code, run `setup` once (step 1.3) and redeploy as a **New version** (step 1.6). Google will ask once more for the e-mail permission if it was not granted before.

- **Clients tab:** one row per account: ID, e-mail, name, phone, address, city, dates, then `Sel` / `Empreinte` / `Itérations` (salted password hash — never the password). **Do not share this tab or the spreadsheet**; hide or protect those 3 columns if others edit the sheet. You may correct name/phone/address/city in the sheet; do not edit the 3 hash columns or the e-mail (the customer would no longer be able to sign in).
- **Deleting an account** (customer request, CNDP): delete the row. Its sessions stop working on the next request. Past orders stay in **Commandes** (the `Compte client` column keeps the old ID).
- **Orders placed while signed in** carry the account ID in `Compte client`, and the Gestion note starts with "Client connecté : e-mail · adresse enregistrée : …" so the saved delivery address is visible in `admin.html`. A customer's history only lists orders with their own account ID (orders placed as a guest before creating the account are not attached).
- **Statuses** shown to the customer are the ones you set in `admin.html` (Nouvelle → Confirmée → Expédiée → Livrée, or Annulée / Retournée), with the date of each change. Admin notes are never shown to customers.
- **Password speed:** in the function dropdown run **`benchmarkHash`** — it prints how long one sign-in takes. Around 1–3 s is fine. If it is much slower, lower `ACCT.iter` in the script (existing hashes keep working; each account stores its own count) and redeploy.
- **E-mail quota:** reset links are sent with MailApp, which allows ~100 e-mails/day on a free Gmail account (1,500 on Google Workspace), shared with the `NOTIFY_EMAIL` order alerts. When the quota is used up, the customer sees "Envoi de l’e-mail impossible pour le moment" and can retry the next day; check the remaining quota in the execution log of `setup`.
- **Limits:** 30 sign-ups/hour overall; 5 wrong passwords lock that e-mail for 15 min (a password reset unlocks it); 300 failed sign-ins per 15 min overall pause sign-in; 3 reset e-mails/hour per address and 40/hour overall; up to 10 signed-in devices per account; sessions last 30 days with "Rester connecté", 24 h otherwise; reset links are single-use and expire after 1 h.
- **Reset link address:** e-mails link to `SITE_URL` + `compte#reset=…`, so keep `SITE_URL` in sync if you move to a custom domain.
- Test after deploying: create an account on the live site with your own e-mail, place one order while signed in, check that it appears in **Mon compte** and that `Compte client` is filled in the sheet, use "Mot de passe oublié", then set the test order to **Annulée** and delete the test row in **Clients**.

### Loyalty points (programme fidélité)

Customers with an account earn **50 points per full 1 500 DH** of delivered purchases (1 point = 1 DH). The count is cumulative: what does not complete a 1 500 DH step carries over to the next order. They can spend all or part of their balance at checkout (`commande.html` and every product page) when signed in.

**Go-live (on top of an already deployed accounts version):**

1. Apps Script → select all → paste the new `order-apps-script.gs` → **Save**.
2. Run **`setup`** again (adds the **Points** tab and the `Points utilisés (DH)` column at the end of **Commandes**; existing rows and columns are untouched).
3. **Deploy › Manage deployments ›** pencil **› Version: New version › Deploy** (same `/exec` URL).
4. Publish the site files (section 2). Until step 3 is done, the old script ignores the `points` field: publish the site **after** redeploying.
5. Test: sign in with a test account, place an order, set it to **Livrée** in `admin.html` and check the **Points** tab and **Mon compte**; then use the points on a second order, set it to **Annulée** and check that the points come back. Delete the test rows afterwards (or adjust the balance to 0 from the admin).

**How it works:**

- **Points tab (ledger):** one row per movement: date, client ID, e-mail, order, type (`gain`, `retrait`, `utilisation`, `remboursement`, `ajustement`), points (+/−), purchases counted (DH), balance after, reason. **The balance is the sum of this tab**; do not edit or delete rows unless you mean to change a balance (prefer the admin adjustment, which keeps a reason).
- **Earning:** only orders placed while signed in (`Compte client` filled). Points are credited when an order is set to **Livrée**, based on the `Total (DH)` actually collected (after promo and points, delivery included). Setting it to **Retournée** (or moving a delivered order back to another status) removes those purchases and the points they produced. Clicking a status twice never double-credits: each order's ledger rows are reconciled with its status.
- **Spending:** the points are checked and debited by the script when the order is created (never trusted from the browser; capped at the order total after promo). `Total (DH)` is then the amount to collect. **Annulée** / **Retournée** refund the points that order used; setting it back to an active status debits them again.
- **Admin:** the order drawer shows a **Fidélité** card (balance, purchases counted, next step, last 25 movements with their reason) and a manual **adjustment** form (+/− points and a mandatory reason, written to the ledger as `ajustement`; the customer only sees "Ajustement par notre équipe"). The totals show "Points fidélité utilisés" and the CSV export has 3 new columns.
- **Negative balance:** if a returned order's points were already spent, the balance goes below 0 and redeeming is blocked until new purchases (or an adjustment) bring it back.
- **Changing the rate:** edit `LOYALTY` in `order-apps-script.gs` **and** `LOYALTY` in `script.js` (display only), and the texts in `cgv.html` (article 9 bis) and the product/cart notes. Past ledger rows are not recalculated.

### Clients view in `admin.html` (points per customer)

The admin has two tabs at the top: **Commandes** (unchanged) and **Clients**. The URL `admin.html#clients` opens Clients directly.

**Go-live (on top of the loyalty-points version):**

1. Apps Script → select all → paste the new `order-apps-script.gs` → **Save** (no new tab or column, so `setup` does not need to run again; running it is harmless).
2. **Deploy › Manage deployments ›** pencil **› Version: New version › Deploy** (same `/exec` URL).
3. Publish `admin.html`, `assets/admin.js` and `assets/admin.css` (section 2). If the site is published before step 2, the Clients tab shows "Vue Clients indisponible : le script Google n’est pas à jour…" and the Commandes tab keeps working.

**What the admin sees:**

- **Summary:** number of accounts, total points owed (sum of positive balances), clients with a balance, delivered purchases counted.
- **One row per account:** name, e-mail, phone, city, sign-up date, **points balance**, delivered purchases counted, a progress bar towards the next 50 DH ("550 / 1 500 · encore 950 DH"), number of orders (and how many are still active, i.e. not Annulée/Retournée), last order date. Deleted accounts that still have points or orders stay listed, tagged "Compte supprimé".
- **Search** by name, e-mail or phone (any digits, `06…`, `+212…`); **sort** by balance (default, highest first), name, sign-up date, purchases or last order; 50 per page; **Export CSV** of the filtered list (`;`-separated, opens in Excel). Keyboard: `/` search, `R` refresh, `Esc` close.
- **Client file** (click a row): call / WhatsApp / e-mail buttons, balance and progress, the **full points history** with reasons, the manual **adjustment** form (same rules as in the order drawer: confirmation, mandatory reason), every order placed with that account (click one to open the order drawer, then "‹ Retour à la fiche client" or `Esc` to come back), and the account fields (address, last sign-in). The order drawer's Fidélité card has a "Fiche client complète ›" link.

**Backend:** two admin actions, `clients` (list) and `client` (one file), behind the same admin key / session token as the rest of the admin. They return a fixed whitelist of fields (ID, e-mail, name, phone, address, city, sign-up and last sign-in dates); **password salt/hash/iterations, session tokens and reset tokens are never sent**, which the tests check. Both read the Clients, Points and Commandes tabs on each call (no write); with thousands of accounts the list takes a few seconds to load.

### Prize wheel « Roue de la chance »

A promotional game: one free spin per visitor, the prize goes to a customer account. Rules page: `reglement-jeu.html` (linked from the wheel, the CGV article 9 ter and the legal pages' menu).

**Go-live (on top of the Clients-view version):**

1. Apps Script → select all → paste the new `order-apps-script.gs` → **Save**.
2. Run **`setup`** once: it creates the **Roue** tab (one row per prize claimed) and the `WHEEL_SECRET` script property that signs every spin. (If you skip it, both are created at the first spin.) **Never share or edit `WHEEL_SECRET`**: changing it invalidates every spin not yet claimed.
3. **Deploy › Manage deployments ›** pencil **› Version: New version › Deploy** (same `/exec` URL).
4. Publish the site files (section 2): `assets/wheel.js`, `reglement-jeu.html`, `styles.css`, `script.js`, `assets/account.js`, `compte.html`, `admin.html`, `assets/admin.js`, `assets/admin.css`, the pages that load the wheel, the legal pages and `sitemap.xml`. If the site goes out before step 3, the old Apps Script answers `bad_action` to `wheel_spin`: the wheel shows « La Roue de la chance ouvre très bientôt… » (and the browser console says the deployment is outdated); nothing else is affected. The wheel never opens by itself: only the floating button or a link to `#roue` opens it.

**What visitors see:** the wheel never opens by itself. A floating **« Tentez votre chance »** button (bottom left) on the **homepage only** (`index.html` is the only page that loads `assets/wheel.js`) opens it (it becomes « Mon lot à réclamer » / « Mon lot » after the spin). `/#roue` (or `/?roue`) opens it directly. A prize won and not yet claimed stays in the browser and is still added at sign-in / sign-up on `compte`. To show it on another page again, add `<script src="assets/wheel.js"></script>` after `script.js` there. Only the **START** button in the centre spins. The server draws the prize and the wheel stops on that slice. The result asks to create an account (the prize is added automatically) or sign in. A signed-in customer gets it at once. The prize then shows in **Mon compte › Mon lot**.

**The prizes:**

- **Points** (10/25/50/100) go into the loyalty ledger with the reason « Roue de la chance » and can be spent right away.
- **Discounts** (-20 % / -50 %) can be used once, on the items of one order placed while signed in, within 30 days. They are not combined with a promo code: the code is ignored, and the customer can untick the discount to keep it for later. They do combine with points. Free delivery is still judged on the price before the discount. The discount comes back if the order is set to **Annulée** or **Retournée**. Orders that used it have « ROUE » in the « Code promo » column.
- **Gifts** (gloves, body protector) wait for the team. The order drawer, the client row and file and the **Roue** tab show « 🎁 Cadeau à remettre ». Call the customer to choose model and size, hand it over (for example with their next order), then click **Marquer remis**.

**Admin, Roue tab (`admin.html#roue`):** totals (spins since launch, counted in the `WHEEL_STATS` script property; prizes claimed; gifts to hand over; discounts used); the list of gifts to hand over; each prize with its odds, how often it was drawn and claimed, still open and used; the last prizes claimed (click an e-mail to open the client file). The admin endpoint returns the spin ID, client, e-mail, status and dates only — no token, no secret, no password data.

**Changing the odds or prizes:** edit `WHEEL` in `order-apps-script.gs` (odds in %, must add up to exactly 100, none may be 0 — otherwise the wheel refuses to spin). Keep the **same slice order** in `SLICES` in `assets/wheel.js` (labels, photos) and in `FILL` (colours), and update the prize list (« Lots », article 4) in `reglement-jeu.html`. To stop the game: `on: false` in `WHEEL` (the wheel then says it is unavailable) and remove the `<script src="assets/wheel.js">` tags; already-won prizes stay valid.

**One spin per person — what is and is not enforced:**

- The spin result is an HMAC-signed token kept in the browser (`localStorage`). Reloading or coming back shows the same result. An edited token is refused.
- **Clearing the browser's storage (or another browser / private window) gives a new spin, but never a second prize**: the claim is checked on the server, one per spin, per account, per e-mail and per phone number. An account that already received a prize cannot claim another one. Someone could still spin many times before creating one account and keep the best result. That is why the rare prizes are very rare and spins are capped at 400/hour for the whole site (Apps Script cannot see IP addresses).
- A spin must be claimed within 30 days.

**Local test:** `node _ops/dev-server.js` serves the site with the fake backend. Dev-only: `http://localhost:8080/__wheel?slice=8` makes the *next* spin land on slice 8 (0–9, same order as `WHEEL`), to try a discount or a gift. It only exists in the local preview, not in the Apps Script.

## 2. Publish the site

Upload/commit everything (including `_ops/` and `_headers`; they are not served by GitHub Pages) to the repository GitHub Pages builds from.

## 3. Information only you can provide — fill before launch

Search the HTML for `data-todo` — **16 placeholders** show "[À compléter : …]" on the live pages until filled:

- `mentions-legales.html` (8): raison sociale, forme juridique/capital, address, ICE, RC + tribunal, IF, taxe professionnelle, directeur de la publication.
- `cgv.html` (5): raison sociale, address, ICE, RC, customer-service phone/WhatsApp.
- `confidentialite.html` (3): raison sociale, address, **CNDP declaration number**.

Also:

- **WhatsApp:** `WHATSAPP_NUMBER` in `script.js` is empty, so every WhatsApp button is hidden. Put the number there (one line) and they appear site-wide.
- **Phone:** the only seller phone on the site is `+1 438 389 1565` (a Canadian number). Law 31-08 expects a number Moroccan customers can reach — add a Moroccan line.
- **CNDP:** declare the order-data processing (stored in Google Sheets, outside Morocco) to the CNDP — www.cndp.ma.
- **Written order confirmation:** law 31-08 expects the order's essentials to be confirmed to the customer in writing (otherwise the withdrawal period can extend). A WhatsApp/SMS recap when you call, or a printed recap in the parcel, covers it.
- The legal pages were rewritten from the facts of how the shop works; have them **reviewed by a Moroccan lawyer/accountant**. This is not legal advice.

## 4. Keep in sync when you change things

- **Prices, sizes, products:** the backend reads them from `assets/search-index.js` on the live site (cached 10 min). Regenerate that file whenever product cards change — nothing to edit in the script.
- **Prize wheel:** `WHEEL` in `order-apps-script.gs`, `SLICES`/`FILL` in `assets/wheel.js` and the prize list in `reglement-jeu.html` must describe the same 10 slices in the same order.
- **Promo codes, delivery fee (currently 0 = free delivery), free-delivery threshold:** set in **both** the CONFIG block of `script.js` and the CONFIG block of `order-apps-script.gs` (then redeploy, step 1.6).
- **Moving to a custom domain** (recommended, see below): update `SITE_URL` in the `.gs` (also used in password-reset e-mails), the canonical/OG URLs in every page, `sitemap.xml` and `robots.txt`.
- **New pages:** copy the header from an existing page; it includes the account icon (`#acctBtn`) next to the cart. `compte.html` is `noindex`, blocked in `robots.txt` and deliberately left out of `sitemap.xml`.

## 5. Security — what is covered and what is not

Covered:
- Orders are **re-priced on the server** from the published catalog; a total edited in the browser is replaced and flagged ("⚠ Total recalculé") in the Gestion note and the e-mail. Unknown products/sizes are refused. The cart also corrects stale or edited prices when it loads.
- Every field is validated and length-capped; text that starts with `= + - @` is stored as plain text, so no one can plant a formula (e.g. `=IMPORTDATA(...)` that would leak customer data) in the sheet. The admin CSV export is protected the same way.
- Rate limits: 5 orders/hour per phone number, 40 orders/10 min overall; a double tap or network retry is stored once.
- Admin: key compared in constant time; 5 wrong keys → 15 min lock; while locked, an already signed-in session keeps working (so nobody can lock you out). The browser stores a **signed, expiring session token** (12 h, or 30 days with "Rester connecté"), never the key. Running `generateAdminKey` again signs every device out.
- Content-Security-Policy on every page (scripts only from the site itself; orders only to Google Apps Script), no inline scripts except one hashed pre-paint snippet, strict referrer policy. The admin page refuses to run inside a frame (clickjacking).

- Customer accounts: passwords hashed with PBKDF2-SHA256 + a random salt per account; the browser keeps only a random session token whose SHA-256 is stored server-side with an expiry; changing or resetting the password signs out the other devices; "Se déconnecter de tous les appareils" is available; sign-in errors never say whether an e-mail exists; profile fields get the same formula-injection protection as orders. Reset tokens travel in the link's `#fragment` (never sent to a server or logged) and are removed from the address bar immediately.

Limits to know about:
- Sign-up does say "an account already exists with this e-mail" (otherwise customers can't tell why sign-up fails); this lets someone check whether an e-mail is a customer, slowed by the 30 sign-ups/hour cap.
- Anyone who knows a customer's e-mail can lock their sign-in for 15 min with wrong passwords (the reset link still works). This is the usual trade-off against password guessing.
- The session token is kept in the browser's storage, readable by scripts on the same origin — another reason for a custom domain (see below). The strict CSP keeps third-party scripts out.
- Apps Script hashing is slow, so the iteration count (5,000) is lower than for a native server; strong passwords matter. Changing the e-mail of an account is not offered (do it by re-creating the account).
- Apps Script can't see visitors' IP addresses, so rate limits are per phone number and global, not per visitor.
- GitHub Pages can't send HTTP headers, so `frame-ancestors`/HSTS etc. only apply if you move to Netlify or Cloudflare Pages, which read the `_headers` file included here.
- The shop is served from its own domain, `https://knockoutboxinggear.com/` (file `CNAME`; `www` points to `slahmaid.github.io`), so it has its own browser origin instead of sharing `slahmaid.github.io` with the account's other GitHub Pages sites. All links are relative, so the site works at the domain root; old `slahmaid.github.io/KOBG/...` addresses are redirected by GitHub Pages.

### Clean addresses (no `.html` in the address bar)

GitHub Pages serves `cgv.html` for `/cgv`, so every link, the sitemap, canonical/og:url tags, JSON-LD, the search index (`url`) and the e-mails use addresses without `.html` (home = `/`). Files keep their `.html` names on disk.

- **Product pages** are named after the model and colour: `rb10-intelli-shock-noir-rouge.html` → `/rb10-intelli-shock-noir-rouge` (also `rb11-evolution-…`, `rs100-professional-…`, `rs11v-evolution-…`, `rs1-pro-20e-anniversaire-…`, `protecteur-corporel-…`). Product IDs (cart, orders, prices checked by the Apps Script, photos in `assets/p/`) did not change.
- **Old product addresses** (`gants-de-sac-rival-…html`, `gants-de-sparring-…html`, `protecteur-corporel-rival-…html`) are small redirect pages (`assets/go.js` + `<meta http-equiv="refresh">`, `noindex`, canonical to the new address) that keep `?…` and `#…`. Do not delete them: old e-mails, shares and search results point there.
- **Other pages** opened as `page.html` show `/page` in the address bar (`script.js`, `assets/admin.js`; no reload).
- **Upper case / trailing slash** (`/RB10-INTELLI-SHOCK-NOIR-ROUGE`, `/cgv/`): GitHub Pages answers with `404.html`, whose script sends the visitor to the lower-case address without the slash.
- **New page or product:** link it as `name` (no `.html`), add `https://knockoutboxinggear.com/name` to `sitemap.xml` and to its canonical/og:url.
- `_ops/dev-server.js` serves `/name` from `name.html` like GitHub Pages.

