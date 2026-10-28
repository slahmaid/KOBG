/* Knockout Boxing Gear — commandes (paiement à la livraison) + API du panneau admin (admin.html).
   Google Apps Script web app, rattaché au Google Sheet des commandes. Mise en place : _ops/README.md.

   Propriétés du script (Paramètres du projet › Propriétés du script) :
     ADMIN_KEY       clé du panneau admin, 12 caractères minimum (ou lancez generateAdminKey() une fois)
     NOTIFY_EMAIL    facultatif : adresse qui reçoit un e-mail à chaque nouvelle commande
     SPREADSHEET_ID  facultatif : seulement si le script n'est PAS ouvert depuis le Google Sheet

   Security model (the site is static, so everything that matters is enforced here):
   - prices, discount and delivery are RE-COMPUTED from the catalog the site publishes
     (assets/search-index.js); a total edited in the browser is never stored as such;
   - every field is validated, trimmed, length-capped and neutralised before it reaches the
     sheet (no =, +, -, @ formulas, no control characters);
   - rate limits: 5 orders / hour / phone number, 40 orders / 10 min overall;
   - admin: key compared in constant time, 15 min lock after 5 wrong keys, the browser only
     ever keeps a signed, expiring session token (rotating ADMIN_KEY revokes every session);
   - customer accounts (optional, onglet « Clients ») : salted PBKDF2 passwords, hashed expiring
     session tokens, lock after 5 wrong passwords, password reset by e-mail (see "customer accounts"). */

// ===================== CONFIG =====================
const VERSION = '2026-10-28';
const SITE_URL = 'https://slahmaid.github.io/KOBG/';            // where the shop is published
const CATALOG_URL = SITE_URL + 'assets/search-index.js';         // source of truth for prices and sizes
// keep these three in sync with the CONFIG block of script.js
const PROMO_CODES = { KOBG26: 10 };                              // code -> % off the subtotal
const SHIPPING_FEE = 25;
const FREE_SHIPPING_FROM = 2000;                                 // on the subtotal before the discount
// ==================================================

const TZ = 'Africa/Casablanca';
const SHEET_ORDERS = 'Commandes';
const SHEET_ADMIN = 'Gestion';
const STATUSES = ['Nouvelle', 'Confirmée', 'Expédiée', 'Livrée', 'Annulée', 'Retournée'];
const ORDER_HEAD = ['Reçue le', 'N° commande', 'Nom', 'Téléphone', 'Ville', 'Articles', 'Taille', 'Couleur', 'Nb articles',
  'Sous-total (DH)', 'Code promo', 'Remise (%)', 'Livraison (DH)', 'Total (DH)'];
// "Gestion" columns are found by header name (accents/case ignored), so an older layout keeps working
const ADMIN_COLS = {
  id: ['N° commande', 'n commande', 'n de commande', 'numero de commande', 'commande', 'id'],
  statut: ['Statut', 'status', 'etat'],
  note: ['Note interne', 'note', 'notes'],
  maj: ['Mis à jour le', 'mise a jour', 'maj', 'modifie le'],
  hist: ['Historique', 'history'],
};
const LIMITS = {
  body: 32 * 1024, lines: 30, qty: 99, units: 200,
  perPhone: 5, perPhoneSec: 3600, global: 40, globalSec: 600,
  adminKeyMin: 12, adminFails: 5, adminLockSec: 900,
  sessionShort: 12 * 3600, sessionLong: 30 * 86400,
  note: 1000, hist: 60,
};
const ID_RE = /^KOBG-\d{6}-[A-Z0-9]{4}$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------- entry points ----------
function doGet() {
  return ok_({ service: 'kobg-orders' });
}

