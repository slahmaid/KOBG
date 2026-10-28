// compte.html: sign in, create an account, forgotten / new password, then the customer area
// (orders with their status, delivery details, password, sign out). Uses window.KOBGAccount from script.js.
(() => {
  'use strict';
  // never usable inside a frame (clickjacking): GitHub Pages can't send X-Frame-Options / frame-ancestors
  if (window.top !== window.self) { document.body.textContent = ''; return; }
  const A = window.KOBGAccount;
  const root = document.querySelector('[data-account]');
  if (!A || !root) return;
  const $ = (id) => document.getElementById(id);
  const live = $('acctLive');
  const say = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 60); };

  // the reset token arrives in the link's #fragment (never sent to a server); removed from the address bar at once
  let resetToken = '';
  const takeReset = () => {
    const m = /(?:^#|&)reset=(k1\.[A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash);
    if (!m) return false;
    resetToken = m[1];
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  };
  takeReset();
  // after signing in: back to the page that sent us here (same site, a plain page name only)
  const retour = (() => {
    const r = new URLSearchParams(location.search).get('retour') || '';
    return /^[a-z0-9-]{1,80}\.html$/.test(r) && r !== 'compte.html' ? r : '';
  })();

  // ---------- validation (same rules as the server) ----------
  const EMAIL = /^[^\s@<>()[\]\\,;:"']{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const RULES = {
    email: (v) => (!v.trim() ? 'Indiquez votre e-mail.' : EMAIL.test(v.trim()) ? '' : 'E-mail invalide (exemple : nom@gmail.com).'),
    nom: (v) => (v.trim().length < 3 || !/\p{L}.*\p{L}/u.test(v) ? 'Indiquez votre nom complet.' : ''),
    telephone: (v) => (!A.normPhone(v) ? 'Indiquez votre numéro de téléphone.'
      : A.phoneOK(v) ? '' : 'Numéro invalide : 06 ou 07 suivi de 8 chiffres (ou +212 6… / +212 7…).'),
    ville: (v) => (v.trim() && (v.trim().length < 2 || !/\p{L}/u.test(v)) ? 'Ville invalide.' : ''),
    adresse: (v) => (v.trim().length > 200 ? '200 caractères maximum.' : ''),
    password: (v, form) => {
      if (form.id === 'loginForm') return v ? '' : 'Indiquez votre mot de passe.';
      if (v.length < 8) return '8 caractères minimum.';
      if (v.length > 128) return '128 caractères maximum.';
      return '';
    },
    password2: (v, form) => (v === form.elements.password.value ? '' : 'Les deux mots de passe ne correspondent pas.'),
    current: (v) => (v ? '' : 'Indiquez votre mot de passe actuel.'),
  };
  function wire(form, onSubmit, label) {
    const submit = form.querySelector('.cod-submit');
    const txt = submit.querySelector('.cod-submit-txt');
    const alertEl = form.querySelector('.cod-alert');
    const okEl = form.querySelector('.acct-ok');
    const fields = [...form.elements].filter((el) => RULES[el.name] && el.id);
    const setErr = (el, msg) => {
      const err = $(`${el.id}Err`);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      el.closest('.cod-field')?.classList.toggle('is-error', !!msg);
      if (err) { err.textContent = msg; err.hidden = !msg; }
    };
    const check = (el) => { const msg = RULES[el.name](el.value, form); setErr(el, msg); return !msg; };
    const ui = {
      alert(msg) { alertEl.textContent = msg || ''; alertEl.hidden = !msg; if (msg && okEl) okEl.hidden = true; },
      ok(msg) { if (!okEl) return; okEl.textContent = msg || ''; okEl.hidden = !msg; if (msg) alertEl.hidden = true; },
      field(name, msg) { const el = form.elements[name]; if (el && el.id) { setErr(el, msg); el.focus(); } },
      reset() { fields.forEach((el) => setErr(el, '')); ui.alert(''); ui.ok(''); },
    };
    fields.forEach((el) => {
      el.addEventListener('blur', () => {
        if (el.name === 'telephone' && A.phoneOK(el.value)) el.value = A.phonePretty(el.value);
        if (el.value.trim() || el.getAttribute('aria-invalid') === 'true') check(el);
      });
      el.addEventListener('input', () => {
        if (el.getAttribute('aria-invalid') !== 'true') return;
        check(el);
        // last red field fixed: the "fix the fields" banner goes too
        if (!form.querySelector('[aria-invalid="true"]')) ui.alert('');
      });
    });
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      ui.alert(''); ui.ok('');
      const bad = fields.filter((el) => !check(el));
      if (bad.length) {
        ui.alert(bad.length > 1 ? 'Merci de compléter les champs indiqués en rouge.' : 'Merci de corriger le champ indiqué en rouge.');
        bad[0].focus();
        return;
      }
      if (!A.available()) { ui.alert(A.errors.unavailable); return; }
      busy = true;
      submit.disabled = true; submit.classList.add('is-loading'); submit.setAttribute('aria-busy', 'true');
      txt.textContent = 'Un instant…';
      const v = (n) => String(form.elements[n]?.value || '').trim().replace(/[ \t]+/g, ' ');
      try { await onSubmit(v, ui, form); } finally {
        busy = false;
        submit.disabled = false; submit.classList.remove('is-loading'); submit.setAttribute('aria-busy', 'false');
        txt.textContent = label;
      }
    });
    return ui;
  }
  // server refusal -> the right field in red, or a message
  function refuse(res, ui) {
    if (res.error === 'bad_field' && res.field) ui.field(res.field, 'Vérifiez ce champ.');
    else if (res.error === 'weak_password') ui.field('password', 'Mot de passe trop faible.');
    else if (res.error === 'bad_password') ui.field('current', 'Mot de passe incorrect.');
    ui.alert(A.message(res));
  }

  // show / hide password
  root.querySelectorAll('.acct-eye').forEach((b) => b.addEventListener('click', () => {
    const input = $(b.getAttribute('aria-controls'));
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    input.focus();
  }));

  // ---------- views ----------
  const guest = $('acctGuest'), dash = $('acctDash'), tabs = $('acctTabs');
  const forms = { login: $('loginForm'), signup: $('signupForm'), forgot: $('forgotForm'), reset: $('resetForm') };
  const tabOf = { login: $('tabLogin'), signup: $('tabSignup') };
  const title = $('acctTitle'), lead = $('acctLead'), tag = $('acctTag');
  const LEAD = lead.textContent;
  function show(view, focus) {
    const s = A.store.read();
    const inDash = view === 'dash';
    guest.hidden = inDash; dash.hidden = !inDash;
    Object.entries(forms).forEach(([k, f]) => { f.hidden = k !== view; });
    tabs.hidden = !(view === 'login' || view === 'signup');
    Object.entries(tabOf).forEach(([k, t]) => {
      t.setAttribute('aria-selected', String(k === view));
      t.tabIndex = k === view ? 0 : -1;
    });
    if (inDash && s) {
      tag.textContent = 'Espace client';
      title.textContent = A.firstName(s.profile.nom) ? `Bonjour ${A.firstName(s.profile.nom)}` : 'Mon compte';
      lead.textContent = 'Suivez vos commandes et gardez vos coordonnées à jour : elles sont pré-remplies à votre prochaine commande.';
    } else {
      tag.textContent = 'Espace client';
      title.textContent = { signup: 'Créer un compte', forgot: 'Mot de passe oublié', reset: 'Nouveau mot de passe' }[view] || 'Mon compte';
      lead.textContent = LEAD;
    }
    document.title = `${title.textContent} — Knockout Boxing Gear`;
    if (focus) (inDash ? title : forms[view].querySelector('.cod-h') || title).focus();
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acct-view]');
    if (!b) return;
    const v = b.dataset.acctView;
    if (v === 'forgot') {
      const em = forms.login.elements.email.value.trim() || forms.signup.elements.email.value.trim();
      if (em && !forms.forgot.elements.email.value) forms.forgot.elements.email.value = em;
    }
    show(v, true);
  });
  Object.entries(tabOf).forEach(([k, t]) => {
    t.addEventListener('click', () => show(k, false));
    t.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = k === 'login' ? 'signup' : 'login';
      const go = e.key === 'Home' ? 'login' : e.key === 'End' ? 'signup' : next;
      show(go, false);
      tabOf[go].focus();
    });
  });

  async function signedIn(res, remember, msg) {
    A.store.save(res, remember);
    // a prize won on the wheel in this browser is attached to the account now (the server checks it can be)
    const claim = await A.wheel.claim(res.session);
    if (retour && !(claim && claim.ok && !claim.already)) { location.href = retour; return; }
    openDash(true, claim);
    say(claim && claim.ok && !claim.already ? `${msg} Votre lot de la Roue de la chance a été ajouté à votre compte.` : msg);
  }

  // ---------- signed out ----------
  wire(forms.login, async (v, ui, f) => {
    const res = await A.api('login', { email: v('email'), password: f.elements.password.value, remember: f.elements.remember.checked });
    if (!res.ok) { refuse(res, ui); if (res.error === 'bad_login') f.elements.password.select(); return; }
    f.reset(); ui.reset();
    await signedIn(res, f.elements.remember.checked, 'Vous êtes connecté.');
  }, 'Se connecter');

  wire(forms.signup, async (v, ui, f) => {
    const res = await A.api('register', {
      nom: v('nom'), email: v('email'), telephone: A.phoneLocal(v('telephone')), password: f.elements.password.value,
      ville: v('ville'), adresse: v('adresse'), remember: f.elements.remember.checked,
    });
    if (!res.ok) { refuse(res, ui); if (res.error === 'email_taken') ui.field('email', 'Un compte existe déjà avec cet e-mail.'); return; }
    const remember = f.elements.remember.checked;
    f.reset(); ui.reset();
    await signedIn(res, remember, 'Compte créé, vous êtes connecté.');
  }, 'Créer mon compte');

  wire(forms.forgot, async (v, ui) => {
    const res = await A.api('reset_request', { email: v('email') });
    if (!res.ok) { refuse(res, ui); return; }
    ui.ok(`Si un compte existe pour ${v('email')}, un e-mail vient de partir avec un lien valable 1 heure. Pensez à vérifier les courriers indésirables.`);
  }, 'Envoyer le lien');

  wire(forms.reset, async (v, ui, f) => {
    if (!resetToken) { ui.alert(A.errors.bad_reset); return; }
    const res = await A.api('reset_confirm', { token: resetToken, password: f.elements.password.value });
    if (!res.ok) { refuse(res, ui); return; }
    resetToken = '';
    f.reset(); ui.reset();
    await signedIn(res, true, 'Nouveau mot de passe enregistré, vous êtes connecté.');
  }, 'Enregistrer et me connecter');

  // ---------- signed in ----------
  const pf = $('profileForm');
  const pw = $('passForm');
  const fillProfile = (p) => {
    $('profileEmail').textContent = p.email || '';
    $('profileSince').textContent = p.depuis ? `Client depuis le ${p.depuis}` : 'Profil';
    pf.elements.nom.value = p.nom || '';
    pf.elements.telephone.value = p.telephone ? A.phonePretty(p.telephone) : '';
    pf.elements.adresse.value = p.adresse || '';
    pf.elements.ville.value = p.ville || '';
    pw.elements.username.value = p.email || '';
  };
  const lost = () => { show('login', true); forms.login.querySelector('.cod-alert').hidden = false; forms.login.querySelector('.cod-alert').textContent = A.errors.auth; };

  wire(pf, async (v, ui) => {
    const s = A.store.read();
    if (!s) { lost(); return; }
    const res = await A.api('update_profile', { session: s.token, nom: v('nom'), telephone: A.phoneLocal(v('telephone')), adresse: v('adresse'), ville: v('ville') });
    if (!res.ok) { if (res.error === 'auth') { lost(); return; } refuse(res, ui); return; }
    A.store.save({ profile: res.profile });
    fillProfile(res.profile);
    show('dash', false);
    ui.ok('Coordonnées enregistrées.');
  }, 'Enregistrer');

  wire(pw, async (v, ui, f) => {
    const s = A.store.read();
    if (!s) { lost(); return; }
    const res = await A.api('change_password', { session: s.token, current: f.elements.current.value, password: f.elements.password.value });
    if (!res.ok) { if (res.error === 'auth') { lost(); return; } refuse(res, ui); return; }
    f.elements.current.value = ''; f.elements.password.value = '';
    ui.ok('Mot de passe changé. Vos autres appareils ont été déconnectés.');
  }, 'Changer le mot de passe');

  async function logout(all) {
    const s = A.store.read();
    A.store.clear();
    if (s) await A.api('logout', { session: s.token, all });
    show('login', true);
    say(all ? 'Vous êtes déconnecté de tous vos appareils.' : 'Vous êtes déconnecté.');
  }
  $('logoutBtn').addEventListener('click', () => logout(false));
  $('logoutAllBtn').addEventListener('click', () => logout(true));

  // ---------- orders ----------
  const STATUS = {
    'Nouvelle': ['Reçue', 'Nous vous appelons pour confirmer.', 'new'],
    'Confirmée': ['Confirmée', 'En préparation.', 'ok'],
    'Expédiée': ['Expédiée', 'Chez le livreur : paiement à la réception.', 'ship'],
    'Livrée': ['Livrée', 'Merci pour votre confiance.', 'done'],
    'Annulée': ['Annulée', '', 'off'],
    'Retournée': ['Retournée', '', 'off'],
  };
  const STEPS = ['Nouvelle', 'Confirmée', 'Expédiée', 'Livrée'];
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  function orderHTML(o) {
    const e = A.esc;
    const st = STATUS[o.statut] || STATUS.Nouvelle;
    const at = STEPS.indexOf(o.statut);
    const when = {};
    (o.suivi || []).forEach((h) => { when[h.to] = h.at; });
    const steps = at >= 0 ? `<ol class="acct-steps" aria-label="Suivi">${STEPS.map((k, i) => `
        <li class="${i < at ? 'is-past' : i === at ? 'is-now' : ''}"${i === at ? ' aria-current="step"' : ''}><span>${e(STATUS[k][0])}</span>${when[k] ? `<small>${e(when[k])}</small>` : ''}</li>`).join('')}</ol>` : '';
    const items = (o.items || []).map((it) => `<li><span>${e(it.qty)} × ${e(it.name)}</span>${[it.colour, it.size].filter(Boolean).length ? `<small>${e([it.colour, it.size].filter(Boolean).join(' · '))}</small>` : ''}</li>`).join('');
    return `<li class="acct-order">
      <div class="acct-order-top">
        <p class="acct-order-id"><span>N°</span> <strong>${e(o.id)}</strong></p>
        <p class="acct-badge acct-badge--${st[2]}">${e(st[0])}</p>
      </div>
      <p class="acct-order-meta">${e(o.recu)} · ${e(plural(+o.nb || 0, 'article'))}${o.promo ? ` · code ${e(o.promo)}` : ''}</p>
      <ul class="acct-order-items">${items}</ul>
      ${steps}
      ${+o.points || +o.pointsEarned ? `<p class="acct-order-pts">${+o.points ? `<span>Points utilisés : -${A.formatDH(+o.points)}</span>` : ''}${+o.pointsEarned > 0 ? `<span class="is-plus">Points gagnés : +${A.formatDH(+o.pointsEarned)}</span>` : ''}</p>` : ''}
      <div class="acct-order-foot"><span>${e(st[1])}</span><strong>${A.formatDH(+o.total || 0)}</strong></div>
    </li>`;
  }

  // ---------- loyalty points ----------
  const STEP = 1500, REWARD = 50;
  function paintPoints(p) {
    if (!p) return;
    const step = +p.step || STEP, reward = +p.reward || REWARD;
    $('pointsBal').textContent = A.formatDH(Math.max(0, +p.balance || 0));
    const prog = $('pointsProg');
    prog.max = step;
    prog.value = Math.max(0, Math.min(step, +p.progress || 0));
    $('pointsNext').textContent = `Plus que ${A.formatDH(+p.next > 0 ? +p.next : step)} d’achats livrés pour gagner ${A.formatDH(reward)}.`;
  }
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${A.formatDH(Math.abs(n))}`;
  async function loadPoints() {
    const s = A.store.read();
    const list = $('pointsList'), msg = $('pointsMsg');
    if (!s) return;
    const res = await A.api('my_points', { session: s.token });
    if (!res.ok) { if (res.error === 'auth') { lost(); return; } msg.hidden = false; msg.textContent = A.message(res); return; }
    paintPoints(res.points);
    const h = Array.isArray(res.history) ? res.history : [];
    list.innerHTML = h.map((r) => `<li class="acct-pts-row">
        <span class="acct-pts-what"><strong>${A.esc(r.label)}</strong><small>${A.esc(r.at)}${r.order ? ` · ${A.esc(r.order)}` : ''}${r.type === 'gain' && +r.spend ? ` · ${A.esc(A.formatDH(+r.spend))} comptés` : ''}</small></span>
        <strong class="acct-pts-n${+r.pts > 0 ? ' is-plus' : +r.pts < 0 ? ' is-minus' : ''}">${A.esc(signed(+r.pts || 0))}</strong></li>`).join('');
    msg.hidden = h.length > 0;
    msg.textContent = 'Aucun mouvement pour l’instant : vos points apparaîtront ici dès votre première commande livrée.';
  }
  async function loadOrders() {
    const s = A.store.read();
    const list = $('ordersList'), msg = $('ordersMsg');
    if (!s) return;
    msg.hidden = false; msg.textContent = 'Chargement de vos commandes…';
    list.setAttribute('aria-busy', 'true');
    const res = await A.api('my_orders', { session: s.token });
    list.removeAttribute('aria-busy');
    if (!res.ok) { if (res.error === 'auth') { lost(); return; } msg.textContent = A.message(res); return; }
    const orders = Array.isArray(res.orders) ? res.orders : [];
    $('ordersCount').textContent = orders.length ? plural(orders.length, 'commande') : 'Commandes';
    list.innerHTML = orders.map(orderHTML).join('');
    msg.hidden = orders.length > 0;
    msg.innerHTML = 'Aucune commande pour l’instant. <a href="gants.html">Découvrir les gants</a>';
  }

  // ---------- « Roue de la chance » ----------
  const WHEEL_STATE = {
    credited: (w) => [`${w.label} crédités`, `Ajoutés à votre solde de points${w.claimed ? ` le ${w.claimed}` : ''} : à utiliser sur une prochaine commande.`],
    active: (w) => [`-${w.value} % sur votre prochaine commande`, `Valable jusqu’au ${w.until}, pour une seule commande, sur le prix des articles (hors livraison). Non cumulable avec un code promo. La remise vous est proposée automatiquement au moment de commander, une fois connecté.`],
    used: (w) => [`Remise -${w.value} % utilisée`, w.order ? `Appliquée à la commande ${w.order}.` : 'Déjà appliquée à une commande.'],
    expired: (w) => [`Remise -${w.value} % expirée`, `Elle était valable jusqu’au ${w.until}.`],
    pending: (w) => [`Cadeau : ${w.label}`, 'Notre équipe vous contacte pour convenir du modèle, de la taille et de la remise de votre cadeau (avec votre prochaine commande ou par livraison). Offert, sans frais.'],
    given: (w) => [`Cadeau : ${w.label}`, 'Votre cadeau vous a été remis. Merci et bon entraînement !'],
  };
  function paintWheel(w, claim) {
    const card = $('wheelCard'), body = $('wheelBody');
    const err = claim && !claim.ok && claim.message ? claim.message : '';
    card.hidden = !w && !err;
    if (card.hidden) return;
    let html = '';
    if (w) {
      const [h, p] = (WHEEL_STATE[w.state] || WHEEL_STATE.credited)(w);
      html = `<p class="acct-wheel-prize acct-wheel-prize--${A.esc(w.state)}"><strong>${A.esc(h)}</strong></p><p class="acct-wheel-txt">${A.esc(p)}</p>${w.state === 'active' ? '<p class="acct-wheel-cta"><a class="acct-wheel-go" href="gants.html">Choisir mes gants</a></p>' : ''}`;
    }
    if (err) html += `<p class="acct-wheel-err">${w ? 'Dernier tirage non ajouté : ' : ''}${A.esc(err)}</p>`;
    body.innerHTML = html;
  }
  // signed-out forms: the stored prize will be attached at sign-in / sign-up
  function paintWheelNote() {
    const w = A.wheel.store.pending();
    root.querySelectorAll('.js-wheel-note').forEach((el) => {
      el.hidden = !w;
      if (w) el.textContent = `🎁 Votre lot de la Roue de la chance « ${w.prize.label} » sera ajouté automatiquement à votre compte (nouveau compte, ou compte qui n’a encore reçu aucun lot).`;
    });
  }
  paintWheelNote();

  async function openDash(focus, claimed) {
    const s = A.store.read();
    if (!s) { show('login', focus); return; }
    fillProfile(s.profile);
    show('dash', focus);
    loadOrders();
    // a prize still waiting in this browser (already signed in when it was won): attach it first
    const claim = claimed !== undefined ? claimed : await A.wheel.claim(s.token);
    loadPoints();
    // fresh profile (the team may have corrected it in the sheet); a dead session falls back to the sign-in form
    A.api('me', { session: s.token }).then((r) => {
      if (r.ok && r.profile) { A.store.save({ profile: r.profile }); fillProfile(r.profile); show('dash', false); paintPoints(r.points); paintWheel(r.wheel || null, claim); }
      else if (r.error === 'auth') lost();
    });
  }

  // another tab signed in / out
  window.addEventListener('storage', (e) => {
    if (e.key !== 'kobg-account-v1' && e.key !== null) return;
    const s = A.store.read();
    if (s && dash.hidden && !resetToken) openDash(false);
    else if (!s && !dash.hidden) show('login', false);
  });

  // the reset link opened in a tab already showing this page only changes the #fragment
  window.addEventListener('hashchange', () => {
    if (takeReset()) show('reset', true);
    else if (dash.hidden && /^#(inscription|creer)$/.test(location.hash)) show('signup', true);
    else if (dash.hidden && /^#oubli/.test(location.hash)) show('forgot', true);
  });

  // ---------- start ----------
  if (!A.available()) {
    $('acctOff').hidden = false;
    Object.values(forms).forEach((f) => f.querySelectorAll('input, button').forEach((el) => { el.disabled = true; }));
  }
  if (resetToken) show('reset', true);
  else if (A.store.read()) openDash(false);
  else show(/^#(inscription|creer)$/.test(location.hash) ? 'signup' : /^#oubli/.test(location.hash) ? 'forgot' : 'login', false);
})();
