# KOBG — backend & launch guide

This folder is **not published** by GitHub Pages (Jekyll skips folders starting with `_`).

| File | What it is |
|---|---|
| `order-apps-script.gs` | The order + admin backend (Google Apps Script web app). **Must be deployed — see step 1.** |
| `test-backend.js` | 21 automated tests for the backend. Run `node _ops/test-backend.js`. |
| `gas-mock.js` | In-memory stand-in for Google's services, used by the tests and the dev server. |
| `dev-server.js` | Local preview at `http://localhost:8080/KOBG/` with a **fake** backend (nothing reaches Google). Run `node _ops/dev-server.js`; admin key `dev-admin-key-0123456789`. |

---

## 1. Deploy the backend (required, ~10 min)

The site already posts orders to the Apps Script URL in `script.js` (`ORDER_ENDPOINT`) and `assets/admin.js` (`ADMIN_ENDPOINT`). The code that was running there was not in the repo, so it could not be audited. Replace it with `order-apps-script.gs`:

1. Open the Google Sheet that receives the orders → **Extensions › Apps Script**.
2. Select all the code in `Code.gs` (or whatever the file is called), delete it, paste the full content of `order-apps-script.gs`, **Save**.
3. In the function dropdown pick **`setup`** → **Run**. Approve the permissions Google asks for (Sheets, external requests to read the site's catalog, sending e-mail). The execution log should say the two tabs are ready and the catalog was read.
4. Pick **`generateAdminKey`** → **Run**. Copy the key printed in the execution log into a password manager. This is the key for `admin.html`. (Or set your own in **Project Settings › Script Properties › `ADMIN_KEY`**, 12+ characters, random.)
5. Optional: in **Script Properties** add `NOTIFY_EMAIL` = the address that should get an e-mail for every new order.
6. **Deploy › Manage deployments ›** pencil icon on the existing deployment **› Version: New version › Deploy**.
   Editing the existing deployment keeps the same `/exec` URL, so `script.js` and `admin.js` need no change.
   (Only if you create a *new* deployment: *Execute as: Me*, *Who has access: Anyone*, then paste the new URL into `ORDER_ENDPOINT` in `script.js` and `ADMIN_ENDPOINT` in `assets/admin.js`.)
7. Test on the live site: place one real order, check it appears in the sheet and in `admin.html`, then set it to **Annulée**.

If you had an older **Gestion** tab, the script finds its columns by name (`N° commande`/`Commande`, `Statut`/`Etat`, `Note`…) and adds any missing ones.

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
- **Moving to a custom domain** (recommended, see below): update `SITE_URL` in the `.gs`, the canonical/OG URLs in every page, `sitemap.xml` and `robots.txt`.

## 5. Security — what is covered and what is not

Covered:
- Orders are **re-priced on the server** from the published catalog; a total edited in the browser is replaced and flagged ("⚠ Total recalculé") in the Gestion note and the e-mail. Unknown products/sizes are refused. The cart also corrects stale or edited prices when it loads.
- Every field is validated and length-capped; text that starts with `= + - @` is stored as plain text, so no one can plant a formula (e.g. `=IMPORTDATA(...)` that would leak customer data) in the sheet. The admin CSV export is protected the same way.
- Rate limits: 5 orders/hour per phone number, 40 orders/10 min overall; a double tap or network retry is stored once.
- Admin: key compared in constant time; 5 wrong keys → 15 min lock; while locked, an already signed-in session keeps working (so nobody can lock you out). The browser stores a **signed, expiring session token** (12 h, or 30 days with "Rester connecté"), never the key. Running `generateAdminKey` again signs every device out.
- Content-Security-Policy on every page (scripts only from the site itself; orders only to Google Apps Script), no inline scripts except one hashed pre-paint snippet, strict referrer policy. The admin page refuses to run inside a frame (clickjacking).

Limits to know about:
- Apps Script can't see visitors' IP addresses, so rate limits are per phone number and global, not per visitor.
- GitHub Pages can't send HTTP headers, so `frame-ancestors`/HSTS etc. only apply if you move to Netlify or Cloudflare Pages, which read the `_headers` file included here.
- On `slahmaid.github.io`, every GitHub Pages site of that account shares one browser origin (and therefore the admin session storage). A custom domain (e.g. a `.ma` domain) gives the shop its own origin; recommended before scaling up.