function doPost(e) {
  const raw = (e && e.postData && e.postData.contents) || '';
  if (!raw || raw.length > LIMITS.body) return fail_('bad_request');
  let b;
  try { b = JSON.parse(raw); } catch (err) { return fail_('bad_request'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return fail_('bad_request');
  const ctx = { authed: false };
  try {
    if (b.action == null) return order_(b);
    return ACCOUNT_ACTIONS.indexOf(String(b.action)) >= 0 ? account_(b) : admin_(b, ctx);
  } catch (err) {
    console.error(err && err.stack || err);
    // only a signed-in admin gets details; shoppers get a generic error
    return ctx.authed ? fail_('server', { detail: String(err && err.message || err).slice(0, 200) }) : fail_('server');
  }
}

// ---------- orders (shop) ----------
function order_(b) {
  const f = { nom: clean_(b.nom, 80), ville: clean_(b.ville, 60), tel: phone_(b.telephone) };
  if (f.nom.length < 3 || !/\p{L}.*\p{L}/u.test(f.nom)) return fail_('bad_field', { field: 'nom' });
  if (f.ville.length < 2 || !/\p{L}/u.test(f.ville)) return fail_('bad_field', { field: 'ville' });
  if (!f.tel) return fail_('bad_field', { field: 'telephone' });

  const cat = catalog_();
  const priced = lines_(b.items, cat);
  if (priced.error) return fail_(priced.error, priced.data);
  const lines = priced.lines;

  const t = totals_(lines.reduce((n, l) => n + l.lineTotal, 0), b.promoCode);
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const warn = [];
  if (!cat) warn.push('⚠ Prix NON vérifiés (catalogue du site injoignable) : contrôlez le total avant d’expédier.');
  if (Number(b.total) !== t.total) warn.push('⚠ Total recalculé par le serveur : ' + t.total + ' DH (le navigateur annonçait ' + clean_(b.total, 12) + ' DH).');
  if (b.promoCode && !t.pct) warn.push('Code promo refusé : ' + clean_(b.promoCode, 20) + '.');

  // signed in (compte.html)? the order is linked to the account; a stale token simply means a guest order
  const acct = b.session ? session_(b.session) : null;
  const acctNote = acct ? ['Client connecté : ' + acct.user.email + (acct.user.adresse ? ' · adresse enregistrée : ' + acct.user.adresse
    + (acct.user.ville ? ', ' + acct.user.ville : '') : '')] : [];

  let id = ID_RE.test(String(b.orderId || '')) ? String(b.orderId) : '';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('busy');
  let reply;
  try {
    const ss = book_();
    const sh = ordersSheet_(ss);
    const ids = columnB_(sh);
    const dupAt = id ? ids.indexOf(id) : -1;
    if (dupAt >= 0) {
      const v = sh.getRange(dupAt + 2, 1, 1, ORDER_HEAD.length).getValues()[0];
      if (tel_(v[3]) === f.tel) {         // same order sent twice (double tap, network retry): don't store it again
        return ok_({ duplicate: true, orderId: id, subtotal: num_(v[9]), promoCode: str_(v[10]), discountPct: num_(v[11]),
          discount: Math.round(num_(v[9]) * num_(v[11]) / 100), delivery: num_(v[12]), total: num_(v[13]) });
      }
      id = '';                            // someone else's number: give this order its own
    }
    if (!id) do { id = newId_(); } while (ids.indexOf(id) >= 0);

    const cache = CacheService.getScriptCache();
    const kTel = 'rl:t:' + f.tel, nTel = Number(cache.get(kTel) || 0);
    if (nTel >= LIMITS.perPhone) return fail_('too_many');
    const nAll = Number(cache.get('rl:all') || 0);
    if (nAll >= LIMITS.global) return fail_('busy');

    const now = new Date();
    const recu = fmt_(now, 'dd/MM/yyyy HH:mm');
    const row = [
      now, id, cell_(f.nom), "'" + f.tel, cell_(f.ville),
      listCell_(lines.map((l) => l.name + (l.qty > 1 ? ' x' + l.qty : ''))),
      listCell_(lines.map((l) => l.size)),
      listCell_(lines.map((l) => l.colour)),
      units, t.sub, t.pct ? t.code : '', t.pct, t.delivery, t.total,
    ];
    if (acct) {
      const col = acctCol_(sh, true);
      while (row.length < col) row.push('');
      row[col - 1] = "'" + acct.user.id;
    }
    sh.appendRow(row);
    const g = gestion_(ss);
    const hist = [{ at: recu, to: 'Nouvelle', by: 'site' }].concat(warn.map((w) => ({ at: recu, note: w, by: 'serveur' })));
    writeGestion_(g, { id: id, statut: 'Nouvelle', note: warn.concat(acctNote).join('\n'), maj: recu, hist: hist });

    cache.put(kTel, String(nTel + 1), LIMITS.perPhoneSec);
    cache.put('rl:all', String(nAll + 1), LIMITS.globalSec);
    reply = { orderId: id, items: lines, subtotal: t.sub, promoCode: t.pct ? t.code : '', discountPct: t.pct,
      discount: t.discount, delivery: t.delivery, total: t.total, adjusted: warn.length > 0, linked: !!acct };
  } finally {
    lock.releaseLock();
  }
  notify_(reply.orderId, f, lines, t, warn.concat(acctNote));
  return ok_(reply);
}

// items from the browser -> priced lines. Only id + qty are trusted; name, colour, size and price
// come from the catalog. The size is the part of the id after "--" (see addToCart in script.js).
function lines_(items, cat) {
  if (!Array.isArray(items) || !items.length || items.length > LIMITS.lines) return { error: 'bad_order' };
  const out = [], byId = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i] && typeof items[i] === 'object' ? items[i] : {};
    const id = String(it.id || '');
    const qty = Number(it.qty);
    if (id.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(id)) return { error: 'bad_item', data: { id: id.slice(0, 160) } };
    if (!Number.isInteger(qty) || qty < 1 || qty > LIMITS.qty) return { error: 'bad_order' };
    let line;
    if (cat) {
      const parts = id.split('--');
      const p = has(cat, parts[0]) ? cat[parts[0]] : null;
      if (!p) return { error: 'bad_item', data: { id: id } };
      const sizes = p[1];
      let size = '';
      if (sizes.length) {
        size = sizes.filter((s) => slug_(s) === (parts[1] || ''))[0] || '';
        if (!size) return { error: 'bad_item', data: { id: id } };
      } else if (parts[1]) return { error: 'bad_item', data: { id: id } };
      line = { id: id, name: p[2], colour: p[3], size: size, qty: qty, unitPrice: p[0] };
    } else {                                // catalog unreachable: keep the order, flag it for a manual check
      const price = Number(it.unitPrice);
      if (!Number.isInteger(price) || price < 1 || price > 100000) return { error: 'bad_order' };
      line = { id: id, name: listItem_(it.name, 120) || id, colour: listItem_(it.colour, 40), size: listItem_(it.size, 20), qty: qty, unitPrice: price };
    }
    if (has(byId, id)) { byId[id].qty = Math.min(LIMITS.qty, byId[id].qty + qty); continue; }
    byId[id] = line;
    out.push(line);
  }
  let units = 0;
  out.forEach((l) => { l.lineTotal = l.qty * l.unitPrice; units += l.qty; });
  if (units > LIMITS.units) return { error: 'bad_order' };
  return { lines: out };
}

// same rule as calcTotals() in script.js
function totals_(sub, promoCode) {
  const code = String(promoCode || '').trim().toUpperCase().replace(/\s+/g, '');
  const pct = code && has(PROMO_CODES, code) ? Number(PROMO_CODES[code]) || 0 : 0;
  const discount = Math.round(sub * pct / 100);
  const delivery = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return { code: code, sub: sub, pct: pct, discount: discount, delivery: delivery, total: sub - discount + delivery };
}

// ---------- catalog (prices the site publishes) ----------
// { id: [price, [sizes], name, colour] }, cached 10 min; the last good copy is kept in case the site is unreachable
function catalog_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('catalog');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* refetch */ } }
  const props = PropertiesService.getScriptProperties();
  let cat = null;
  try {
    const res = UrlFetchApp.fetch(CATALOG_URL + '?v=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() === 200) cat = parseCatalog_(res.getContentText('UTF-8'));
  } catch (e) { cat = null; }
  if (cat) {
    const s = JSON.stringify(cat);
    try { cache.put('catalog', s, 600); } catch (e) { /* too big for the cache: fetched each time */ }
    try { if (props.getProperty('CATALOG_LAST_GOOD') !== s) props.setProperty('CATALOG_LAST_GOOD', s); } catch (e) { /* > 9 KB */ }
    return cat;
  }
  const last = props.getProperty('CATALOG_LAST_GOOD');
  if (last) { try { return JSON.parse(last); } catch (e) { /* corrupt */ } }
  return null;
}
// assets/search-index.js is "window.KOBG_SEARCH = [ {...}, ... ];"
function parseCatalog_(text) {
  const at = String(text || '').indexOf('KOBG_SEARCH');
  const start = text.indexOf('[', at), end = text.lastIndexOf(']');
  if (at < 0 || start < 0 || end < start) return null;
  let list;
  try { list = JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
  if (!Array.isArray(list)) return null;
  const cat = {};
  list.forEach((p) => {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) return;
    const price = Number(p.price);
    if (!Number.isInteger(price) || price < 1 || price > 100000) return;
    cat[p.id] = [price, Array.isArray(p.sizes) ? p.sizes.map(String) : [], String(p.name || p.id), String(p.colour || '')];
  });
  return Object.keys(cat).length ? cat : null;
}

