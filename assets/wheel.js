// « Roue de la chance »: one free spin per visitor, prize attached to a customer account.
// The DRAW happens on the server (_ops/order-apps-script.gs, WHEEL: the odds live there only). The server answers a
// signed token + the slice index; this file only animates the wheel so it stops on that slice, keeps the token in
// localStorage (same result on every later visit) and sends the visitor to compte to claim the prize.
// Load after script.js. Never opens by itself: only the floating « Tentez votre chance » button (bottom left) or a link to
// …#roue / ?roue opens it. Guests who already spun see their saved result and the « Créer mon compte » button again (still one spin).
(() => {
  'use strict';
  const A = window.KOBGAccount;
  if (!A || !A.wheel || !window.HTMLDialogElement) return;
  const W = A.wheel;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const esc = A.esc;
  const SVGNS = 'http://www.w3.org/2000/svg';

  // Same order as WHEEL.slices on the server (the server's index is the one that counts; if the two lists ever
  // differ, the prize key decides). Opposite slices: 0/5 = 10 points, 2/7 = 25 points.
  const SLICES = [
    { key: 'pts10', big: '10', small: 'POINTS' },
    { key: 'gant', small: 'GANTS', img: 'assets/p/gants-de-sac-rival-rb10-intelli-shock-noir-rouge.jpg' },
    { key: 'pts25', big: '25', small: 'POINTS' },
    { key: 'pts50', big: '50', small: 'POINTS' },
    { key: 'pct50', big: '-50%' },
    { key: 'pts10', big: '10', small: 'POINTS' },
    { key: 'protecteur', small: 'PROTECTEUR', img: 'assets/p/protecteur-corporel-rival-noir.jpg' },
    { key: 'pts25', big: '25', small: 'POINTS' },
    { key: 'pct20', big: '-20%' },
    { key: 'pts100', big: '100', small: 'POINTS' },
  ];
  const N = SLICES.length, STEP = 360 / N;
  // red / black / off-white, never two neighbours alike (0 and 9 included); text colour picked per background
  const FILL = ['#d0202a', '#111111', '#f3efe6', '#d0202a', '#111111', '#f3efe6', '#d0202a', '#111111', '#f3efe6', '#111111'];
  const INK = (c) => (c === '#f3efe6' ? '#111111' : '#ffffff');

  const store = W.store;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rand = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4294967296; };   // cosmetic only

  // ---------- the wheel (SVG) ----------
  const el = (name, attrs, parent) => {
    const n = document.createElementNS(SVGNS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v)));
    if (parent) parent.appendChild(n);
    return n;
  };
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return [+(r * Math.sin(a)).toFixed(3), +(-r * Math.cos(a)).toFixed(3)]; };
  function buildWheel() {
    const svg = el('svg', { viewBox: '-100 -100 200 200', class: 'wheel-svg', 'aria-hidden': 'true', focusable: 'false' });
    const defs = el('defs', {}, svg);
    el('circle', { r: 99, fill: '#111111' }, svg);
    el('circle', { r: 95.5, fill: 'none', stroke: '#f3efe6', 'stroke-width': 2.2 }, svg);
    const rotor = el('g', { class: 'wheel-rotor' }, svg);
    const R = 92;
    SLICES.forEach((s, i) => {
      const [x0, y0] = pt(i * STEP - STEP / 2, R), [x1, y1] = pt(i * STEP + STEP / 2, R);
      el('path', { d: `M0 0L${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}Z`, fill: FILL[i], stroke: '#111111', 'stroke-width': 0.8 }, rotor);
      const g = el('g', { transform: `rotate(${i * STEP})` }, rotor);
      const ink = INK(FILL[i]);
      if (s.img) {
        const id = `wheelClip${i}`;
        el('circle', { r: 15, cx: 0, cy: -60 }, el('clipPath', { id }, defs));
        el('circle', { r: 16.2, cx: 0, cy: -60, fill: '#ffffff' }, g);
        el('image', { href: s.img, x: -15, y: -75, width: 30, height: 30, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }, g);
        const t = el('text', { x: 0, y: -81, 'text-anchor': 'middle', fill: ink, class: 'wheel-t-small wheel-t-gift' }, g);
        t.textContent = s.small;
      } else if (!s.small) {
        // discount: one big label, centred in the slice and read from the rim towards the centre
        const t1 = el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: ink, class: 'wheel-t-big wheel-t-pct', transform: 'translate(0 -62) rotate(90)' }, g);
        t1.textContent = s.big;
      } else {
        const t1 = el('text', { x: 0, y: -66, 'text-anchor': 'middle', fill: ink, class: `wheel-t-big${s.big.length > 3 ? ' is-long' : ''}` }, g);
        t1.textContent = s.big;
        const t2 = el('text', { x: 0, y: -53, 'text-anchor': 'middle', fill: ink, class: 'wheel-t-small' }, g);
        t2.textContent = s.small;
      }
    });
    // pegs on the rim between slices
    for (let i = 0; i < N; i++) { const [x, y] = pt(i * STEP + STEP / 2, 95.5); el('circle', { cx: x, cy: y, r: 2.1, fill: '#f3efe6', stroke: '#111111', 'stroke-width': 0.6 }, svg); }
    return { svg, rotor };
  }

  // ---------- dialog ----------
  const dlg = document.createElement('dialog');
  dlg.setAttribute('data-lenis-prevent', '');
  dlg.className = 'wheel-dlg';
  dlg.setAttribute('aria-labelledby', 'wheelTitle');
  dlg.setAttribute('aria-describedby', 'wheelLead');
  dlg.innerHTML = `
    <div class="wheel-panel">
      <button type="button" class="wheel-x" aria-label="Fermer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
      <div class="wheel-head">
        <p class="promo-tag wheel-tag"><span class="promo-dot" aria-hidden="true"></span><span>Jeu offert · 1 tour par personne</span></p>
        <h2 class="wheel-h" id="wheelTitle">Tentez votre chance</h2>
      </div>
      <div class="wheel-cell">
        <div class="wheel-stage">
          <span class="wheel-pointer" aria-hidden="true"></span>
          <button type="button" class="wheel-start" aria-label="Lancer la roue" aria-describedby="wheelLead"><span>START</span></button>
        </div>
      </div>
      <div class="wheel-main">
        <p class="wheel-lead" id="wheelLead">Un tour gratuit : points fidélité, remise ou équipement Rival à gagner. Appuyez sur START au centre de la roue.</p>
        <p class="wheel-status" role="status" aria-live="polite"></p>
        <div class="wheel-result" hidden tabindex="-1"></div>
      </div>
      <p class="wheel-legal">Sans obligation d’achat · 1 lot par personne · compte client requis. <a href="reglement-jeu">Règlement du jeu</a></p>
    </div>`;
  const stage = dlg.querySelector('.wheel-stage');
  const startBtn = dlg.querySelector('.wheel-start');
  const statusEl = dlg.querySelector('.wheel-status');
  const resultEl = dlg.querySelector('.wheel-result');
  const { svg, rotor } = buildWheel();
  stage.prepend(svg);
  const sliceList = document.createElement('p');
  sliceList.className = 'sr-only';
  sliceList.textContent = 'Cases de la roue : 10 points, gants de sac Rival RB10 Intelli-Shock Noir/Rouge, 25 points, 50 points, remise de 50 % sur les articles, 10 points, protecteur corporel Rival, 25 points, remise de 20 % sur les articles, 100 points.';
  stage.after(sliceList);

  // ---------- fit: the panel never scrolls ----------
  // Single column (phones, portrait tablets): the wheel gets the height left once the title, the text / result and
  // the footer are laid out (--wheel-reserve, measured here). Two columns (wide screens): CSS alone sizes it.
  const panel = dlg.querySelector('.wheel-panel');
  const cell = dlg.querySelector('.wheel-cell');
  function fit() {
    if (!dlg.open) return;
    const reserve = Math.max(0, panel.offsetHeight - cell.offsetHeight);
    const cur = parseFloat(dlg.style.getPropertyValue('--wheel-reserve')) || 0;
    if (Math.abs(reserve - cur) > 0.5) dlg.style.setProperty('--wheel-reserve', reserve + 'px');
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => fit());
    ['.wheel-head', '.wheel-main', '.wheel-legal'].forEach((q) => ro.observe(dlg.querySelector(q)));
  }
  window.addEventListener('resize', fit);

  let angle = 0;
  const paintAngle = () => { rotor.setAttribute('transform', `rotate(${(angle % 360).toFixed(3)})`); };
  const restAt = (i) => { angle = -i * STEP; paintAngle(); };
  let spinning = false, raf = 0;

  const status = (msg) => { statusEl.textContent = msg || ''; };

  // ---------- result panel ----------
  const PRIZE = {
    points: (p) => [`${p.value} points fidélité`, 'Crédités sur votre compte (1 point = 1 DH), pour une prochaine commande.'],
    remise: (p) => [`-${p.value} % de réduction`, 'Sur les articles de votre prochaine commande · valable 30 jours · non cumulable avec un code promo.'],
    cadeau: (p) => p.key === 'gant'
      ? ['Gants de sac Rival RB10 Intelli-Shock Noir/Rouge', 'Offerts (valeur 2 390 DH) : notre équipe vous contacte pour la taille et la livraison gratuite.', 'rb10-intelli-shock-noir-rouge']
      : ['Protecteur corporel Rival (Body Shield)', 'Offert (valeur 4 559 DH) : notre équipe vous contacte pour le coloris, la taille et la livraison.', 'protecteur-corporel'],
  };
  function paintResult(w, claimMsg) {
    const p = w.prize;
    const [h, txt, url] = (PRIZE[p.kind] || PRIZE.points)(p);
    const s = A.store.read();
    const until = w.claimBy ? fmtDate(w.claimBy) : '';
    const why = W.store.refusal(w);      // refused for the account signed in now, or past its 30 days
    let act;
    if (w.claimed) {
      act = `<p class="wheel-ok">Lot ajouté à votre compte.</p><a class="wheel-btn" href="compte">Voir mon compte</a>`;
    } else if (why) {
      act = `<p class="wheel-err">${esc(W.errors[why] || 'Ce lot ne peut pas être ajouté.')}</p><a class="wheel-btn wheel-btn--ghost" href="reglement-jeu">Voir le règlement</a>`;
    } else if (s) {
      act = `<button type="button" class="wheel-btn js-wheel-claim">Ajouter à mon compte</button>${claimMsg ? `<p class="wheel-err">${esc(claimMsg)}</p>` : ''}
        <p class="wheel-small">Connecté : <span class="wheel-who">${esc(s.profile.email || s.profile.nom || 'mon compte')}</span> · un seul lot par personne.</p>`;
    } else {
      act = `<a class="wheel-btn" href="compte#inscription">Créer mon compte et recevoir mon lot</a>
        <a class="wheel-link" href="compte">J’ai déjà un compte : me connecter</a>
        <p class="wheel-small">Ajouté automatiquement à votre nouveau compte (ou à un compte sans lot)${until ? `, jusqu’au ${esc(until)}` : ''}.</p>`;
    }
    resultEl.innerHTML = `<p class="wheel-won">${w.again ? 'Votre résultat' : 'Bravo, vous avez gagné'}</p>
      <p class="wheel-prize">${esc(h)}</p><p class="wheel-prize-txt">${esc(txt)}${url ? ` <a href="${esc(url)}">Voir le produit</a>` : ''}</p><div class="wheel-acts">${act}</div>`;
    resultEl.hidden = false;
    dlg.classList.add('has-result');
    fit();
    startBtn.disabled = true;
    startBtn.setAttribute('aria-label', `Roue déjà lancée : ${h}`);
    fabPaint();
  }
  resultEl.addEventListener('click', async (e) => {
    const b = e.target.closest('.js-wheel-claim');
    if (!b) return;
    const s = A.store.read();
    if (!s) { paintResult(store.read()); return; }
    b.disabled = true; b.textContent = 'Un instant…';
    const r = await W.claim(s.token);
    const w = store.read();
    if (w) paintResult(w, r && !r.ok && !W.errors[r.error] ? r.message : '');
    status(r && r.ok ? 'Lot ajouté à votre compte.' : (r && r.message) || '');
    resultEl.querySelector('.wheel-btn')?.focus();
  });

  // ---------- spin ----------
  const ERR = {
    busy: 'Beaucoup de participants en ce moment : réessayez dans quelques minutes.',
    wheel_off: 'La Roue de la chance est terminée pour le moment.',
    unavailable: 'La Roue de la chance est indisponible pour le moment. Réessayez plus tard.',
    // the Apps Script deployment is older than this page (no « wheel_spin » action yet) or answered garbage
    bad_action: 'La Roue de la chance ouvre très bientôt : revenez dans quelques instants pour tenter votre chance.',
    http: 'La Roue de la chance est momentanément indisponible. Réessayez dans quelques minutes.',
    server: 'La Roue de la chance est momentanément indisponible. Réessayez dans quelques minutes.',
    network: 'Pas de connexion internet : vérifiez votre réseau puis appuyez de nouveau sur START.',
    timeout: 'Le serveur met trop de temps à répondre : vérifiez votre connexion puis appuyez de nouveau sur START.',
  };
  const MAX_V = 1000;                   // deg/s while waiting for the server
  async function spin() {
    if (spinning || store.read()) return;
    spinning = true;
    startBtn.disabled = true;
    dlg.classList.add('is-spinning');
    status('La roue tourne…');
    const motion = !reduce.matches;
    let v = 0, last = performance.now(), phase = 'wait', anim = null;
    let done;
    const finished = new Promise((r) => { done = r; });
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (phase === 'wait') { v = Math.min(MAX_V, v + 1400 * dt); angle += v * dt; }
      else if (phase === 'stop') {
        const t = Math.min(1, (now - anim.t0) / anim.D);
        angle = anim.a0 + anim.dist * (1 - (1 - t) ** 3);
        if (t >= 1) { paintAngle(); done(); return; }
      }
      paintAngle();
      raf = requestAnimationFrame(frame);
    };
    if (motion) raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const r = await A.api('wheel_spin', {});
    if (motion && performance.now() - t0 < 700) await new Promise((x) => setTimeout(x, 700 - (performance.now() - t0)));
    let i = r.ok ? +r.slice : -1;
    if (r.ok && (!SLICES[i] || SLICES[i].key !== (r.prize && r.prize.key))) i = SLICES.findIndex((s) => s.key === (r.prize && r.prize.key));
    if (!r.ok || i < 0 || !r.token) {
      // stop gently where it is, then explain
      if (motion) { phase = 'stop'; anim = { t0: performance.now(), a0: angle, dist: Math.max(30, v * 0.6), D: 1200 }; await finished; }
      cancelAnimationFrame(raf);
      spinning = false;
      dlg.classList.remove('is-spinning');
      startBtn.disabled = false;
      // for the site owner (browser console): which error, and which backend version answered
      console.warn('[KOBG roue] wheel_spin a échoué :', r.error || 'réponse incomplète', r.version ? '(Apps Script ' + r.version + ')' : '',
        r.error === 'bad_action' ? '→ le déploiement Apps Script est une ancienne version : collez _ops/order-apps-script.gs, exécutez setup() puis déployez une nouvelle version.' : '');
      status(r.ok ? ERR.server : ERR[r.error] || A.message(r));
      return;
    }
    const w = { token: r.token, slice: i, prize: r.prize, at: +r.at || Date.now(), claimBy: +r.claimBy || 0, claimed: !!r.claimed };
    store.save(w);
    // land exactly inside slice i (jitter keeps it off the edges), at least 2.5 more turns, ease-out cubic
    const jitter = (rand() - 0.5) * STEP * 0.6;
    let target = -i * STEP + jitter;
    if (motion) {
      const min = angle + 900;
      target += Math.ceil((min - target) / 360) * 360;
      const dist = target - angle;
      const D = Math.max(3200, Math.min(6000, (3 * dist / Math.max(v, 200)) * 1000));
      phase = 'stop';
      anim = { t0: performance.now(), a0: angle, dist, D };
      await finished;
    } else {
      angle = target; paintAngle();
    }
    spinning = false;
    dlg.classList.remove('is-spinning');
    dlg.dataset.slice = String(i);
    const [h] = (PRIZE[w.prize.kind] || PRIZE.points)(w.prize);
    status('');                          // the « Félicitations » pop-up announces it
    // already signed in: try to attach it at once (no prize is ever lost: the token stays in this browser)
    let msg = '';
    const s = A.store.read();
    if (s) { const c = await W.claim(s.token); if (c && !c.ok && !W.errors[c.error]) msg = c.message; }
    paintResult({ ...store.read(), again: false }, msg);
    resultEl.focus();
    toast(h, w.prize.kind);
  }

  // ---------- « Félicitations » pop-up (inside the dialog: top layer, announced by aria-live, gone after ~4 s) ----------
  const toastEl = document.createElement('div');
  toastEl.className = 'wheel-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.hidden = true;
  dlg.querySelector('.wheel-panel').appendChild(toastEl);
  let toastT = 0;
  const hideToast = () => { clearTimeout(toastT); toastEl.classList.remove('is-in'); toastEl.hidden = true; toastEl.textContent = ''; };
  function toast(h, kind) {
    clearTimeout(toastT);
    const what = kind === 'remise' ? `une remise de ${h.replace(/^-/, '').replace(/ de réduction$/, '')} sur les articles` : kind === 'cadeau' ? h.replace(/^Gants/, 'des gants').replace(/^Protecteur/, 'un protecteur') : h;
    toastEl.innerHTML = `<span class="wheel-toast-burst" aria-hidden="true"></span><span class="wheel-toast-body"><strong class="wheel-toast-h">Félicitations&nbsp;!</strong><span class="wheel-toast-txt">Vous avez gagné ${esc(what)}.</span></span>
      <button type="button" class="wheel-toast-x" aria-label="Fermer le message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-in'));
    toastT = setTimeout(hideToast, 4200);
  }
  toastEl.addEventListener('click', (e) => { if (e.target.closest('.wheel-toast-x')) hideToast(); });
  startBtn.addEventListener('click', spin);

  // ---------- open / close ----------
  let lastFocus = null;
  function open(how) {
    if (dlg.open) return;
    if (!dlg.isConnected) document.body.appendChild(dlg);
    lastFocus = document.activeElement;
    const w = store.read();
    if (w) {
      restAt(w.slice);
      paintResult({ ...w, again: true });
      // quiet check with the server: same result, and whether it was claimed meanwhile (another tab, another device)
      A.api('wheel_spin', { token: w.token }).then((r) => {
        if (r.ok && r.again && r.token === w.token && r.claimed && !w.claimed) { store.patch({ claimed: true }); paintResult({ ...store.read(), again: true }); }
      });
    } else {
      restAt(0);
      resultEl.hidden = true; dlg.classList.remove('has-result');
      startBtn.disabled = false; startBtn.setAttribute('aria-label', 'Lancer la roue');
      status('');
    }
    dlg.showModal();
    fit();
    (w ? resultEl.querySelector('.wheel-btn, .wheel-link') || resultEl : startBtn).focus();
    document.documentElement.classList.add('wheel-open');   // before stop(): script.js keeps Lenis stopped while this class is set (resize, menu…)
    window.kobgLenis?.stop();
    dlg.dataset.how = how || 'button';
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    hideToast();
    document.documentElement.classList.remove('wheel-open');
    window.kobgLenis?.start();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  });
  dlg.querySelector('.wheel-x').addEventListener('click', close);
  // click on the backdrop (outside the panel) closes
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

  // ---------- floating button ----------
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'wheel-fab';
  fab.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M12 12 12 2A10 10 0 0 1 21.5 8.9Z" fill="#d0202a"/><path d="M12 12 21.5 8.9A10 10 0 0 1 17.9 20.1Z" fill="#111"/><path d="M12 12 17.9 20.1A10 10 0 0 1 6.1 20.1Z" fill="#d0202a"/><path d="M12 12 6.1 20.1A10 10 0 0 1 2.5 8.9Z" fill="#111"/><path d="M12 12 2.5 8.9A10 10 0 0 1 12 2Z" fill="#f3efe6"/><circle cx="12" cy="12" r="10" fill="none" stroke="#111" stroke-width="1.5"/><circle cx="12" cy="12" r="2.6" fill="#111"/></svg><span class="wheel-fab-txt"></span>`;
  const fabTxt = fab.querySelector('.wheel-fab-txt');
  function fabPaint() {
    const w = store.read();
    const settled = !!(w && (w.claimed || store.refusal(w)));    // nothing left to claim
    fabTxt.textContent = w ? (settled ? 'Mon lot' : 'Mon lot à réclamer') : 'Tentez votre chance';
    fab.setAttribute('aria-label', w ? `Roue de la chance : ${fabTxt.textContent}` : 'Tentez votre chance : roue de la chance, un tour offert');
    fab.classList.toggle('is-done', settled);
  }
  fab.addEventListener('click', () => open('button'));
  fabPaint();
  // Icon only (label back on hover with a mouse) once the page is scrolled, on phone product pages, and whenever the
  // label would sit on a promo code, a price or the add-to-cart button. Starts as the icon: nothing shrinks on load.
  const narrow = window.matchMedia('(max-width: 760px)');
  const productPage = document.body.classList.contains('pp-page');
  const AVOID = '.promo-code, .copy-btn, .pp-price, .pp-add, .product-price';
  const fabTxtW = () => fab.getBoundingClientRect().width + (fab.classList.contains('is-compact') ? 18 + fabTxt.scrollWidth : 0);
  function covers() {
    const r = fab.getBoundingClientRect();
    const right = r.left + fabTxtW();
    return [...document.querySelectorAll(AVOID)].some((el) => {
      const e = el.getBoundingClientRect();
      return e.width > 0 && e.right > r.left && e.left < right && e.bottom > r.top && e.top < r.bottom;
    });
  }
  let compactRaf = 0;
  const compact = () => {
    compactRaf = 0;
    fab.classList.toggle('is-compact', window.scrollY > 160 || (productPage && narrow.matches) || covers());
  };
  const later = () => { if (!compactRaf) compactRaf = requestAnimationFrame(compact); };
  fab.classList.add('is-compact');
  document.body.appendChild(fab);
  later();
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  window.addEventListener('load', () => setTimeout(later, 1200));   // after the entrance animations moved the cards
  narrow.addEventListener?.('change', later);
  window.addEventListener('storage', (e) => { if (e.key === 'kobg-wheel-v1' || e.key === null) fabPaint(); });

  // explicit link to the wheel (…#roue, ?roue): open it; nothing else opens it by itself
  if (/[?&#]roue\b(?!=0)/.test(location.search + location.hash)) open('link');

  window.KOBGWheel = Object.freeze({ open, close, slices: SLICES.map((s) => s.key) });
})();
