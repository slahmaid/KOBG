#!/usr/bin/env node
/*
 * Image pipeline for the static site. Run it after adding or replacing a photo (safe to run any time):
 *
 *   1. every JPEG that a page shows with <img> (or a <picture><source>) gets an .avif twin next to it,
 *      made only when missing or older than the JPEG, and kept only when clearly smaller;
 *   2. the header's category tiles (assets/cat/) also get a small "-s" copy (JPEG + AVIF) for the 34 px desktop menu;
 *   3. those <img> are wrapped in a class-less <picture> whose AVIF <source> comes first: browsers without AVIF
 *      keep loading the JPEG, which stays the reference file (cart, search, e-mails, og:image, JSON-LD);
 *   4. a <link rel="preload" as="image"> of such a JPEG preloads the AVIF instead (type="image/avif"), so no browser
 *      downloads both.
 *
 * Pages already converted are left alone. Images inside <video>, SVGs and JS-built images (cart, search) are not touched.
 *
 * Needs sharp, installed outside the site so node_modules is never published:
 *   npm install --prefix ../kobg-tools sharp
 *   NODE_PATH=../kobg-tools/node_modules node _ops/optimize-images.js        (PowerShell: $env:NODE_PATH="..\kobg-tools\node_modules"; node _ops/optimize-images.js)
 * Options: --dry (report only, write nothing)
 */