// ---------- admin ----------
function admin_(b, ctx) {
  const action = String(b.action);
  if (['auth', 'list', 'stats', 'update'].indexOf(action) < 0) return fail_('bad_action');
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('ADMIN_KEY') || '';
  if (!key) return fail_('no_admin_key', { reason: 'missing', min: LIMITS.adminKeyMin });
  if (key.length < LIMITS.adminKeyMin) return fail_('no_admin_key', { reason: 'short', min: LIMITS.adminKeyMin });

  const cache = CacheService.getScriptCache();
  const given = String(b.key || '').slice(0, 300);
  const auth = checkKey_(given, key);
  // while locked only an already signed session gets through: someone spamming wrong keys
  // can't lock the owner out, and the key itself can't be tried
  const until = Number(cache.get('adm:lock') || 0);
  if (until > Date.now() && auth !== 'token') return fail_('locked', { retryIn: Math.ceil((until - Date.now()) / 1000) });
  if (auth === 'expired') return fail_('expired');
  if (!auth) {
    const fails = Number(cache.get('adm:fails') || 0) + 1;
    if (fails >= LIMITS.adminFails) {
      cache.put('adm:lock', String(Date.now() + LIMITS.adminLockSec * 1000), LIMITS.adminLockSec);
      cache.remove('adm:fails');
      return fail_('locked', { retryIn: LIMITS.adminLockSec });
    }
    cache.put('adm:fails', String(fails), LIMITS.adminLockSec);
    return fail_('bad_key', { left: LIMITS.adminFails - fails });
  }
  if (auth === 'key') cache.remove('adm:fails');
  ctx.authed = true;

  if (action === 'auth') {
    // the browser keeps this token, never the key itself
    return ok_({ token: auth === 'key' ? token_(key, b.remember ? LIMITS.sessionLong : LIMITS.sessionShort) : given });
  }
  if (action === 'update') return update_(b);
  const orders = readOrders_();
  const now = Date.now();
  if (action === 'stats') {
    const period = ['today', '7d', '30d', 'all'].indexOf(b.period) >= 0 ? b.period : 'today';
    return ok_({ now: now, today: fmt_(new Date(now), 'yyyy-MM-dd'), period: period, stats: stats_(orders, period, now) });
  }
  return ok_({ now: now, today: fmt_(new Date(now), 'yyyy-MM-dd'), orders: orders });
}

// 'key' (the admin key), 'token' (valid session token), 'expired', or false
function checkKey_(given, key) {
  if (!given) return false;
  const m = /^v1\.(\d{10})\.([A-Za-z0-9_-]{20,100}=*)$/.exec(given);
  if (m) {
    if (!safeEq_(m[2], sign_(key, m[1]))) return false;
    return Number(m[1]) * 1000 > Date.now() ? 'token' : 'expired';
  }
  return safeEq_(given, key) ? 'key' : false;
}
function token_(key, ttlSec) {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSec);
  return 'v1.' + exp + '.' + sign_(key, exp);
}
function sign_(key, exp) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('kobg-admin-session:' + exp, key));
}
// constant-time: compare SHA-256 digests byte by byte, whatever the inputs' lengths
function safeEq_(a, b) {
  const da = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(a), Utilities.Charset.UTF_8);
  const db = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(b), Utilities.Charset.UTF_8);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

function update_(b) {
  const id = String(b.id || '').trim();
  const hasStatus = b.status != null, hasNote = b.note != null;
  if (!hasStatus && !hasNote) return fail_('bad_action');
  if (hasStatus && STATUSES.indexOf(String(b.status)) < 0) return fail_('bad_status');
  if (!id || id.length > 40) return fail_('not_found');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('busy');
  try {
    const ss = book_();
    const sh = ordersSheet_(ss);
    const at = columnB_(sh).indexOf(id);
    if (at < 0) return fail_('not_found');
    const g = gestion_(ss);
    const r = g.byId[id] || { id: id, statut: 'Nouvelle', note: '', maj: '', hist: [] };
    const when = fmt_(new Date(), 'dd/MM/yyyy HH:mm');
    if (hasStatus && r.statut !== String(b.status)) {
      r.hist.push({ at: when, from: r.statut, to: String(b.status), by: 'admin' });
      r.statut = String(b.status);
    }
    if (hasNote) r.note = clean_(b.note, LIMITS.note, true);
    r.maj = when;
    writeGestion_(g, r);
    const v = sh.getRange(at + 2, 1, 1, ORDER_HEAD.length).getValues()[0];
    return ok_({ order: toOrder_(v, at + 2, r) });
  } finally {
    lock.releaseLock();
  }
}

function readOrders_() {
  const ss = book_();
  const sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(ORDER_HEAD.length, sh.getLastColumn());
  const g = gestion_(ss);
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues()
    .map((v, i) => toOrder_(v, i + 2, g.byId[str_(v[1])]))
    .filter(Boolean);
}

// one sheet row (+ its "Gestion" line) -> the order object admin.js renders
function toOrder_(v, row, gest) {
  const id = str_(v[1]);
  if (!id) return null;
  const d = asDate_(v[0]);
  return {
    row: row, id: id, ts: d ? d.getTime() : 0,
    recu: d ? fmt_(d, 'dd/MM/yyyy HH:mm') : str_(v[0]), day: d ? fmt_(d, 'yyyy-MM-dd') : '',
    nom: str_(v[2]), tel: tel_(v[3]), ville: str_(v[4]), articles: list_(v[5]), taille: list_(v[6]), couleur: list_(v[7]),
    nb: num_(v[8]), sousTotal: num_(v[9]), promo: str_(v[10]), remise: num_(v[11]), livraison: num_(v[12]), total: num_(v[13]),
    statut: gest && STATUSES.indexOf(gest.statut) >= 0 ? gest.statut : 'Nouvelle',
    note: gest ? gest.note : '', maj: gest ? gest.maj : '', hist: gest ? gest.hist : [],
  };
}

