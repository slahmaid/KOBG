# KOBG — backend & launch guide

This folder is **not published** by GitHub Pages (Jekyll skips folders starting with `_`).

| File | What it is |
|---|---|
| `order-apps-script.gs` | The order + admin backend (Google Apps Script web app). **Must be deployed — see step 1.** |
| `test-backend.js` | 37 automated tests for the backend (orders, admin, customer accounts). Run `node _ops/test-backend.js`. |
| `gas-mock.js` | In-memory stand-in for Google's services, used by the tests and the dev server. |
| `dev-server.js` | Local preview at `http://localhost:8080/KOBG/` with a **fake** backend (nothing reaches Google). Run `node _ops/dev-server.js`; admin key `dev-admin-key-0123456789`. E-mails the backend would send (password-reset links) are printed in the console instead, and listed at `/__mails`. |

---

## 1. Deploy the backend (required, ~10 min)

The site already posts orders to the Apps Script URL in `script.js` (`ORDER_ENDPOINT`) and `assets/admin.js` (`ADMIN_ENDPOINT`). The code that was running there was not in the repo, so it could not be audited. Replace it with `order-apps-script.gs`:

1. Open the Google Sheet that receives the orders → **Extensions › Apps Script**.
2. Select all the code in `Code.gs` (or whatever the file is called), delete it, paste the full content of `order-apps-script.gs`, **Save**.
3. In the function dropdown pick **`setup`** → **Run**. Approve the permissions Google asks for (Sheets, external requests to read the site's catalog, sending e-mail). The execution log should say the tabs are ready and the catalog was read. `setup` also creates the **Clients** tab (customer accounts) and a **Compte client** column at the end of **Commandes**; it is safe to run again.
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
- **Reset link address:** e-mails link to `SITE_URL` + `compte.html`, so keep `SITE_URL` in sync if you move to a custom domain.
- Test after deploying: create an account on the live site with your own e-mail, place one order while signed in, check that it appears in **Mon compte** and that `Compte client` is filled in the sheet, use "Mot de passe oublié", then set the test order to **Annulée** and delete the test row in **Clients**.

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
- **Promo codes, delivery fee, free-delivery threshold:** set in **both** the CONFIG block of `script.js` and the CONFIG block of `order-apps-script.gs` (then redeploy, step 1.6).
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
- On `slahmaid.github.io`, every GitHub Pages site of that account shares one browser origin (and therefore the admin session storage). A custom domain (e.g. a `.ma` domain) gives the shop its own origin; recommended before scaling up.
