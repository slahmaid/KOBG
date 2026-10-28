// Minimal in-memory stand-in for the Google Apps Script services used by order-apps-script.gs,
// so the backend can be tested with Node (node _ops/test-backend.js) before it is deployed.
// Sheets behave like typed input: "=..." becomes a formula, "0612..." a number, "'..." stays text.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function typed(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (/^[=+]/.test(v) && v.length > 1) return { formula: v };
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = (this.sheet.rows[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v == null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet.put(this.row + r, this.col + c, typed(v))));
    return this;
  }
  setValue(v) { this.sheet.put(this.row, this.col, typed(v)); return this; }
  getValue() { return this.getValues()[0][0]; }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
  put(r, c, v) { while (this.rows.length < r) this.rows.push([]); const line = this.rows[r - 1]; while (line.length < c) line.push(''); line[c - 1] = v; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some((v) => v !== '' && v != null)) return i; return 0; }
  getLastColumn() { return this.rows.reduce((m, line) => { for (let i = line.length; i > 0; i--) if (line[i - 1] !== '' && line[i - 1] != null) return Math.max(m, i); return m; }, 0); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return new Range(this, 1, 1, 0, 0);    // A1 ranges are only used for formatting
    return new Range(this, a, b, c || 1, d || 1);
  }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.put(r, i + 1, typed(v))); return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  getFrozenRows() { return this.frozen; }
}

const bytes = (v) => (Array.isArray(v) ? Buffer.from(v.map((b) => b & 255)) : Buffer.from(String(v), 'utf8'));
const signed = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));

function makeEnv(opts = {}) {
  const env = { mails: [], logs: [], fetchFail: !!opts.fetchFail, catalogText: opts.catalogText, now: null,
    mailQuota: opts.mailQuota != null ? opts.mailQuota : 100 };
  const sheets = {};
  const book = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new Sheet(n)),
  };
  env.sheets = sheets;

  const cache = new Map();
  env.cache = {
    get: (k) => { const e = cache.get(k); if (!e) return null; if (e.exp < Date.now()) { cache.delete(k); return null; } return e.v; },
    put: (k, v, ttl) => { if (String(v).length > 100 * 1024) throw new Error('cache value too large'); cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }); },
    remove: (k) => cache.delete(k),
    clear: () => cache.clear(),
  };
  const props = new Map(Object.entries(opts.props || {}));
  env.props = props;

  const fmtParts = (d, tz) => {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(d.getTime())).forEach((x) => { p[x.type] = x.value; });
    return p;
  };
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    formatDate: (d, tz, pattern) => {
      const p = fmtParts(d, tz);
      return pattern.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => ({ yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second }[t]));
    },
    parseDate: (s, tz) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
      if (!m) throw new Error('parseDate: unsupported ' + s);
      const guess = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
      const p = fmtParts(new Date(guess), tz);
      const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      return new Date(guess - (shown - guess));
    },
    getUuid: () => crypto.randomUUID(),
    // like Apps Script: strings (UTF-8) or Byte[] (signed bytes) in, signed Byte[] out
    computeDigest: (alg, s) => signed(crypto.createHash(alg).update(bytes(s)).digest()),
    computeHmacSha256Signature: (value, key) => {
      if (Array.isArray(key) ? !key.length : !String(key).length) throw new Error('Invalid argument: key');   // Java rejects an empty key
      return signed(crypto.createHmac('sha256', bytes(key)).update(bytes(value)).digest());
    },
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  };
  const ctx = {
    console: { log: (...a) => env.logs.push(a.join(' ')), warn: (...a) => env.logs.push('WARN ' + a.join(' ')), error: (...a) => env.logs.push('ERROR ' + a.join(' ')) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book },
    CacheService: { getScriptCache: () => env.cache },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { if (String(v).length > 9 * 1024) throw new Error('property too large'); props.set(k, String(v)); },
        deleteProperty: (k) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
        getKeys: () => [...props.keys()],
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: {
      fetch: () => {
        if (env.fetchFail) throw new Error('DNS error');
        const text = env.catalogText != null ? env.catalogText : fs.readFileSync(path.join(ROOT, 'assets/search-index.js'), 'utf8');
        return { getResponseCode: () => 200, getContentText: () => text };
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
    MailApp: {
      sendEmail: (o) => { if (env.mailQuota < 1) throw new Error('Service invoked too many times for one day: email.'); env.mailQuota--; env.mails.push(o); },
      getRemainingDailyQuota: () => env.mailQuota,
    },
    Utilities,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'order-apps-script.gs'), 'utf8'), ctx, { filename: 'order-apps-script.gs' });
  env.ctx = ctx;
  env.post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  env.get = () => JSON.parse(ctx.doGet({}).getContent());
  env.run = (fn) => ctx[fn]();
  return env;
}

module.exports = { makeEnv };