// same math as stats() in assets/admin.js
function stats_(orders, period, now) {
  const list = orders.filter((o) => period === 'all' ? true
    : period === 'today' ? o.day === fmt_(new Date(now), 'yyyy-MM-dd')
      : o.ts >= now - (period === '7d' ? 7 : 30) * 864e5);
  const by = {};
  STATUSES.forEach((s) => { by[s] = 0; });
  let due = 0, paid = 0;
  list.forEach((o) => {
    by[o.statut] = (by[o.statut] || 0) + 1;
    if (o.statut === 'Livrée') paid += o.total;
    else if (o.statut !== 'Annulée' && o.statut !== 'Retournée') due += o.total;
  });
  return { commandes: list.length, aConfirmer: by['Nouvelle'], enCours: by['Confirmée'] + by['Expédiée'], livrees: by['Livrée'],
    caAEncaisser: due, caEncaisse: paid, by: by };
}

// ---------- customer accounts (compte.html) ----------
// Accounts are optional: guests still order with name / city / phone only.
// - passwords: PBKDF2-HMAC-SHA256 with a random 128-bit salt per account (ACCT.iter rounds,
//   stored per account so the count can be raised later: older hashes are upgraded at the next login);
//   never stored, logged or e-mailed in clear;
// - sessions: random 256-bit tokens; the server only keeps their SHA-256 ("ses:<hash>" script
//   properties) with an expiry, so a leaked Properties dump can't be replayed; max ACCT.maxSessions per account;
// - login: one generic error ('bad_login') whether the e-mail exists or not (an unknown e-mail costs
//   the same hashing time), 15 min lock after 5 wrong passwords for that e-mail, global brake on failures;
// - password reset: single-use link valid 1 h, sent with MailApp; the request always answers the same.
const SHEET_CLIENTS = 'Clients';
const CLIENT_HEAD = ['ID client', 'E-mail', 'Nom', 'Téléphone', 'Adresse', 'Ville', 'Créé le', 'Mis à jour le',
  'Dernière connexion', 'Sel', 'Empreinte', 'Itérations'];
const C = { id: 0, email: 1, nom: 2, tel: 3, adresse: 4, ville: 5, cree: 6, maj: 7, vu: 8, sel: 9, hash: 10, iter: 11 };
const ACCOUNT_ACTIONS = ['register', 'login', 'logout', 'me', 'update_profile', 'change_password', 'my_orders',
  'reset_request', 'reset_confirm'];
const ACCT = {
  iter: 5000, pwMin: 8, pwMax: 128,
  session: 30 * 86400, sessionShort: 86400, reset: 3600, maxSessions: 10,
  loginFails: 5, lockSec: 900, globalFails: 300, globalFailSec: 900,
  resetPerEmail: 3, resetSec: 3600, resetGlobal: 40,
  register: 30, registerSec: 3600,
  orders: 50, adresse: 200,
};
const ORDER_ACCT_COL = 'Compte client';      // extra column of "Commandes": the account that placed the order
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const TOKEN_RE = /^k1\.[A-Za-z0-9_-]{43}$/;

function account_(b) {
  const a = String(b.action);
  if (a === 'register') return register_(b);
  if (a === 'login') return login_(b);
  if (a === 'reset_request') return resetRequest_(b);
  if (a === 'reset_confirm') return resetConfirm_(b);
  if (a === 'logout') {                     // { all: true } = every device of this account
    const h = tokenHash_(b.session);
    if (!h) return ok_({});
    const cur = b.all === true ? session_(b.session) : null;
    if (cur) dropSessions_(cur.user.id, '');
    PropertiesService.getScriptProperties().deleteProperty('ses:' + h);
    return ok_({});
  }
  const s = session_(b.session);
  if (!s) return fail_('auth');
  if (a === 'me') return ok_({ profile: profile_(s.user) });
  if (a === 'update_profile') return updateProfile_(s, b);
  if (a === 'change_password') return changePassword_(s, b);
  if (a === 'my_orders') return ok_({ orders: myOrders_(s.user.id) });
  return fail_('bad_action');
}

function register_(b) {
  const email = email_(b.email);
  const f = { nom: clean_(b.nom, 80), tel: phone_(b.telephone), adresse: clean_(b.adresse, ACCT.adresse), ville: clean_(b.ville, 60) };
  if (!email) return fail_('bad_field', { field: 'email' });
  if (f.nom.length < 3 || !/\p{L}.*\p{L}/u.test(f.nom)) return fail_('bad_field', { field: 'nom' });
  if (!f.tel) return fail_('bad_field', { field: 'telephone' });
  if (f.ville && (f.ville.length < 2 || !/\p{L}/u.test(f.ville))) return fail_('bad_field', { field: 'ville' });
  const weak = weak_(b.password, email);
  if (weak) return fail_(weak, { field: 'password', min: ACCT.pwMin });

  const cache = CacheService.getScriptCache();
  const nReg = Number(cache.get('ac:reg') || 0);
  if (nReg >= ACCT.register) return fail_('busy');
  const salt = salt_();
  const hash = pbkdf2_(String(b.password), salt, ACCT.iter);     // before the lock: it is the slow part
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('busy');
  let user;
  try {
    const sh = clientsSheet_(book_());
    const all = users_(sh);
    if (all.some((u) => u.email === email)) return fail_('email_taken');
    const ids = all.map((u) => u.id);
    let id;
    do { id = 'C-' + rand_().replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase(); } while (ids.indexOf(id) >= 0);
    const now = new Date();
    user = { id: id, email: email, nom: f.nom, tel: f.tel, adresse: f.adresse, ville: f.ville, cree: now, maj: now, vu: now,
      sel: salt, hash: hash, iter: ACCT.iter, row: Math.max(1, sh.getLastRow()) + 1 };
    writeUser_(sh, user);
    cache.put('ac:reg', String(nReg + 1), ACCT.registerSec);
  } finally {
    lock.releaseLock();
  }
  const s = newSession_(user.id, b.remember !== false);
  return ok_({ session: s.token, exp: s.exp, profile: profile_(user) });
}

