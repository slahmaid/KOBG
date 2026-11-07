#!/usr/bin/env node
/*
 * Minified copies of the two files every page loads (≈ 26 KB less to download on a first visit, after gzip):
 *   styles.css -> styles.min.css (+ .map)      script.js -> script.min.js (+ .map)
 * Pages link the .min files with ?v=<hash of their content>; this script updates that in every page, so a new
 * build is never hidden by a browser cache and there is no version to bump by hand.
 *
 * ALWAYS EDIT styles.css / script.js (never the .min files), then run this script before publishing.
 * Each .min file starts with the hash of the source it was built from; the local preview (_ops/dev-server.js)
 * shows a red banner while a .min file is out of date, and --check fails.
 *
 * Needs clean-css and terser, installed outside the site so node_modules is never published:
 *   npm install --prefix ../kobg-tools clean-css terser
 *   NODE_PATH=../kobg-tools/node_modules node _ops/build-min.js        (PowerShell: $env:NODE_PATH="..\kobg-tools\node_modules"; node _ops/build-min.js)
 * Options: --check (exit 1 when a .min file or a page's ?v= is out of date; writes nothing; needs no packages)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const FILES = [
  { src: 'styles.css', out: 'styles.min.css', ref: /(href=")(\/?)styles(?:\.min)?\.css(?:\?v=[^"]*)?"/g },
  { src: 'script.js', out: 'script.min.js', ref: /(src=")(\/?)script(?:\.min)?\.js(?:\?v=[^"]*)?"/g },
];

// line endings ignored: a Windows checkout (git autocrlf) has CRLF where the build saw LF, and is still up to date
const sha = (buf, n) => crypto.createHash('sha256').update(buf.toString().replace(/\r\n/g, '\n')).digest('hex').slice(0, n);
const read = (f) => fs.readFileSync(path.join(ROOT, f));
// first line of every .min file: /*! <source> <sha256 of the source, 12 hex> … */  (read back by --check and dev-server.js)
const stamp = (f) => `/*! ${f.src} ${sha(read(f.src), 12)} - built by _ops/build-min.js: edit ${f.src}, not this file */`;
const builtFrom = (f) => {
  const p = path.join(ROOT, f.out);
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf8').slice(0, 200).match(/^\/\*! \S+ ([0-9a-f]{12}) /);
  return m && m[1];
};
const pages = () => fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'));

function check() {
  const bad = [];
  for (const f of FILES) {
    if (builtFrom(f) !== sha(read(f.src), 12)) { bad.push(`${f.out} is out of date (built from another ${f.src})`); continue; }
    const v = sha(read(f.out), 10);
    for (const p of pages()) {
      const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
      for (const m of html.matchAll(f.ref)) if (m[0] !== `${m[1]}${m[2]}${f.out}?v=${v}"`) { bad.push(`${p} links ${m[0]} instead of ${f.out}?v=${v}`); break; }
    }
  }
  if (bad.length) { console.error(bad.join('\n') + '\n-> run: node _ops/build-min.js'); process.exit(1); }
  console.log('styles.min.css and script.min.js are up to date, and every page links them.');
}

async function build() {
  let CleanCSS, terser;
  try { CleanCSS = require('clean-css'); terser = require('terser'); } catch (e) {
    console.error('clean-css / terser are missing. Install them outside the site:  npm install --prefix ../kobg-tools clean-css terser\n' +
      'then run:  NODE_PATH=../kobg-tools/node_modules node _ops/build-min.js');
    process.exit(1);
  }
  const versions = {};
  for (const f of FILES) {
    const source = read(f.src);
    let code, map;
    if (f.src.endsWith('.css')) {
      // whitespace and comments only: rules, selectors and values stay as written (checked rule by rule in Chrome's CSS
      // parser; the one rewrite left is "0px"/"0%" -> "0" where a bare 0 is valid, never inside calc/min/max/clamp).
      // The value rewrites minifiers do by default gain ~0.1 KB gzipped here and broke things: lightningcss drops
      // -webkit-backdrop-filter (Safari < 18 needs it); clean-css's full level 1 drops the 0.01ms reduced-motion durations
      const r = new CleanCSS({ level: { 1: { all: false, removeWhitespace: true, selectorsSortingMethod: 'none' } }, inline: false, rebase: false, sourceMap: true })
        .minify({ [f.src]: { styles: source.toString() } });
      if (r.errors.length) throw new Error(r.errors.join('\n'));
      r.warnings.forEach((w) => console.warn(`  ${f.src}: ${w}`));
      code = r.styles;
      map = JSON.parse(r.sourceMap.toString());
    } else {
      // default compress/mangle: top-level names (used by other scripts and by _ops tests) are kept as they are
      const r = await terser.minify(source.toString(), { compress: true, mangle: true, sourceMap: { filename: f.out } });
      code = r.code;
      map = JSON.parse(r.map);
    }
    map.file = f.out; map.sources = [f.src]; delete map.sourcesContent;          // the readable source is published next to it
    map.mappings = ';' + map.mappings;                                              // the stamp line comes first
    const tail = f.src.endsWith('.css') ? `\n/*# sourceMappingURL=${f.out}.map */\n` : `\n//# sourceMappingURL=${f.out}.map\n`;
    const out = `${stamp(f)}\n${code}${tail}`;
    fs.writeFileSync(path.join(ROOT, f.out), out);
    fs.writeFileSync(path.join(ROOT, f.out + '.map'), JSON.stringify(map));
    versions[f.out] = sha(out, 10);
    console.log(`${f.src} ${Math.round(source.length / 1024)} KB -> ${f.out} ${Math.round(out.length / 1024)} KB`);
  }
  let changed = 0;
  for (const p of pages()) {
    const file = path.join(ROOT, p);
    const before = fs.readFileSync(file, 'utf8');
    let html = before;
    for (const f of FILES) html = html.replace(f.ref, (m, a, slash) => `${a}${slash}${f.out}?v=${versions[f.out]}"`);
    if (html !== before) { fs.writeFileSync(file, html); changed++; }
  }
  console.log(`${changed} page(s) now link the new build.`);
}

if (CHECK) check(); else build().catch((e) => { console.error(e); process.exit(1); });
