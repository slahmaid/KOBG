/* Knockout Boxing Gear — panneau admin des commandes.
   Talks to the same Google Apps Script web app as the shop (action + key, text/plain POST).
   The admin key is checked by Google, server-side; it is never stored in the site files. */
(function () {
  'use strict';

  // same URL as ORDER_ENDPOINT in script.js
  const ADMIN_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzlxT2m1l9jRQZQYQeIqsGXkxUw0GgKvOhk05uxn-eQwuQ4SzFYbBzZDWkN1MLoBUY42w/exec';
  const endpoint = () => (typeof window.KOBG_ADMIN_ENDPOINT === 'string' ? window.KOBG_ADMIN_ENDPOINT : ADMIN_ENDPOINT);

  const STATUSES = ['Nouvelle', 'Confirmée', 'Expédiée', 'Livrée', 'Annulée', 'Retournée'];
  const NEXT = {                                   // one-click actions from the list
    'Nouvelle': [['Confirmer', 'Confirmée'], ['Annuler', 'Annulée', 'x']],
    'Confirmée': [['Expédier', 'Expédiée'], ['Annuler', 'Annulée', 'x']],
    'Expédiée': [['Livrée', 'Livrée'], ['Retour', 'Retournée', 'x']],
    'Livrée': [], 'Annulée': [['Rouvrir', 'Nouvelle', 'x']], 'Retournée': []
  };
  const TZ = 'Africa/Casablanca';
  const PAGE = 50;
  const REFRESH_MS = 60000;
  const LS_KEY = 'kobg-admin-key', LS_SEEN = 'kobg-admin-seen', LS_PERIOD = 'kobg-admin-period';

  const $ = (s, r) => (r || document).querySelector(s);
  const el = {
    login: $('#login'), loginForm: $('#loginForm'), loginKey: $('#loginKey'), loginRemember: $('#loginRemember'), loginErr: $('#loginErr'), loginBtn: $('#loginBtn'),
    app: $('#app'), sync: $('#sync'), syncTxt: $('#syncTxt'), refresh: $('#refreshBtn'), logout: $('#logoutBtn'), newBadge: $('#newBadge'),
    period: $('#period'), kpis: $('#kpis'), chips: $('#chips'), q: $('#q'), from: $('#from'), to: $('#to'), sort: $('#sort'),
    reset: $('#resetBtn'), csv: $('#csvBtn'), rows: $('#rows'), empty: $('#empty'), pager: $('#pager'), table: $('#otable'),
    drawer: $('#drawer'), scrim: $('#scrim'), toasts: $('#toasts')
  };

  const S = {
    key: '', orders: [], loaded: false, today: '', serverSkew: 0, lastSync: 0, busy: false, failing: false,
    period: localStorage.getItem(LS_PERIOD) || 'today', status: 'all', q: '', from: '', to: '', sort: 'new', page: 0,
    open: null, pending: {}, seen: readSeen(), freshIds: new Set()
  };

  // ---------- utils ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function dh(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0DH'; }
  function num(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
  function dayOf(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  function hm(ms) { return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); }
  function now() { return Date.now() + S.serverSkew; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function wa212(tel) {
    let d = digits(tel);
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('212')) return d;
    if (d.startsWith('0')) return '212' + d.slice(1);
    if (d.length === 9) return '212' + d;
    return d;
  }
  function split(s) { return String(s || '').split(' / '); }
  function readSeen() { try { const v = JSON.parse(localStorage.getItem(LS_SEEN) || 'null'); return v && typeof v.ts === 'number' ? v : null; } catch (e) { return null; } }
  function saveSeen() { try { localStorage.setItem(LS_SEEN, JSON.stringify(S.seen)); } catch (e) {} }

  // ---------- API ----------
  class ApiError extends Error { constructor(code, data) { super(code); this.code = code; this.data = data || {}; } }
  async function api(action, extra) {
    const url = endpoint();
    if (!url) throw new ApiError('no_endpoint');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    let res, text;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, key: S.key }, extra || {})),
        redirect: 'follow', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal });
      text = await res.text();
    } catch (e) {
      throw new ApiError(e && e.name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(t); }
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new ApiError(/<html|<!doctype/i.test(text || '') ? 'html' : (res.ok ? 'bad_reply' : 'http_' + res.status));
    }
    // The new script always answers with a known admin error code or `version`; anything else
    // (e.g. the old script's {ok:false,error:'missing fields'} or {ok:true,service:…}) means old code.
    const KNOWN = ['bad_key', 'locked', 'no_admin_key', 'bad_action', 'server', 'not_found', 'bad_status', 'busy'];
    if (!data || typeof data !== 'object') throw new ApiError('bad_reply');
    if (data.ok !== true) {
      const err = data.error;
      if (KNOWN.indexOf(err) >= 0) throw new ApiError(err, data);
      if (!data.version) throw new ApiError('old_script', data);
      throw new ApiError(err || 'unknown', data);
    }
    if (!data.version && (action === 'auth' || action === 'list' || action === 'stats' || data.service)) throw new ApiError('old_script', data);
    return data;
  }
  function errText(e) {
    const c = e && e.code;
    switch (c) {
      case 'bad_key': return 'Clé incorrecte.' + (e.data.left != null ? ' Encore ' + e.data.left + ' essai' + (e.data.left > 1 ? 's' : '') + ' avant un blocage de 15 minutes.' : '');
      case 'locked': return 'Trop de tentatives, réessayez dans ' + Math.max(1, Math.ceil((e.data.retryIn || 900) / 60)) + ' min.';
      case 'no_admin_key': return (e.data.reason === 'short' ? 'Clé admin trop courte dans les Propriétés du script (' + (e.data.min || 8) + ' caractères minimum).' : 'Clé admin non configurée dans les Propriétés du script.') + ' Apps Script › Paramètres du projet › Propriétés du script : ADMIN_KEY (' + (e.data.min || 8) + ' caractères minimum).';
      case 'old_script': return 'Script pas à jour : l\'adresse répond encore avec l\'ancien code (sans admin). Collez le nouveau order-apps-script.gs dans Apps Script, enregistrez, puis Déployer › Gérer les déploiements › crayon › Version : Nouvelle version › Déployer.';
      case 'html': return 'Google demande une connexion : le déploiement doit être « Qui a accès : Tout le monde ».';
      case 'network': return 'Réseau indisponible ou script injoignable. Vérifiez la connexion internet.';
      case 'timeout': return 'Google ne répond pas (délai dépassé). Réessayez.';
      case 'not_found': return 'Commande introuvable dans la feuille.';
      case 'bad_status': return 'Statut refusé par le script.';
      case 'no_endpoint': return 'Adresse du script manquante dans assets/admin.js (ADMIN_ENDPOINT).';
      case 'server': return 'Erreur du script Google : ' + (e.data.detail || '');
      default: return 'Erreur : ' + (c || 'inconnue');
    }
  }

  // ---------- toasts ----------
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.setAttribute('role', err ? 'alert' : 'status');
    t.textContent = msg;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, err ? 6000 : 3200);
  }

  // ---------- session ----------
  function storedKey() { return sessionStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY) || ''; }
  function keepKey(k, remember) {
    try { sessionStorage.setItem(LS_KEY, k); if (remember) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY); } catch (e) {}
  }
  function dropKey() { try { sessionStorage.removeItem(LS_KEY); localStorage.removeItem(LS_KEY); } catch (e) {} }

  function showLogin(msg) {
    stopTimer(); closeDrawer(true);
    el.app.hidden = true; el.login.hidden = false;
    el.loginErr.hidden = !msg; el.loginErr.textContent = msg || '';
    el.loginKey.value = ''; el.loginBtn.disabled = false; el.loginBtn.textContent = 'Se connecter';
    document.title = 'Admin · Commandes — Knockout Boxing Gear';
    setTimeout(() => el.loginKey.focus(), 30);
  }
  el.loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const k = el.loginKey.value.trim();
    if (!k) { el.loginErr.hidden = false; el.loginErr.textContent = 'Entrez la clé admin.'; return; }
    el.loginBtn.disabled = true; el.loginBtn.textContent = 'Vérification…'; el.loginErr.hidden = true;
    S.key = k;
    try {
      await api('auth');
      keepKey(k, el.loginRemember.checked);
      el.loginKey.value = '';
      startApp();
    } catch (e) {
      S.key = '';
      el.loginErr.hidden = false; el.loginErr.textContent = errText(e);
      el.loginBtn.disabled = false; el.loginBtn.textContent = 'Se connecter';
      el.loginKey.select();
    }
  });
  el.logout.addEventListener('click', () => { dropKey(); S.key = ''; S.orders = []; S.loaded = false; showLogin(''); });

  // ---------- data ----------
  async function load(manual) {
    if (S.busy) return;
    S.busy = true; setSync('busy'); el.refresh.classList.add('spin');
    try {
      const d = await api('list');
      S.serverSkew = (Number(d.now) || Date.now()) - Date.now();
      S.today = d.today || dayOf(now());
      const prevIds = new Set(S.orders.map((o) => o.id));
      const wasLoaded = S.loaded;
      const list = (d.orders || []).map((o) => {
        const p = S.pending[o.id];
        return p ? Object.assign(o, { statut: p.to }) : o;
      });
      S.orders = list;
      if (!S.seen) { S.seen = { ts: list.reduce((m, o) => Math.max(m, o.ts || 0), 0), ids: [] }; saveSeen(); }
      const fresh = list.filter((o) => isNew(o) && (!wasLoaded || !prevIds.has(o.id)));
      if (wasLoaded && fresh.length) toast(fresh.length === 1 ? 'Nouvelle commande : ' + fresh[0].id + ' — ' + fresh[0].nom : fresh.length + ' nouvelles commandes');
      S.loaded = true; S.failing = false; S.lastSync = Date.now();
      render();
      if (S.open) { const o = byId(S.open); if (o) renderDrawer(o, true); }
      setSync('ok');
      if (manual) toast('Commandes à jour (' + list.length + ')');
    } catch (e) {
      if (e.code === 'bad_key' || e.code === 'locked' || e.code === 'no_admin_key') { dropKey(); S.key = ''; showLogin(errText(e)); }
      else { S.failing = true; setSync('err', errText(e)); if (manual || !S.loaded) toast(errText(e), true); if (!S.loaded) renderEmptyError(errText(e)); }
    } finally { S.busy = false; el.refresh.classList.remove('spin'); }
  }
  function setSync(kind, msg) {
    el.sync.classList.toggle('is-err', kind === 'err');
    el.sync.classList.toggle('is-busy', kind === 'busy');
    if (kind === 'busy') el.syncTxt.textContent = S.loaded ? 'Actualisation…' : 'Chargement…';
    else if (kind === 'ok') el.syncTxt.textContent = 'À jour · ' + hm(Date.now()) + ' · auto 60 s';
    else el.syncTxt.textContent = (S.lastSync ? 'Hors ligne depuis ' + hm(S.lastSync) + ' · ' : '') + (msg || 'Erreur');
    el.sync.title = el.syncTxt.textContent;
  }
  const byId = (id) => S.orders.find((o) => o.id === id);
  function isNew(o) { return S.seen && o.ts > S.seen.ts && S.seen.ids.indexOf(o.id) < 0; }
  function markSeen(id) {
    if (!S.seen) return;
    if (id) { if (S.seen.ids.indexOf(id) < 0) { S.seen.ids.push(id); S.seen.ids = S.seen.ids.slice(-300); } }
    else { S.seen = { ts: S.orders.reduce((m, o) => Math.max(m, o.ts || 0), S.seen.ts), ids: [] }; }
    saveSeen();
  }

  // ---------- filters ----------
  function inPeriod(o, p) {
    if (p === 'today') return o.day === S.today;
    if (p === '7d') return o.ts && o.ts >= now() - 7 * 864e5;
    if (p === '30d') return o.ts && o.ts >= now() - 30 * 864e5;
    return true;
  }
  function matchBase(o) {
    if (S.from && (!o.day || o.day < S.from)) return false;
    if (S.to && (!o.day || o.day > S.to)) return false;
    if (S.q) {
      const q = norm(S.q), qd = digits(S.q);
      const hay = norm([o.id, o.nom, o.ville, o.articles, o.couleur, o.taille, o.promo, o.note].join(' '));
      const words = q.split(/\s+/).filter(Boolean);
      const textOk = words.every((w) => hay.indexOf(w) >= 0);
      const telOk = qd.length >= 3 && /^[\d\s+().-]+$/.test(S.q) && (digits(o.tel).indexOf(qd) >= 0 || wa212(o.tel).indexOf(qd) >= 0);
      if (!textOk && !telOk) return false;
    }
    return true;
  }
  function filtered() {
    const base = S.orders.filter(matchBase);
    const list = S.status === 'all' ? base : S.status === 'new' ? base.filter(isNew) : base.filter((o) => o.statut === S.status);
    const cmp = {
      new: (a, b) => (b.ts - a.ts) || (b.row - a.row), old: (a, b) => (a.ts - b.ts) || (a.row - b.row),
      tdesc: (a, b) => b.total - a.total, tasc: (a, b) => a.total - b.total,
      name: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
      status: (a, b) => (STATUSES.indexOf(a.statut) - STATUSES.indexOf(b.statut)) || (b.ts - a.ts)
    }[S.sort];
    return { base: base, list: list.slice().sort(cmp) };
  }

  // ---------- stats (same math as stats_ in order-apps-script.gs) ----------
  function stats(p) {
    const list = S.orders.filter((o) => inPeriod(o, p));
    const by = {}; STATUSES.forEach((s) => (by[s] = 0));
    let due = 0, paid = 0;
    list.forEach((o) => {
      by[o.statut] = (by[o.statut] || 0) + 1;
      if (o.statut === 'Livrée') paid += o.total;
      else if (o.statut !== 'Annulée' && o.statut !== 'Retournée') due += o.total;
    });
    return { commandes: list.length, aConfirmer: by['Nouvelle'], enCours: by['Confirmée'] + by['Expédiée'], livrees: by['Livrée'], caAEncaisser: due, caEncaisse: paid, by: by };
  }

  // ---------- render ----------
  const PERIOD_LBL = { today: "aujourd'hui", '7d': '7 derniers jours', '30d': '30 derniers jours', all: 'depuis le début' };
  function render() {
    // period tabs
    el.period.querySelectorAll('button').forEach((b) => { const on = b.dataset.p === S.period; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    // KPIs
    const st = stats(S.period), todayN = S.orders.filter((o) => o.day === S.today).length;
    const lbl = PERIOD_LBL[S.period];
    el.kpis.innerHTML = [
      '<div class="kpi dark"><span class="kpi-l">Commandes</span><span class="kpi-v">' + st.commandes + '</span><span class="kpi-s">' + esc(lbl) + (S.period === 'today' ? '' : ' · ' + todayN + " aujourd'hui") + '</span></div>',
      '<button type="button" class="kpi" data-go="Nouvelle"><i class="kpi-dot" data-s="Nouvelle"></i><span class="kpi-l">À confirmer</span><span class="kpi-v">' + st.aConfirmer + '</span><span class="kpi-s">statut Nouvelle</span></button>',
      '<button type="button" class="kpi" data-go="Confirmée"><i class="kpi-dot" data-s="Expédiée"></i><span class="kpi-l">En cours</span><span class="kpi-v">' + st.enCours + '</span><span class="kpi-s">' + st.by['Confirmée'] + ' confirmée' + (st.by['Confirmée'] > 1 ? 's' : '') + ' · ' + st.by['Expédiée'] + ' expédiée' + (st.by['Expédiée'] > 1 ? 's' : '') + '</span></button>',
      '<button type="button" class="kpi" data-go="Livrée"><i class="kpi-dot" data-s="Livrée"></i><span class="kpi-l">Livrées</span><span class="kpi-v">' + st.livrees + '</span><span class="kpi-s">' + (st.by['Annulée'] + st.by['Retournée']) + ' annulée(s) / retournée(s)</span></button>',
      '<div class="kpi red"><span class="kpi-l">CA à encaisser</span><span class="kpi-v">' + num(st.caAEncaisser) + '<small>DH</small></span><span class="kpi-s">nouvelles + confirmées + expédiées</span></div>',
      '<div class="kpi"><span class="kpi-l">CA encaissé</span><span class="kpi-v">' + num(st.caEncaisse) + '<small>DH</small></span><span class="kpi-s">commandes livrées</span></div>'
    ].join('');
    // chips
    const f = filtered();
    const cnt = {}; STATUSES.forEach((s) => (cnt[s] = 0));
    f.base.forEach((o) => (cnt[o.statut] = (cnt[o.statut] || 0) + 1));
    const newN = S.orders.filter(isNew).length;
    const chip = (v, label, n) => '<button type="button" role="tab" class="chip' + (S.status === v ? ' on' : '') + '" data-st="' + esc(v) + '" aria-selected="' + (S.status === v) + '"' +
      (v === 'new' ? ' data-s="Nouvelle"' : ' data-s="' + esc(v) + '"') + '><i></i>' + esc(label) + ' <b>' + n + '</b></button>';
    el.chips.innerHTML = chip('all', 'Toutes', f.base.length) + (newN ? chip('new', 'Non vues', f.base.filter(isNew).length) : '') + STATUSES.map((s) => chip(s, s, cnt[s])).join('');
    // badge + title
    el.newBadge.hidden = !newN;
    el.newBadge.textContent = newN + ' nouvelle' + (newN > 1 ? 's' : '');
    el.newBadge.title = 'Afficher les commandes non vues';
    document.title = (newN ? '(' + newN + ') ' : '') + 'Admin · Commandes — Knockout Boxing Gear';
    // rows
    const pages = Math.max(1, Math.ceil(f.list.length / PAGE));
    if (S.page >= pages) S.page = pages - 1;
    const slice = f.list.slice(S.page * PAGE, S.page * PAGE + PAGE);
    el.rows.innerHTML = slice.map(rowHtml).join('');
    el.empty.hidden = !!slice.length;
    if (!slice.length) el.empty.innerHTML = S.orders.length ? '<strong>Aucun résultat</strong>Aucune commande ne correspond aux filtres.' : '<strong>Aucune commande</strong>Les commandes du site apparaîtront ici.';
    el.pager.innerHTML = '<span>' + (f.list.length ? (S.page * PAGE + 1) + '–' + (S.page * PAGE + slice.length) + ' sur ' + f.list.length : '0') + ' commande' + (f.list.length > 1 ? 's' : '') +
      (f.list.length !== S.orders.length ? ' (filtrées, ' + S.orders.length + ' au total)' : '') + '</span>' +
      (pages > 1 ? '<span class="pg"><button type="button" class="btn btn-ghost-d" data-pg="-1"' + (S.page ? '' : ' disabled') + '>‹ Préc.</button><button type="button" class="btn btn-ghost-d" data-pg="1"' + (S.page < pages - 1 ? '' : ' disabled') + '>Suiv. ›</button></span>' : '');
  }
  function rowHtml(o) {
    const n = split(o.articles).length;
    const acts = (NEXT[o.statut] || []).map((a) => '<button type="button" class="qbtn' + (a[2] ? ' x' : '') + '" data-to="' + esc(a[1]) + '"' + (S.pending[o.id] ? ' disabled' : '') + '>' + esc(a[0]) + '</button>').join('');
    return '<tr data-id="' + esc(o.id) + '" class="' + (isNew(o) ? 'is-new' : '') + (S.open === o.id ? ' is-open' : '') + '" tabindex="0">' +
      '<td class="c-id">' + esc(o.id) + (isNew(o) ? '<span class="new-tag">Nouveau</span>' : '') + '<span class="c-date-m">' + esc(o.recu) + '</span></td>' +
      '<td class="c-date">' + esc(o.recu) + '</td>' +
      '<td class="c-name">' + esc(o.nom) + '</td>' +
      '<td class="c-tel">' + esc(o.tel) + '</td>' +
      '<td class="c-city">' + esc(o.ville) + '</td>' +
      '<td class="c-art"><span>' + esc(o.articles) + (n > 1 || o.nb > 1 ? ' <em>· ' + o.nb + ' art.</em>' : '') + '</span></td>' +
      '<td class="num c-tot">' + dh(o.total) + '</td>' +
      '<td class="c-st"><span class="pill' + (S.pending[o.id] ? ' pending' : '') + '" data-s="' + esc(o.statut) + '">' + esc(o.statut) + '</span></td>' +
      '<td class="c-act"><span class="qa">' + acts + '</span></td></tr>';
  }
  function renderEmptyError(msg) {
    el.rows.innerHTML = '';
    el.empty.hidden = false;
    el.empty.innerHTML = '<strong>Chargement impossible</strong>' + esc(msg);
  }
  function skeleton() {
    el.rows.innerHTML = Array.from({ length: 8 }, () => '<tr class="skel">' + '<td></td>'.repeat(9) + '</tr>').join('');
    el.kpis.innerHTML = Array.from({ length: 6 }, () => '<div class="kpi"><span class="kpi-l">&nbsp;</span><span class="kpi-v">–</span><span class="kpi-s">&nbsp;</span></div>').join('');
  }

  // ---------- drawer ----------
  let lastFocus = null;
  function openDrawer(id) {
    const o = byId(id); if (!o) return;
    if (!S.open) lastFocus = document.activeElement;
    S.open = id;
    if (isNew(o)) { markSeen(id); }
    renderDrawer(o);
    el.drawer.hidden = false; el.scrim.hidden = false; document.body.classList.add('no-scroll');
    el.drawer.scrollTop = 0;
    el.drawer.focus({ preventScroll: true });
    render();
  }
  function closeDrawer(silent) {
    if (!S.open && el.drawer.hidden) return;
    S.open = null;
    el.drawer.hidden = true; el.scrim.hidden = true; document.body.classList.remove('no-scroll');
    if (!silent) { render(); if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); }
  }
  function waText(o) {
    return 'Bonjour ' + o.nom + ', merci pour votre commande ' + o.id + ' chez Knockout Boxing Gear : ' + itemsText(o) + ' — total ' + dh(o.total).replace(/\u00a0/g, ' ') +
      ' à payer à la livraison. Pouvez-vous confirmer votre commande et votre adresse de livraison à ' + o.ville + ' ? Merci !';
  }
  function items(o) {
    const n = split(o.articles), t = split(o.taille), c = split(o.couleur);
    return n.map((name, i) => {
      const m = name.match(/^(.*?)\s+[x×]\s*(\d+)$/);
      return { name: m ? m[1] : name, qty: m ? +m[2] : 1, size: (t[i] || '').trim(), colour: (c[i] || '').trim() };
    }).filter((x) => x.name);
  }
  function itemsText(o) {
    return items(o).map((it) => it.name + (it.size ? ' ' + it.size : '') + (it.colour ? ' ' + it.colour : '') + (it.qty > 1 ? ' ×' + it.qty : '')).join(', ');
  }
  function histHtml(o) {
    const h = (o.hist && o.hist.length ? o.hist : [{ at: o.recu, to: 'Nouvelle', by: 'site' }]).slice().reverse();
    return h.map((x) => {
      const s = x.to && STATUSES.indexOf(x.to) >= 0 ? x.to : '';
      const txt = x.note ? esc(x.note) : x.by === 'site' ? 'Commande reçue du site' : (x.from ? esc(x.from) + ' → ' : '') + '<b>' + esc(x.to) + '</b>';
      return '<li' + (s ? ' data-s="' + esc(s) + '" ' : '') + '><span>' + txt + '</span><time>' + esc(x.at || '') + '</time></li>';
    }).join('');
  }
  function renderDrawer(o, fromRefresh) {
    const ta = el.drawer.querySelector('textarea');
    const editing = fromRefresh && ta && (document.activeElement === ta || ta.value !== ta.defaultValue);
    const draft = editing ? ta.value : null;
    const its = items(o);
    const disc = Math.round(o.sousTotal * (o.remise || 0) / 100);
    const tel = digits(o.tel);
    el.drawer.innerHTML =
      '<div class="d-card d-head"><div class="d-row"><div><div class="d-id">' + esc(o.id) + ' · ' + esc(o.recu) + '</div><h2 class="d-name" id="dTitle">' + esc(o.nom) + '</h2></div>' +
        '<button type="button" class="d-close" data-close aria-label="Fermer (Échap)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>' +
        '<div class="d-row"><span class="d-meta">' + esc(o.tel) + ' · ' + esc(o.ville) + '</span><span class="pill' + (S.pending[o.id] ? ' pending' : '') + '" data-s="' + esc(o.statut) + '">' + esc(o.statut) + '</span></div>' +
        '<div class="d-contact"><a class="btn btn-white" href="tel:' + esc(tel) + '">Appeler</a>' +
        '<a class="btn btn-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + esc(wa212(o.tel)) + '?text=' + encodeURIComponent(waText(o)) + '">WhatsApp</a>' +
        '<button type="button" class="btn btn-ghost" data-copy="' + esc(o.tel) + '">Copier le n°</button></div></div>' +
      '<div class="d-card"><span class="d-h">Statut</span><div class="d-status">' +
        STATUSES.map((s) => '<button type="button" class="sbtn' + (s === o.statut ? ' on' : '') + '" data-s="' + esc(s) + '" data-to="' + esc(s) + '" aria-pressed="' + (s === o.statut) + '"' + (S.pending[o.id] ? ' disabled' : '') + '>' + esc(s) + '</button>').join('') +
      '</div></div>' +
      '<div class="d-card"><span class="d-h">Articles (' + o.nb + ')</span><div class="items">' +
        its.map((it) => '<div class="item"><b>' + esc(it.name) + '</b><b>' + (it.qty > 1 ? '× ' + it.qty : '') + '</b><span>' + [it.size && 'Taille ' + esc(it.size), it.colour && 'Couleur ' + esc(it.colour)].filter(Boolean).join(' · ') + '</span></div>').join('') +
      '</div><div class="tots"><div><span>Sous-total</span><span>' + dh(o.sousTotal) + '</span></div>' +
        (o.remise ? '<div><span>Remise ' + esc(o.promo || '') + ' (' + o.remise + ' %)</span><span>− ' + dh(disc) + '</span></div>' : '') +
        '<div><span>Livraison</span><span>' + (o.livraison ? dh(o.livraison) : 'Offerte') + '</span></div>' +
        '<div class="grand"><span>Total à encaisser</span><span>' + dh(o.total) + '</span></div></div></div>' +
      '<div class="d-card note"><div class="d-row"><span class="d-h">Note interne</span><small>' + (o.maj ? 'Mis à jour le ' + esc(o.maj) : '') + '</small></div>' +
        '<textarea id="noteTa" maxlength="1000" placeholder="Ex. rappeler après 18 h, adresse précise…">' + esc(o.note) + '</textarea>' +
        '<div class="d-row"><small>Visible uniquement dans l\'admin et l\'onglet Gestion.</small><button type="button" class="btn btn-dark" data-note>Enregistrer la note</button></div></div>' +
      '<div class="d-card"><span class="d-h">Historique</span><ul class="hist">' + histHtml(o) + '</ul></div>' +
      '<div class="d-card"><span class="d-h">Ligne de la feuille « Commandes » (14 colonnes)</span><dl class="fields">' +
        [['Reçue le', o.recu], ['N° commande', o.id], ['Nom', o.nom], ['Téléphone', o.tel], ['Ville', o.ville], ['Articles', o.articles, 1], ['Taille', o.taille], ['Couleur', o.couleur],
         ['Nb articles', o.nb], ['Sous-total (DH)', o.sousTotal], ['Code promo', o.promo || '—'], ['Remise (%)', o.remise], ['Livraison (DH)', o.livraison], ['Total (DH)', o.total]]
          .map((f) => '<div' + (f[2] ? ' class="wide"' : '') + '><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('') +
      '</dl></div>';
    if (draft != null) { const nt = el.drawer.querySelector('textarea'); nt.value = draft; }
  }

  // ---------- actions ----------
  async function setStatus(id, to) {
    const o = byId(id);
    if (!o || o.statut === to || S.pending[id]) return;
    const prev = { statut: o.statut, hist: o.hist, maj: o.maj };
    S.pending[id] = { to: to };
    o.statut = to;
    o.hist = (o.hist || []).concat([{ at: '…', from: prev.statut, to: to }]);
    render(); if (S.open === id) renderDrawer(o);
    try {
      const d = await api('update', { id: id, status: to });
      delete S.pending[id];
      const cur = byId(id);
      if (cur) Object.assign(cur, d.order);
      toast(id + ' → ' + to);
    } catch (e) {
      delete S.pending[id];
      const cur = byId(id);
      if (cur) Object.assign(cur, prev);
      toast('Échec, statut rétabli (' + prev.statut + '). ' + errText(e), true);
      if (e.code === 'bad_key' || e.code === 'locked') { dropKey(); showLogin(errText(e)); return; }
    }
    render(); const cur = byId(id); if (S.open === id && cur) renderDrawer(cur);
  }
  async function saveNote(id) {
    const o = byId(id); const ta = el.drawer.querySelector('textarea'); const btn = el.drawer.querySelector('[data-note]');
    if (!o || !ta) return;
    const note = ta.value.trim();
    if (note === (o.note || '')) { toast('Note inchangée'); return; }
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const d = await api('update', { id: id, note: note });
      Object.assign(o, d.order);
      toast('Note enregistrée · ' + id);
      if (S.open === id) renderDrawer(o);
    } catch (e) {
      toast('Note non enregistrée. ' + errText(e), true);
      btn.disabled = false; btn.textContent = 'Enregistrer la note';
    }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove();
    }
    toast('Numéro copié : ' + text);
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                    // no formulas when opened in Excel / Sheets
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    const list = filtered().list;
    if (!list.length) { toast('Rien à exporter', true); return; }
    const head = ['Reçue le', 'N° commande', 'Nom', 'Téléphone', 'Ville', 'Articles', 'Taille', 'Couleur', 'Nb articles', 'Sous-total (DH)', 'Code promo', 'Remise (%)', 'Livraison (DH)', 'Total (DH)', 'Statut', 'Note interne', 'Mis à jour le'];
    const lines = [head].concat(list.map((o) => [o.recu, o.id, o.nom, o.tel, o.ville, o.articles, o.taille, o.couleur, o.nb, o.sousTotal, o.promo, o.remise, o.livraison, o.total, o.statut, o.note, o.maj]));
    const csv = '\ufeff' + lines.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'commandes-kobg-' + dayOf(now()) + (S.status !== 'all' ? '-' + norm(S.status) : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(list.length + ' commande' + (list.length > 1 ? 's' : '') + ' exportée' + (list.length > 1 ? 's' : '') + ' (CSV)');
  }

  // ---------- events ----------
  el.period.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; S.period = b.dataset.p; try { localStorage.setItem(LS_PERIOD, S.period); } catch (x) {} render(); });
  el.kpis.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return;
    S.status = b.dataset.go === 'Confirmée' ? 'Confirmée' : b.dataset.go; S.page = 0; render();
    document.querySelector('.board').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  el.chips.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; S.status = b.dataset.st; S.page = 0; render(); });
  el.newBadge.addEventListener('click', () => { S.status = 'new'; S.sort = 'new'; el.sort.value = 'new'; S.page = 0; render(); });
  let qT;
  el.q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { S.q = el.q.value.trim(); S.page = 0; render(); }, 120); });
  el.from.addEventListener('change', () => { S.from = el.from.value; S.page = 0; render(); });
  el.to.addEventListener('change', () => { S.to = el.to.value; S.page = 0; render(); });
  el.sort.addEventListener('change', () => { S.sort = el.sort.value; S.page = 0; render(); });
  el.reset.addEventListener('click', () => { S.q = S.from = S.to = ''; S.status = 'all'; S.sort = 'new'; S.page = 0; el.q.value = el.from.value = el.to.value = ''; el.sort.value = 'new'; markSeen(); render(); });
  el.csv.addEventListener('click', exportCsv);
  el.refresh.addEventListener('click', () => load(true));
  el.pager.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; S.page += +b.dataset.pg; render(); el.table.scrollIntoView({ block: 'nearest' }); });
  el.rows.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const q = e.target.closest('[data-to]');
    if (q) { e.stopPropagation(); setStatus(tr.dataset.id, q.dataset.to); return; }
    openDrawer(tr.dataset.id);
  });
  el.rows.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-id]')) { e.preventDefault(); openDrawer(e.target.dataset.id); } });
  el.scrim.addEventListener('click', () => closeDrawer());
  el.drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeDrawer();
    const s = e.target.closest('[data-to]'); if (s && S.open) return setStatus(S.open, s.dataset.to);
    if (e.target.closest('[data-note]') && S.open) return saveNote(S.open);
    const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
  });
  document.addEventListener('keydown', (e) => {
    if (el.app.hidden) return;
    if (e.key === 'Escape') { if (S.open) { e.preventDefault(); closeDrawer(); } return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); el.q.focus(); el.q.select(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); load(true); }
  });

  // ---------- auto refresh ----------
  let timer = null;
  function startTimer() { stopTimer(); timer = setInterval(() => { if (!document.hidden && !el.app.hidden) load(false); }, REFRESH_MS); }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !el.app.hidden && S.key && Date.now() - S.lastSync > REFRESH_MS) load(false); });

  function startApp() {
    el.login.hidden = true; el.app.hidden = false;
    if (!S.loaded) skeleton();
    render(); load(false); startTimer();
  }

  // ---------- boot ----------
  S.key = storedKey();
  if (S.key) startApp(); else showLogin('');

  window.__kobgAdmin = { get orders() { return S.orders; }, get view() { return { status: S.status, q: S.q, period: S.period, page: S.page, open: S.open }; }, reload: load, stats: stats, filtered: filtered, wa212: wa212 };    // for tests / console
})();