function login_(b) {
  const email = email_(b.email);
  const pw = typeof b.password === 'string' ? b.password : '';
  if (!email || !pw || pw.length > ACCT.pwMax) return fail_('bad_login');
  const cache = CacheService.getScriptCache();
  const k = 'ac:f:' + shortHash_(email);
  const until = Number(cache.get(k + ':lock') || 0);
  if (until > Date.now()) return fail_('locked', { retryIn: Math.ceil((until - Date.now()) / 1000) });
  const nAll = Number(cache.get('ac:fails') || 0);
  if (nAll >= ACCT.globalFails) return fail_('busy');

  const sh = clientsSheet_(book_());
  const user = users_(sh).filter((u) => u.email === email)[0] || null;
  // unknown e-mail: same work, same answer
  const good = user ? safeEq_(pbkdf2_(pw, user.sel, user.iter), user.hash)
    : (pbkdf2_(pw, '00000000000000000000000000000000', ACCT.iter), false);
  if (!good) return loginFail_(cache, k, nAll);
  cache.remove(k);
  const now = new Date();
  user.vu = now;
  if (user.iter < ACCT.iter) { user.sel = salt_(); user.hash = pbkdf2_(pw, user.sel, ACCT.iter); user.iter = ACCT.iter; }
  const lock = LockService.getScriptLock();
  if (lock.tryLock(10000)) {
    try { const u = refind_(sh, user); if (u) writeUser_(sh, u); } finally { lock.releaseLock(); }
  }
  const s = newSession_(user.id, b.remember !== false);
  return ok_({ session: s.token, exp: s.exp, profile: profile_(user) });
}
function loginFail_(cache, k, nAll) {
  cache.put('ac:fails', String(nAll + 1), ACCT.globalFailSec);
  const n = Number(cache.get(k) || 0) + 1;
  if (n >= ACCT.loginFails) {
    cache.put(k + ':lock', String(Date.now() + ACCT.lockSec * 1000), ACCT.lockSec);
    cache.remove(k);
    return fail_('locked', { retryIn: ACCT.lockSec });
  }
  cache.put(k, String(n), ACCT.lockSec);
  return fail_('bad_login');
}