'use strict';
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); } catch (e) {
  console.error('sharp is missing. Install it outside the site:  npm install --prefix ../kobg-tools sharp\n' +
    'then run:  NODE_PATH=../kobg-tools/node_modules node _ops/optimize-images.js');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
// AVIF at q64 / 4:2:0 keeps the JPEGs' detail (PSNR ~41 dB against them, leather grain intact) at ~37 % fewer bytes
const AVIF = { quality: 64, effort: 6, chromaSubsampling: '4:2:0' };
const PARALLEL = 4;                // pages converted at once (each AVIF encode also uses several threads)
const MIN_GAIN = 0.9;              // keep an AVIF only if it is at most 90 % of the JPEG
const CAT_SMALL_W = 104;           // desktop menu tile: 34 css px, up to 3x screens
// keep in sync with the responsive @media query in styles.css (mobile menu tiles are ~33vw wide)
const CAT_SIZES = '(max-width: 560px) 40vw, (max-width: 860px) and (orientation: portrait) 40vw, (max-aspect-ratio: 4/5) 40vw, 34px';

const isJpeg = (p) => /\.jpe?g$/i.test(p);
const local = (url) => path.join(ROOT, url.replace(/^\/+/, '').split(/[?#]/)[0]);
const toAvif = (url) => url.replace(/\.jpe?g(?=$|[?#])/i, '.avif');
const toSmall = (url) => url.replace(/(\.jpe?g)(?=$|[?#])/i, '-s$1');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const newer = (a, b) => fs.existsSync(b) && fs.statSync(b).mtimeMs >= fs.statSync(a).mtimeMs;

const stats = { avifMade: 0, avifSkipped: 0, bytesJpeg: 0, bytesAvif: 0, small: 0, pages: 0, tags: 0 };
const once = new Map();            // file -> Promise (images shared by many pages are encoded once)
const cached = (key, fn) => { if (!once.has(key)) once.set(key, fn()); return once.get(key); };

// resolves true when an .avif twin exists and is worth serving
const ensureAvif = (url) => cached('avif:' + local(url), async () => {
  const src = local(url), out = toAvif(src);
  if (!fs.existsSync(src)) { console.warn('  missing image:', url); return false; }
  if (newer(src, out)) return true;
  const jpg = fs.readFileSync(src);
  const buf = await sharp(jpg).avif(AVIF).toBuffer();
  if (buf.length <= jpg.length * MIN_GAIN) {
    if (!DRY) fs.writeFileSync(out, buf);
    stats.avifMade++; stats.bytesJpeg += jpg.length; stats.bytesAvif += buf.length;
    return true;
  }
  stats.avifSkipped++;
  if (!DRY && fs.existsSync(out)) fs.unlinkSync(out);
  return false;
});

const ensureSmall = (url, width) => cached('small:' + local(url), async () => {
  const src = local(url), out = local(toSmall(url));
  if (!newer(src, out)) {
    const buf = await sharp(src).resize({ width }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (!DRY) fs.writeFileSync(out, buf);
    stats.small++;
  }
  return ensureAvif(toSmall(url));
});

// <img> whose src is a local JPEG and that is not yet inside a <picture> or a <video>
const IMG = /<img\b[^>]*>/g;

async function convertPage(file) {
  const before = fs.readFileSync(file, 'utf8');
  let html = before;

  // 1. existing <picture>: add an AVIF twin in front of every JPEG <source> and in front of the <img>
  const pictures = [...html.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture>/g)];
  for (const m of pictures.reverse()) {
    const block = m[0];
    if (/type="image\/avif"/.test(block)) continue;
    let out = block;
    for (const s of [...block.matchAll(/([ \t]*)(<source\b[^>]*>)/g)]) {
      const set = attr(s[2], 'srcset');
      if (!set || !isJpeg(set) || set.includes(' ') || !(await ensureAvif(set))) continue;
      const twin = s[2].replace(/\ssrcset="[^"]*"/, ` type="image/avif" srcset="${toAvif(set)}"`);
      out = out.replace(s[0], `${s[1]}${twin}\n${s[0]}`);
    }
    const img = (out.match(/([ \t]*)(<img\b[^>]*>)/) || []);
    const isrc = img[2] && attr(img[2], 'src');
    if (isrc && isJpeg(isrc) && !/^https?:/.test(isrc) && await ensureAvif(isrc)) {
      out = out.replace(img[0], `${img[1]}<source type="image/avif" srcset="${toAvif(isrc)}">\n${img[0]}`);
    }
    if (out !== block) { html = html.slice(0, m.index) + out + html.slice(m.index + block.length); stats.tags++; }
  }

  // 2. bare <img>: wrap in <picture>
  const parts = [];
  let last = 0;
  for (const m of html.matchAll(IMG)) {
    const tag = m[0], src = attr(tag, 'src');
    if (!src || !isJpeg(src) || /^(https?:|data:)/.test(src)) continue;
    const head = html.slice(0, m.index);
    const openPic = head.lastIndexOf('<picture'), closePic = head.lastIndexOf('</picture>');
    const openVid = head.lastIndexOf('<video'), closeVid = head.lastIndexOf('</video>');
    if (openPic > closePic || openVid > closeVid) continue;      // already in a <picture> / fallback inside <video>
    let source, img = tag;
    if (/\sclass="[^"]*\bdrop-thumb\b/.test(tag) && !/\ssrcset=/.test(tag)) {
      const { width: w } = await sharp(local(src)).metadata();
      const smallAvif = await ensureSmall(src, CAT_SMALL_W), bigAvif = await ensureAvif(src);
      const s = toSmall(src);
      img = tag.replace(/\ssrc="[^"]*"/, (x) => `${x} srcset="${s} ${CAT_SMALL_W}w, ${src} ${w}w" sizes="${CAT_SIZES}"`);
      if (!smallAvif || !bigAvif) { parts.push(html.slice(last, m.index), img); last = m.index + tag.length; stats.tags++; continue; }
      source = `<source type="image/avif" srcset="${toAvif(s)} ${CAT_SMALL_W}w, ${toAvif(src)} ${w}w" sizes="${CAT_SIZES}">`;
    } else {
      if (/\ssrcset=/.test(tag) || !(await ensureAvif(src))) continue;   // own srcset: left as written
      source = `<source type="image/avif" srcset="${toAvif(src)}">`;
    }
    parts.push(html.slice(last, m.index), `<picture>${source}${img}</picture>`);
    last = m.index + tag.length;
    stats.tags++;
  }
  parts.push(html.slice(last));
  html = parts.join('');

  // 3. image preloads: preload the AVIF the <picture> will pick (browsers without AVIF skip it by type)
  html = await replaceAsync(html, /<link\b[^>]*\brel="preload"[^>]*>/g, async (tag) => {
    const href = attr(tag, 'href');
    if (!/\sas="image"/.test(tag) || !href || !isJpeg(href) || /\stype=/.test(tag) || !(await ensureAvif(href))) return tag;
    return tag.replace(/\shref="[^"]*"/, ` href="${toAvif(href)}" type="image/avif"`);
  });

  if (html !== before) { stats.pages++; if (!DRY) fs.writeFileSync(file, html); }
}

async function replaceAsync(str, re, fn) {
  const out = []; let last = 0;
  for (const m of str.matchAll(re)) { out.push(str.slice(last, m.index), await fn(m[0])); last = m.index + m[0].length; }
  out.push(str.slice(last));
  return out.join('');
}

(async () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f));
  const queue = [...pages];
  await Promise.all(Array.from({ length: PARALLEL }, async () => { while (queue.length) await convertPage(queue.shift()); }));
  const kb = (n) => Math.round(n / 1024) + ' KB';
  console.log(`${DRY ? '[dry run] ' : ''}${stats.pages} page(s) updated, ${stats.tags} image tag(s) converted; ` +
    `${stats.avifMade} AVIF made (${kb(stats.bytesJpeg)} JPEG -> ${kb(stats.bytesAvif)}), ${stats.avifSkipped} not worth it; ${stats.small} small copies.`);
})();
