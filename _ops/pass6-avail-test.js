#!/usr/bin/env node
/** Pure catalog-availability message matrix (Pass6). Loads function from script.js. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const m = src.match(/function kobgCatalogAvailMessage\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!m) {
  console.error('FAIL: kobgCatalogAvailMessage missing in script.js');
  process.exit(1);
}
// eslint-disable-next-line no-new-func
const fn = new Function(`${m[0]}; return kobgCatalogAvailMessage;`)();

const cases = [
  [{ inStock: false, sizes: ['S'], soldOut: ['S'] }, '', true, 'Épuisé selon le catalogue.'],
  [{ inStock: true, sizes: ['14 oz', '16 oz'], soldOut: ['12 oz'] }, '', true, 'Choisissez une taille. Disponibilité selon le catalogue.'],
  [{ inStock: true, sizes: ['14 oz', '16 oz'], soldOut: ['16 oz'] }, '16 oz', true, 'Taille 16 oz : épuisée selon le catalogue.'],
  [{ inStock: true, sizes: ['14 oz', '16 oz'], soldOut: ['12 oz'] }, '14 oz', true, 'Taille 14 oz : disponible selon le catalogue.'],
  [{ inStock: true, sizes: ['S', 'M'], soldOut: [] }, 'M', true, 'Taille M : disponible selon le catalogue.'],
  [{ inStock: true, sizes: [], soldOut: [] }, '', false, 'Disponible selon le catalogue.'],
  [{ sizes: [], /* no inStock */ }, '', false, 'Disponibilité selon le catalogue.'],
  [null, '', false, 'Disponibilité selon le catalogue.'],
];

let fail = 0;
for (const [product, size, needSize, want] of cases) {
  const got = fn(product, size, needSize);
  if (got !== want) {
    console.error('FAIL', { product, size, needSize, want, got });
    fail++;
  }
}
if (fail) {
  console.error('PASS6 AVAIL TEST FAIL', fail);
  process.exit(1);
}
console.log('PASS6 AVAIL TEST OK');