function updateProfile_(s, b) {
  const f = {
    nom: b.nom != null ? clean_(b.nom, 80) : s.user.nom,
    tel: b.telephone != null ? phone_(b.telephone) : s.user.tel,
    adresse: b.adresse != null ? clean_(b.adresse, ACCT.adresse) : s.user.adresse,
    ville: b.ville != null ? clean_(b.ville, 60) : s.user.ville,
  };
  if (f.nom.length < 3 || !/\p{L}.*\p{L}/u.test(f.nom)) return fail_('bad_field', { field: 'nom' });
  if (!f.tel) return fail_('bad_field', { field: 'telephone' });
  if (f.ville && (f.ville.length < 2 || !/\p{L}/u.test(f.ville))) return fail_('bad_field', { field: 'ville' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('busy');
  try {
    const sh = clientsSheet_(book_());
    const u = refind_(sh, s.user);
    if (!u) return fail_('auth');
    Object.assign(u, f, { maj: new Date() });
    writeUser_(sh, u);
    return ok_({ profile: profile_(u) });
  } finally {
    lock.releaseLock();
  }
}

function changePassword_(s, b) {
  const cur = typeof b.current === 'string' ? b.current : '';
  const cache = CacheService.getScriptCache();
  const k = 'ac:f:' + shortHash_(s.user.email);
  const until = Number(cache.get(k + ':lock') || 0);
  if (until > Date.now()) return fail_('locked', { retryIn: Math.ceil((until - Date.now()) / 1000) });
  if (!cur || cur.length > ACCT.pwMax || !safeEq_(pbkdf2_(cur, s.user.sel, s.user.iter), s.user.hash)) {
    const r = loginFail_(cache, k, Number(cache.get('ac:fails') || 0));
    return JSON.parse(r.getContent()).error === 'locked' ? r : fail_('bad_password', { field: 'current' });
  }
  const weak = weak_(b.password, s.user.email);
  if (weak) return fail_(weak, { field: 'password', min: ACCT.pwMin });
  const r = setPassword_(s.user, String(b.password));
  if (r) return r;
  dropSessions_(s.user.id, s.hash);        // signs out every other device
  return ok_({});
}

function resetRequest_(b) {
  const email = email_(b.email);
  if (!email) return fail_('bad_field', { field: 'email' });
  if (MailApp.getRemainingDailyQuota() < 1) return fail_('mail_unavailable');
  const cache = CacheService.getScriptCache();
  const nAll = Number(cache.get('ac:rst') || 0);
  if (nAll >= ACCT.resetGlobal) return fail_('busy');
  const k = 'ac:r:' + shortHash_(email);
  const n = Number(cache.get(k) || 0);
  if (n >= ACCT.resetPerEmail) return ok_({ sent: true });    // same answer: says nothing about the account
  cache.put(k, String(n + 1), ACCT.resetSec);
  cache.put('ac:rst', String(nAll + 1), ACCT.resetSec);
  const user = users_(clientsSheet_(book_())).filter((u) => u.email === email)[0];
  if (!user) return ok_({ sent: true });
  const props = PropertiesService.getScriptProperties();
  sweep_(props, (k2, v) => k2.indexOf('rst:') === 0 && v.u === user.id);     // only the newest link works
  const token = 'k1.' + rand_();
  props.setProperty('rst:' + sha_(token), JSON.stringify({ u: user.id, exp: Date.now() + ACCT.reset * 1000 }));
  const link = SITE_URL + 'compte.html#reset=' + token;
  try {
    MailApp.sendEmail({
      to: user.email,
      name: 'Knockout Boxing Gear',
      subject: 'Réinitialisation de votre mot de passe · Knockout Boxing Gear',
      body: [
        'Bonjour ' + user.nom + ',', '',
        'Vous avez demandé à réinitialiser le mot de passe de votre compte Knockout Boxing Gear.',
        'Ouvrez ce lien pour choisir un nouveau mot de passe (valable 1 heure, une seule fois) :', '',
        link, '',
        'Vous n’êtes pas à l’origine de cette demande ? Ignorez cet e-mail : votre mot de passe reste inchangé.', '',
        'Knockout Boxing Gear · ' + SITE_URL,
      ].join('\n'),
    });
  } catch (e) {
    console.warn('reset e-mail not sent: ' + e);
    return fail_('mail_unavailable');
  }
  return ok_({ sent: true });
}

function resetConfirm_(b) {
  const h = tokenHash_(b.token);
  const props = PropertiesService.getScriptProperties();
  const rec = h ? parse_(props.getProperty('rst:' + h)) : null;
  if (!rec || !(rec.exp > Date.now())) { if (h) props.deleteProperty('rst:' + h); return fail_('bad_reset'); }
  const sh = clientsSheet_(book_());
  const user = users_(sh).filter((u) => u.id === rec.u)[0];
  if (!user) { props.deleteProperty('rst:' + h); return fail_('bad_reset'); }
  const weak = weak_(b.password, user.email);
  if (weak) return fail_(weak, { field: 'password', min: ACCT.pwMin });
  props.deleteProperty('rst:' + h);                                    // single use
  const r = setPassword_(user, String(b.password));
  if (r) return r;
  dropSessions_(user.id, null);
  sweep_(props, (k, v) => k.indexOf('rst:') === 0 && v.u === user.id);
  CacheService.getScriptCache().remove('ac:f:' + shortHash_(user.email) + ':lock');
  const s = newSession_(user.id, b.remember !== false);
  return ok_({ session: s.token, exp: s.exp, profile: profile_(user) });
}

function setPassword_(user, pw) {
  const salt = salt_();
  const hash = pbkdf2_(pw, salt, ACCT.iter);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('busy');
  try {
    const sh = clientsSheet_(book_());
    const u = refind_(sh, user);
    if (!u) return fail_('auth');
    Object.assign(u, { sel: salt, hash: hash, iter: ACCT.iter, maj: new Date() });
    writeUser_(sh, u);
    Object.assign(user, u);
  } finally {
    lock.releaseLock();
  }
  return null;
}

// orders placed while signed in, newest first, with the status the team set in "Gestion"
function myOrders_(uid) {
  const ss = book_();
  const sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return [];
  const col = acctCol_(sh, false);
  if (!col) return [];
  const g = gestion_(ss);
  const out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, col).getValues().forEach((v) => {
    if (str_(v[col - 1]) !== uid) return;
    const id = str_(v[1]);
    if (!id) return;
    const gest = g.byId[id];
    const d = asDate_(v[0]);
    const names = list_(v[5]).split(' / '), sizes = list_(v[6]).split(' / '), colours = list_(v[7]).split(' / ');
    out.push({
      id: id, ts: d ? d.getTime() : 0, recu: d ? fmt_(d, 'dd/MM/yyyy HH:mm') : str_(v[0]),
      items: names.map((n, i) => {
        const m = /^(.*) x(\d+)$/.exec(n);
        return { name: m ? m[1] : n, qty: m ? Number(m[2]) : 1, size: sizes[i] || '', colour: colours[i] || '' };
      }),
      nb: num_(v[8]), sousTotal: num_(v[9]), promo: str_(v[10]), remise: num_(v[11]), livraison: num_(v[12]), total: num_(v[13]),
      statut: gest && STATUSES.indexOf(gest.statut) >= 0 ? gest.statut : 'Nouvelle',
      // status changes only: the team's internal notes never leave the sheet
      suivi: (gest ? gest.hist : []).filter((h) => h && h.to && STATUSES.indexOf(h.to) >= 0).map((h) => ({ at: str_(h.at), to: h.to })),
    });
  });
  out.sort((x, y) => y.ts - x.ts);
  return out.slice(0, ACCT.orders);
}

// ---- sessions ----
function newSession_(uid, remember) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const mine = [];
  sweep_(props, (k, v) => {
    if (k.indexOf('ses:') !== 0 && k.indexOf('rst:') !== 0) return false;
    if (!(v.exp > now)) return true;                                  // expired: cleaned up
    if (k.indexOf('ses:') === 0 && v.u === uid) mine.push({ k: k, exp: v.exp });
    return false;
  });
  mine.sort((x, y) => x.exp - y.exp);
  while (mine.length >= ACCT.maxSessions) props.deleteProperty(mine.shift().k);   // oldest device signed out
  const token = 'k1.' + rand_();
  const exp = now + (remember ? ACCT.session : ACCT.sessionShort) * 1000;
  props.setProperty('ses:' + sha_(token), JSON.stringify({ u: uid, exp: exp }));
  return { token: token, exp: exp };
}
// a valid session -> { hash, user } (the user re-read from the sheet), else null
function session_(token) {
  const h = tokenHash_(token);
  if (!h) return null;
  const props = PropertiesService.getScriptProperties();
  const rec = parse_(props.getProperty('ses:' + h));
  if (!rec) return null;
  if (!(rec.exp > Date.now())) { props.deleteProperty('ses:' + h); return null; }
  const user = users_(clientsSheet_(book_())).filter((u) => u.id === rec.u)[0];
  if (!user) { props.deleteProperty('ses:' + h); return null; }      // account deleted from the sheet
  return { hash: h, user: user };
}
function dropSessions_(uid, keepHash) {
  sweep_(PropertiesService.getScriptProperties(), (k, v) => k.indexOf('ses:') === 0 && v.u === uid && k !== 'ses:' + keepHash);
}
// deletes the session/reset properties for which test(key, value) is true
function sweep_(props, test) {
  const all = props.getProperties();
  Object.keys(all).forEach((k) => {
    if (k.indexOf('ses:') !== 0 && k.indexOf('rst:') !== 0) return;
    const v = parse_(all[k]);
    if (!v || test(k, v)) props.deleteProperty(k);
  });
}
function tokenHash_(t) { return typeof t === 'string' && TOKEN_RE.test(t) ? sha_(t) : ''; }
function parse_(s) { if (!s) return null; try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }

