// Local preview with a FAKE order backend: serves the site at http://localhost:8080/ (root, like the custom domain) and runs
// order-apps-script.gs in memory (gas-mock.js), so orders and the admin panel can be tried without
// touching the real Google Sheet. Nothing is sent to Google. Data is lost when the server stops.
// Run: node _ops/dev-server.js [port]     Admin key: dev-admin-key-0123456789
// E-mails (password-reset links) are NOT sent: they are printed here, with the link pointing at this
// preview, and listed at http://localhost:8080/__mails (JSON).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gas-mock');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;
const ADMIN_KEY = 'dev-admin-key-0123456789';
const backend = makeEnv({ props: { ADMIN_KEY } });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
// points script.js / admin.js at the fake backend (an external file: the pages' CSP blocks inline scripts)
// and records Content-Security-Policy violations in window.__csp (also printed in the console)
const DEV_JS = "window.KOBG_ORDER_ENDPOINT = '/__api'; window.KOBG_ADMIN_ENDPOINT = '/__api'; window.__csp = [];\n" +
  "document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(e.effectiveDirective + ' ' + e.blockedURI); console.warn('CSP', e.effectiveDirective, e.blockedURI); });";

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__api') {
    if (req.method === 'GET') return send(res, 200, 'application/json', JSON.stringify(backend.get()));
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const sent = backend.mails.length;
      const out = backend.post(body);
      if (out.ok && !body.includes('"action"')) console.log('order', out.orderId, out.total + ' DH', out.adjusted ? '(re-priced)' : '', out.linked ? '(account)' : '');
      backend.mails.slice(sent).forEach((m) => {
        m.body = String(m.body).split('https://knockoutboxinggear.com/').join(`http://localhost:${PORT}/`);
        console.log(`\n--- e-mail (not sent) to ${m.to}: ${m.subject}\n${m.body}\n---`);
      });
      send(res, 200, 'application/json', JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/__mails') return send(res, 200, 'application/json', JSON.stringify(backend.mails));
  // DEV ONLY (this preview, never the real script): /__wheel?slice=8 makes the NEXT spin land on slice 8 (tests and
  // screenshots); the draw itself stays the script's (signed token, same claim rules)
  if (url.pathname === '/__wheel') {
    const i = Number(url.searchParams.get('slice'));
    if (!Number.isInteger(i) || i < 0 || i > 9) return send(res, 400, 'application/json', '{"ok":false}');
    if (!backend.ctx.__pick) backend.ctx.__pick = backend.ctx.wheelPick_;
    backend.ctx.wheelPick_ = function (r, ppm) { backend.ctx.wheelPick_ = backend.ctx.__pick; return i; };
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, next: i }));
  }
  if (url.pathname === '/__dev.js') return send(res, 200, TYPES['.js'], DEV_JS);
  // old GitHub Pages sub-path (/KOBG/...): redirected to the root, as on the live site
  if (/^\/KOBG(?=\/|$)/i.test(url.pathname)) { res.writeHead(301, { Location: (url.pathname.replace(/^\/KOBG/i, '') || '/') + url.search }); return res.end(); }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const inside = file.startsWith(ROOT + path.sep);
  const hidden = /[\\/](\.|_)/.test(file.slice(ROOT.length));       // _ops, _headers, .git... never served
  if (!inside || hidden || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, TYPES['.html'], inject(fs.readFileSync(path.join(ROOT, '404.html'), 'utf8')));
  }
  const ext = path.extname(file);
  const data = fs.readFileSync(file);
  send(res, 200, TYPES[ext] || 'application/octet-stream', ext === '.html' ? inject(data.toString('utf8')) : data);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`KOBG local preview: http://localhost:${PORT}/  (fake backend, admin key: ${ADMIN_KEY})`);
});

function inject(html) { return html.replace('</head>', '  <script src="/__dev.js"></script>\n</head>'); }