// ---- "Clients" sheet ----
function clientsSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_CLIENTS);
  if (!sh) sh = ss.insertSheet(SHEET_CLIENTS);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CLIENT_HEAD.length).setValues([CLIENT_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function users_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CLIENT_HEAD.length).getValues().map((v, i) => ({
    row: i + 2, id: str_(v[C.id]), email: str_(v[C.email]).toLowerCase(), nom: str_(v[C.nom]), tel: tel_(v[C.tel]),
    adresse: str_(v[C.adresse]), ville: str_(v[C.ville]), cree: v[C.cree], maj: v[C.maj], vu: v[C.vu],
    sel: str_(v[C.sel]), hash: str_(v[C.hash]), iter: Math.max(1, Math.floor(num_(v[C.iter])) || ACCT.iter),
  })).filter((u) => u.id && u.email);
}
// the row may have moved (someone sorted or deleted rows in the sheet): look the account up again by id
function refind_(sh, user) {
  const u = users_(sh).filter((x) => x.id === user.id)[0];
  if (!u) return null;
  ['nom', 'tel', 'adresse', 'ville', 'vu', 'sel', 'hash', 'iter', 'maj'].forEach((k) => { if (user[k] !== undefined) u[k] = user[k]; });
  return u;
}
function writeUser_(sh, u) {
  sh.getRange(u.row, 1, 1, CLIENT_HEAD.length).setValues([[
    "'" + u.id, cell_(u.email), cell_(u.nom), "'" + u.tel, cell_(u.adresse), cell_(u.ville), u.cree, u.maj, u.vu,
    "'" + u.sel, "'" + u.hash, u.iter,
  ]]);
}
function profile_(u) {
  const d = asDate_(u.cree);
  return { id: u.id, email: u.email, nom: u.nom, telephone: u.tel, adresse: u.adresse, ville: u.ville,
    depuis: d ? fmt_(d, 'dd/MM/yyyy') : '' };
}
// "Commandes" column holding the account id; created after the last used column if missing (create=true)
function acctCol_(sh, create) {
  const width = Math.max(ORDER_HEAD.length, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map((h) => fold_(h));
  const i = head.indexOf(fold_(ORDER_ACCT_COL));
  if (i >= 0) return i + 1;
  if (!create) return 0;
  const col = Math.max(ORDER_HEAD.length, head.filter(String).length ? head.length : 0) + 1;
  sh.getRange(1, col).setValue(ORDER_ACCT_COL).setFontWeight('bold');
  return col;
}

// ---- crypto + validation ----
function email_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : '';
}
function weak_(pw, email) {
  if (typeof pw !== 'string' || pw.length < ACCT.pwMin) return 'weak_password';
  if (pw.length > ACCT.pwMax) return 'bad_field';
  if (pw.toLowerCase() === email || /^(.)\1+$/.test(pw) || /^(?:12345678|123456789|1234567890|password|motdepasse|azertyuiop?|qwertyuiop?)$/i.test(pw)) return 'weak_password';
  return '';
}
// PBKDF2-HMAC-SHA256, one 32-byte block (RFC 8018). Apps Script's HMAC takes and returns signed Byte[].
function pbkdf2_(pw, saltHex, iter) {
  const key = utf8_(pw);
  let u = Utilities.computeHmacSha256Signature(unhex_(saltHex).concat([0, 0, 0, 1]), key);
  const t = u.slice();
  for (let i = 1; i < iter; i++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return hex_(t);
}
function utf8_(s) {
  const e = unescape(encodeURIComponent(String(s)));
  const out = [];
  for (let i = 0; i < e.length; i++) { const c = e.charCodeAt(i); out.push(c > 127 ? c - 256 : c); }
  return out;
}
function hex_(bytes) { return bytes.map((x) => ('0' + (x & 255).toString(16)).slice(-2)).join(''); }
function unhex_(h) {
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) { const c = parseInt(h.substr(i, 2), 16); out.push(c > 127 ? c - 256 : c); }
  return out;
}
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function shortHash_(s) { return sha_('kobg-acct:' + s).slice(0, 32); }
// 32 random bytes from two UUIDv4 (122 random bits each), base64url without padding (43 chars)
function rand_() {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
function salt_() { return sha_(Utilities.getUuid() + Utilities.getUuid()).slice(0, 32); }

// ---------- sheets ----------
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Aucun Google Sheet : ouvrez ce script depuis le tableur (Extensions › Apps Script) ou renseignez SPREADSHEET_ID.');
  return ss;
}
function ordersSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) sh = ss.insertSheet(SHEET_ORDERS);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, ORDER_HEAD.length).setValues([ORDER_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A2:A').setNumberFormat('dd/MM/yyyy HH:mm');
  }
  return sh;
}
function columnB_(sh) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 2, last - 1, 1).getValues().map((r) => str_(r[0]));
}
// "Gestion" sheet: { sh, cols: {id, statut, note, maj, hist} (1-based), byId: { id: {row, statut, note, maj, hist} } }
function gestion_(ss) {
  let sh = ss.getSheetByName(SHEET_ADMIN);
  if (!sh) sh = ss.insertSheet(SHEET_ADMIN);
  const width = Math.max(1, sh.getLastColumn());
  const head = sh.getLastRow() ? sh.getRange(1, 1, 1, width).getValues()[0].map((h) => fold_(h)) : [];
  const cols = {};
  let next = head.filter(String).length ? head.length : 0;
  Object.keys(ADMIN_COLS).forEach((k) => {
    let i = -1;
    ADMIN_COLS[k].some((alias) => { i = head.indexOf(fold_(alias)); return i >= 0; });
    if (i < 0) { i = next++; sh.getRange(1, i + 1).setValue(ADMIN_COLS[k][0]).setFontWeight('bold'); }
    cols[k] = i + 1;
  });
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  const byId = {};
  const last = sh.getLastRow();
  if (last >= 2) {
    const w = Math.max(cols.id, cols.statut, cols.note, cols.maj, cols.hist);
    sh.getRange(2, 1, last - 1, w).getValues().forEach((v, i) => {
      const id = str_(v[cols.id - 1]);
      if (!id) return;
      let hist = [];
      try { hist = JSON.parse(String(v[cols.hist - 1] || '[]')); } catch (e) { hist = []; }
      byId[id] = { row: i + 2, id: id, statut: str_(v[cols.statut - 1]) || 'Nouvelle', note: str_(v[cols.note - 1]),
        maj: v[cols.maj - 1] && asDate_(v[cols.maj - 1]) ? fmt_(asDate_(v[cols.maj - 1]), 'dd/MM/yyyy HH:mm') : str_(v[cols.maj - 1]),
        hist: Array.isArray(hist) ? hist : [] };
    });
  }
  return { sh: sh, cols: cols, byId: byId };
}
function writeGestion_(g, r) {
  if (!r.row) { r.row = Math.max(1, g.sh.getLastRow()) + 1; g.byId[r.id] = r; }
  const hist = r.hist.slice(-LIMITS.hist);
  g.sh.getRange(r.row, g.cols.id).setValue(cell_(r.id));
  g.sh.getRange(r.row, g.cols.statut).setValue(cell_(r.statut));
  g.sh.getRange(r.row, g.cols.note).setValue(cell_(r.note, true));
  g.sh.getRange(r.row, g.cols.maj).setValue(cell_(r.maj));
  g.sh.getRange(r.row, g.cols.hist).setValue(JSON.stringify(hist));
}

// ---------- e-mail ----------
function notify_(id, f, lines, t, warn) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try {
    MailApp.sendEmail({
      to: to,
      name: 'Site Knockout Boxing Gear',
      subject: 'Nouvelle commande ' + id + ' · ' + t.total + ' DH · ' + f.ville,
      body: [
        'Nouvelle commande ' + id, '',
        'Client : ' + f.nom, 'Téléphone : ' + f.tel, 'Ville : ' + f.ville, '',
        lines.map((l) => l.qty + ' × ' + l.name + [l.colour, l.size].filter(String).map((x) => ' · ' + x).join('') + ' — ' + l.lineTotal + ' DH').join('\n'), '',
        'Sous-total : ' + t.sub + ' DH',
        t.pct ? 'Remise ' + t.code + ' (-' + t.pct + ' %) : -' + t.discount + ' DH' : '',
        'Livraison : ' + (t.delivery ? t.delivery + ' DH' : 'offerte'),
        'À encaisser à la livraison : ' + t.total + ' DH',
        warn.length ? '\n' + warn.join('\n') : '', '',
        'Gérer la commande : ' + SITE_URL + 'admin.html',
      ].filter((x) => x !== null).join('\n'),
    });
  } catch (e) {
    console.warn('notification e-mail not sent: ' + e);
  }
}

// ---------- helpers ----------
function ok_(o) { return json_(Object.assign({ ok: true, version: VERSION }, o || {})); }
function fail_(code, o) { return json_(Object.assign({ ok: false, error: code, version: VERSION }, o || {})); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// one-line text from the browser: no control characters, single spaces, capped
function clean_(v, max, multiline) {
  let s = String(v == null ? '' : v).normalize('NFC');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : s.replace(/\s+/g, ' ');
  return s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, '').trim().slice(0, max);
}
// text for the " / "-separated item columns: the separator can't appear inside an item ("Noir/Rouge" stays)
function listItem_(v, max) { return clean_(v, max).replace(/\s+\/\s*|\s*\/\s+/g, '/'); }
// Articles / Taille / Couleur: one entry per line, aligned by position, so empty entries are kept
// (no trim: "M / " is two lines, the second without a size)
function listCell_(parts) {
  const s = parts.join(' / ');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
// a value about to enter the sheet: text starting with = + - @ is stored as text, never run as a formula
function cell_(v, multiline) {
  const s = clean_(v, 5000, multiline);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
// Moroccan mobile -> 0XXXXXXXXX, or '' (same rule as phoneOK() in script.js)
function phone_(v) {
  const d = String(v == null ? '' : v).replace(/[\s.\-()/]/g, '');
  return /^(?:(?:\+|00)?212|0)[67]\d{8}$/.test(d) ? d.replace(/^(?:\+|00)?212/, '0') : '';
}
function tel_(v) {
  const s = str_(v).replace(/^'/, '');
  return /^\d{9}$/.test(s) ? '0' + s : s;          // a number the sheet stored without its leading 0
}
function slug_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function fold_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function str_(v) { return v == null ? '' : String(v).trim(); }
function list_(v) { return v == null ? '' : String(v); }          // keeps the empty last entry of "M / "
function num_(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function fmt_(d, pattern) { return Utilities.formatDate(d, TZ, pattern); }
function asDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  const s = str_(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const p2 = (x) => ('0' + x).slice(-2);
  try { return Utilities.parseDate(p2(m[1]) + '/' + p2(m[2]) + '/' + m[3] + ' ' + p2(m[4]) + ':' + m[5] + ':' + (m[6] || '00'), TZ, 'dd/MM/yyyy HH:mm:ss'); } catch (e) { return null; }
}
function newId_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O, 1/I (same as script.js)
  const hex = Utilities.getUuid().replace(/-/g, '');
  let tail = '';
  for (let i = 0; i < 4; i++) tail += abc[parseInt(hex.substr(i * 2, 2), 16) % 32];
  return 'KOBG-' + fmt_(new Date(), 'yyMMdd') + '-' + tail;
}

// ---------- to run by hand from the Apps Script editor ----------
// Creates the tabs (Commandes, Gestion, Clients) with their headers. Safe to run again.
function setup() {
  const ss = book_();
  acctCol_(ordersSheet_(ss), true);
  gestion_(ss);
  clientsSheet_(ss);
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('ADMIN_KEY') || '';
  console.log('Onglets « ' + SHEET_ORDERS + ' », « ' + SHEET_ADMIN + ' » et « ' + SHEET_CLIENTS + ' » prêts.');
  console.log('E-mails restants aujourd’hui (liens de réinitialisation, notifications) : ' + MailApp.getRemainingDailyQuota());
  console.log(key.length >= LIMITS.adminKeyMin ? 'ADMIN_KEY configurée.' : 'ADMIN_KEY manquante : lancez generateAdminKey().');
  console.log(catalog_() ? 'Catalogue du site lu : ' + CATALOG_URL : 'ATTENTION : catalogue illisible à ' + CATALOG_URL);
}
// Times one password hash (ACCT.iter rounds of PBKDF2). Aim for well under a second; lower ACCT.iter if not.
function benchmarkHash() {
  const t0 = Date.now();
  pbkdf2_('benchmark-password', salt_(), ACCT.iter);
  console.log(ACCT.iter + ' itérations PBKDF2 : ' + (Date.now() - t0) + ' ms par connexion.');
}
// Generates a strong admin key, saves it in ADMIN_KEY and prints it ONCE in the execution log.
// Running it again replaces the key and signs every admin out.
function generateAdminKey() {
  const key = 'kobg-' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', key);
  CacheService.getScriptCache().remove('adm:lock');
  console.log('Nouvelle clé admin (copiez-la dans un gestionnaire de mots de passe) : ' + key);
}
