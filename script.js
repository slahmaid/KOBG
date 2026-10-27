// =========================================================
// CONFIG — edit here
// ORDERS (cash on delivery): the order forms (product pages + commande.html) POST each order here.
// Paste the URL of your Google Apps Script web app (ends with /exec, see order-apps-script.gs),
// or a Formspree form URL (https://formspree.io/f/xxxx, then set ORDER_ENDPOINT_FORMAT = 'form').
// Set (task 38) to the shop's Apps Script web app: every order, from any host (localhost too), is REALLY sent.
// If emptied: real visitors get "Commande indisponible pour le moment" and NO order is taken; only on
// localhost / 127.0.0.1 or with ?test=1 is a success then SIMULATED (labelled on merci.html, nothing sent).
const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzlxT2m1l9jRQZQYQeIqsGXkxUw0GgKvOhk05uxn-eQwuQ4SzFYbBzZDWkN1MLoBUY42w/exec';
const ORDER_ENDPOINT_FORMAT = 'json';   // 'json' = JSON text body (Apps Script) · 'form' = form-encoded (Formspree)
// WhatsApp number used by the CONTACT links only (footer, FAQ, contact page). Orders never go through WhatsApp.
// International format, digits only: 212 (Morocco) + the number without its leading 0, e.g. '2126XXXXXXXX'.
// Left EMPTY on purpose (task 45): no real number yet, so every WhatsApp button stays HIDDEN on the whole site.
// Fill it in here (this one line) and the buttons appear everywhere with the right link.
const WHATSAPP_NUMBER = '';
const CART_STORAGE_KEY = 'kobg-cart-v1';
// Promo codes accepted in the cart and order forms (static site: checked client-side, the team confirms by phone).
const PROMO_CODES = { KOBG26: 10 };          // code -> % off the subtotal
const PROMO_STORAGE_KEY = 'kobg-promo-v1';
// Delivery: 25 DH, free from 2000 DH of products (threshold uses the subtotal BEFORE the discount).
const SHIPPING_FEE = 25;
const FREE_SHIPPING_FROM = 2000;
// =========================================================

// WhatsApp buttons are hidden by CSS until a valid number is set above (html.has-wa shows them).
const WA_DIGITS = ((d) => (/^212[5-7]\d{8}$/.test(d) ? d : ''))(
  String(WHATSAPP_NUMBER).replace(/\D/g, '').replace(/^00/, '').replace(/^0(?=[5-7]\d{8}$)/, '212'));
if (WA_DIGITS) document.documentElement.classList.add('has-wa');

// Knockout Boxing Gear — header, hero and product carousel interactions
(function () {
  const burger = document.getElementById('burger');
  const nav = document.getElementById('mainNav');
  const dropToggle = document.querySelector('.drop-toggle');
  const drop = document.querySelector('.nav-drop');
  const behindMenu = document.querySelectorAll('.hero, .marquee, .products, .glove-banner, .features, .faq, .site-footer, .sub-main, .legal-wrap');
  const video = document.querySelector('.feature-video');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // keep in sync with the responsive @media query in styles.css
  const mobile = window.matchMedia('(max-width: 860px) and (orientation: portrait), (max-width: 560px), (max-aspect-ratio: 4/5)');
  const isMenuOpen = () => document.body.classList.contains('menu-open');

  // ---- smooth (inertial) page scrolling: Lenis, vendored in assets/vendor ----
  // Wheel / trackpad only; phones keep their native touch scrolling. Off for reduced motion
  // (then the CSS scroll-behavior handles anchor jumps). Sideways gestures over a slider,
  // and any gesture inside the menu, cart or search list, stay native.
  let lenis = null;
  const lenisEase = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));   // expo out
  const lenisSrc = new URL('assets/vendor/lenis.min.js', document.currentScript?.src || location.href).href;
  const lenisMark = () => {
    document.querySelectorAll('.carousel, .pp-track, .pp-thumbs, .chips, .features-grid, .faq-table-wrap')
      .forEach((el) => el.setAttribute('data-lenis-prevent-horizontal', ''));
    document.querySelectorAll('#mainNav, #cartDrawer, #cartList, .search-panel')
      .forEach((el) => el.setAttribute('data-lenis-prevent', ''));
  };
  const lenisSync = () => {
    if (!lenis) return;
    if (document.body.classList.contains('menu-open') || document.body.classList.contains('cart-open')) lenis.stop();
    else lenis.start();
  };
  function startLenis() {
    if (lenis || reduceMotion.matches || typeof window.Lenis !== 'function') return;
    lenisMark();
    lenis = new window.Lenis({ lerp: .1, smoothWheel: true, syncTouch: false, wheelMultiplier: 1, autoRaf: true, anchors: false,
      // shift + wheel means "sideways": leave it to the browser (and the slider under it)
      virtualScroll: (d) => !(d.event.shiftKey && d.event.type === 'wheel') });
    window.kobgLenis = lenis;
    lenisSync();
  }
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const ls = document.createElement('script');
    ls.src = lenisSrc;
    ls.async = true;
    ls.onload = startLenis;
    document.head.appendChild(ls);
  }
  reduceMotion.addEventListener?.('change', (e) => {
    if (e.matches && lenis) { lenis.destroy(); lenis = null; window.kobgLenis = null; }
    else if (!e.matches) startLenis();
  });
  // one way to scroll the page to something: eased by Lenis when it runs, native otherwise.
  // block: 'start' lands below the sticky header (html scroll-padding-top), 'center' centres it.
  let smoothAsked = 0;
  function smoothTop(el, block) {
    const r = el.getBoundingClientRect();
    if (block === 'center') return window.scrollY + r.top - (window.innerHeight - r.height) / 2;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return window.scrollY + r.top - pad - margin;
  }
  function smoothTo(target, { block = 'start', immediate = false } = {}) {
    smoothAsked += 1;
    const ask = smoothAsked;
    const el = typeof target === 'number' ? null : target;
    if (typeof target !== 'number' && !el) return;
    const top = Math.max(0, el ? smoothTop(el, block) : target);
    if (lenis) {
      // content can move while the page glides (an FAQ answer swapping, lazy images
      // loading above the target): re-aim once or twice at the end if it drifted
      let tries = 2;
      const go = (y, duration) => lenis.scrollTo(y, {
        immediate, duration, easing: lenisEase, force: true,
        onComplete: () => {
          if (!el || immediate || !lenis || ask !== smoothAsked || tries-- <= 0) return;
          const again = Math.max(0, smoothTop(el, block));
          if (Math.abs(again - window.scrollY) > 2) go(again, 0.45);
        },
      });
      go(top, 1.1);
    } else {
      window.scrollTo({ top, behavior: immediate || reduceMotion.matches ? 'instant' : 'smooth' });
    }
  }
  // same-page anchors (#faq-tailles, gants.html#gants-de-sac from gants.html, breadcrumb, footer...)
  document.addEventListener('click', (e) => {
    if (!lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    const page = (path) => path.replace(/\/index\.html$/, '/');
    if (url.origin !== location.origin || page(url.pathname) !== page(location.pathname) || url.search !== location.search || url.hash.length < 2) return;
    let id = url.hash.slice(1);
    try { id = decodeURIComponent(id); } catch (err) { /* keep raw */ }
    e.preventDefault();
    const oldURL = location.href;
    if (url.hash !== location.hash) history.pushState(null, '', url.hash);
    // the page's own hash handlers run first (FAQ opens the answer, shop filters a group,
    // a product card gets highlighted); scroll a frame later, once the layout has settled,
    // unless one of them already scrolled to its own target
    const asked = smoothAsked;
    if (oldURL !== location.href) window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
    requestAnimationFrame(() => {
      if (smoothAsked === asked) smoothTo(document.getElementById(id));
    });
  });

  // Placeholder links (href="#") stay where they are instead of scrolling to the top
  document.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#"]')) e.preventDefault();
  });

  function setDrop(open) {
    drop.classList.toggle('is-open', open);
    dropToggle.setAttribute('aria-expanded', String(open));
  }

  function setMenu(open) {
    if (open) {
      // it opens with the collection tiles showing, laid out before it fades in
      // so the expand animation doesn't play on top of the entrance
      nav.classList.add('is-instant');
      setDrop(true);
      void nav.offsetHeight;
      nav.classList.remove('is-instant');
    } else if (!mobile.matches) {
      // desktop dropdown; the mobile sheet keeps its state while it fades out
      setDrop(false);
    }
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    document.body.classList.toggle('menu-open', open);
    lenisSync();
    behindMenu.forEach((el) => { el.inert = open; });
    syncVideo();
  }

  // sticky header: compact frosted state once the page has scrolled
  const header = document.querySelector('.header');
  let headerTick = false;
  const syncHeader = () => {
    headerTick = false;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', () => {
    if (!headerTick) { headerTick = true; requestAnimationFrame(syncHeader); }
  }, { passive: true });
  syncHeader();

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!isMenuOpen());
  });

  dropToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hoverOpened && !mobile.matches) { hoverOpened = false; return; }
    hoverOpened = false;
    setDrop(!drop.classList.contains('is-open'));
  });

  // a click outside closes whatever is open (and does nothing when nothing is)
  document.addEventListener('click', (e) => {
    if (nav.contains(e.target)) {
      if (!drop.contains(e.target) && !isMenuOpen()) setDrop(false);
    } else if (isMenuOpen()) {
      setMenu(false);
    } else if (!mobile.matches && drop.classList.contains('is-open')) {
      setDrop(false);
    }
  });

  // picking a link closes the mobile menu (and the desktop dropdown)
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });

  // desktop dropdown: opens on hover and on keyboard focus (aria-expanded follows);
  // tabbing out of it closes it. Escape closes it and keeps it shut until focus leaves.
  let dropDismissed = false;
  let hoverOpened = false;   // a click (or tap) on the chevron right after hover-open keeps it open
  drop.addEventListener('mouseenter', () => {
    if (mobile.matches || drop.classList.contains('is-open')) return;
    setDrop(true);
    hoverOpened = true;
  });
  drop.addEventListener('mouseleave', () => {
    hoverOpened = false;
    if (!mobile.matches && !drop.querySelector(':focus-visible')) setDrop(false);   // keyboard focus inside keeps it open
  });
  drop.addEventListener('focusin', (e) => {
    if (mobile.matches || dropDismissed || e.target === dropToggle) return;
    setDrop(true);
  });
  drop.addEventListener('focusout', (e) => {
    if (drop.contains(e.relatedTarget)) return;
    dropDismissed = false;
    if (!isMenuOpen()) setDrop(false);
  });

  // rotating into the desktop layout drops the mobile menu state
  mobile.addEventListener('change', (e) => {
    if (!e.matches) setMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isMenuOpen()) {
      setMenu(false);
      burger.focus();
    } else if (drop.classList.contains('is-open')) {
      const hadFocus = drop.contains(document.activeElement);
      dropDismissed = hadFocus;
      setDrop(false);
      if (hadFocus) dropToggle.focus();
    }
  });

  // Video: plays only while it's on screen and not behind the menu; never for reduced motion
  let videoOnScreen = true;
  const videoShouldPlay = () => videoOnScreen && !isMenuOpen() && !reduceMotion.matches;
  function syncVideo() {
    const play = videoShouldPlay();
    if (!video) return;
    if (play && video.paused) video.play().catch(() => {});
    else if (!play && !video.paused) video.pause();
  }
  // the autoplay attribute can start it after this script has run
  video?.addEventListener('play', () => { if (!videoShouldPlay()) video.pause(); });
  if (video && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      videoOnScreen = entry.isIntersecting;
      syncVideo();
    }).observe(video);
  }
  reduceMotion.addEventListener('change', syncVideo);
  syncVideo();

  // ---------------------------------------------------------
  // Cart: client-side only. Items live in localStorage;
  // "Acheter maintenant" goes to commande.html (cash-on-delivery form + summary).
  // ---------------------------------------------------------
  const cartBtn = document.getElementById('cartBtn');
  const cartCount = document.getElementById('cartCount');
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  const cartList = document.getElementById('cartList');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartFoot = document.getElementById('cartFoot');
  const cartHead = drawer.querySelector('.cart-head');
  const cartDesk = window.matchMedia('(min-width: 1024px) and (min-aspect-ratio: 81/100)');
  const CART_DENSITY = [['xl', 236], ['lg', 320], ['md', 284], ['sm', 252], ['xs', 226]];   // [name, card width px]
  const cartHeadCount = document.getElementById('cartHeadCount');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartCheckout = document.getElementById('cartCheckout');
  const discountLine = document.getElementById('cartDiscountLine');
  const discountEl = document.getElementById('cartDiscount');
  const discountCode = document.getElementById('cartDiscountCode');
  const shippingEl = document.getElementById('cartShipping');
  const totalEl = document.getElementById('cartTotal');
  const cartClose = document.getElementById('cartClose');
  const toast = document.getElementById('toast');
  const toastTxt = toast.querySelector('.toast-txt');
  const behindCart = document.querySelectorAll('.page, .marquee, .products, .glove-banner, .features, .faq, .site-footer, .sub-main, .legal-wrap, .header');
  const addedTimers = new WeakMap();
  const MAX_QTY = 99;
  let toastTimer;
  let lastFocus = null;

  // 719 -> "719 DH", 1438 -> "1 438 DH" (non-breaking spaces, like the product cards)
  const formatDH = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0DH`;
  const plural = (n) => `${n} article${n > 1 ? 's' : ''}`;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadCart() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      return Array.isArray(data)
        ? data.filter((it) => it && it.id && it.name && Number.isFinite(+it.price) && +it.qty > 0)
          .map((it) => ({ ...it, price: +it.price, qty: Math.min(MAX_QTY, Math.floor(+it.qty)) }))
        : [];
    } catch (err) { return []; }
  }
  let cart = loadCart();
  function saveCart() {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (err) { /* private mode: cart still works for this visit */ }
  }

  const totalQty = () => cart.reduce((n, it) => n + it.qty, 0);
  const totalPrice = () => cart.reduce((n, it) => n + it.qty * it.price, 0);

  // ---- promo code ----
  const normCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  let promo = (() => {
    try { const c = normCode(localStorage.getItem(PROMO_STORAGE_KEY)); return PROMO_CODES[c] ? c : ''; } catch (err) { return ''; }
  })();
  function savePromo() {
    try { promo ? localStorage.setItem(PROMO_STORAGE_KEY, promo) : localStorage.removeItem(PROMO_STORAGE_KEY); } catch (err) { /* ignore */ }
  }
  // one rule everywhere (cart, checkout, product form): % off the subtotal; delivery free from 2000 DH of products
  function calcTotals(sub) {
    const pct = promo ? PROMO_CODES[promo] : 0;
    const discount = Math.round(sub * pct / 100);
    const shipping = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    return { sub, pct, discount, shipping, total: sub - discount + shipping };
  }
  const totals = () => calcTotals(totalPrice());
  const plainDH = (n) => formatDH(n).replace(/\u00a0/g, ' ');
  const renderHooks = [];     // checkout summary, product order form: re-drawn with the cart
  const promoWidgets = [];    // every promo field on the page (drawer, product form, checkout) stays in sync

  function render() {
    const qty = totalQty();
    cartCount.textContent = qty;
    cartBtn.classList.toggle('has-items', qty > 0);
    cartBtn.setAttribute('aria-label', `Panier, ${plural(qty)}`);
    cartHeadCount.textContent = plural(qty);
    const t = totals();
    cartSubtotal.textContent = formatDH(t.sub);
    discountLine.hidden = !t.pct;
    if (t.pct) {
      discountEl.textContent = `-${formatDH(t.discount)}`;
      discountCode.textContent = promo;
    }
    shippingEl.textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
    totalEl.textContent = formatDH(t.total);
    promoWidgets.forEach((w) => w.sync());
    cartEmpty.hidden = qty > 0;
    cartFoot.hidden = qty === 0;
    cartList.hidden = qty === 0;
    // "Acheter maintenant": disabled while the cart is empty
    cartCheckout.classList.toggle('is-disabled', !qty);
    if (qty) { cartCheckout.removeAttribute('aria-disabled'); cartCheckout.removeAttribute('tabindex'); }
    else { cartCheckout.setAttribute('aria-disabled', 'true'); cartCheckout.setAttribute('tabindex', '-1'); }

    cartList.innerHTML = cart.map(itemHTML).join('');
    fitCart();
    renderHooks.forEach((fn) => fn());
  }

  // Desktop drawer (task 40): the lines are a grid of cards, never an inner scroll box.
  // Try card densities from roomy to compact and, for each, from the preferred column count up to
  // what the screen width allows; keep the first layout where every line fits the panel height.
  // If even the most compact layout can't hold them all, the whole panel scrolls (.is-tall).
  function fitCart() {
    const n = cartList.children.length;
    drawer.classList.toggle('is-empty', !n);
    drawer.classList.remove('is-tall');
    if (!cartDesk.matches || !n) {
      drawer.style.removeProperty('--cols'); drawer.style.removeProperty('--cw'); drawer.style.removeProperty('--head-h');
      delete cartList.dataset.density;
      return;
    }
    const cs = getComputedStyle(drawer);
    const outer = parseFloat(cs.right) || 0;
    const pad = parseFloat(cs.paddingLeft) || 0;
    const gap = parseFloat(cs.columnGap) || pad;
    const sumW = cartHead.getBoundingClientRect().width;
    const avail = window.innerWidth - outer * 2 - pad * 2 - gap - sumW;   // room for the card columns
    const pref = n === 1 ? 1 : n <= 4 ? 2 : 3;
    const fits = () => cartList.scrollHeight <= cartList.clientHeight + 1;
    const set = (d, cw, cols) => {
      cartList.dataset.density = d;
      drawer.style.setProperty('--cw', cw + 'px');
      drawer.style.setProperty('--cols', cols);
    };
    let done = false;
    for (const [d, cw] of CART_DENSITY) {
      const maxC = Math.max(1, Math.min(n, Math.floor((avail + gap) / (cw + gap))));
      if (d === 'xl' && n > 6) continue;                    // tiles only for small carts
      const p0 = d === 'xl' ? (n === 4 ? 2 : Math.min(n, 3)) : pref;
      for (let c = Math.min(p0, maxC); c <= maxC && !done; c++) { set(d, cw, c); done = fits(); }
      if (done) break;
    }
    const foot = cartFoot;
    if (!done || foot.scrollHeight > foot.clientHeight + 1) {
      if (!done) {
        const cw = CART_DENSITY[CART_DENSITY.length - 1][1];
        set('xs', cw, Math.max(1, Math.min(n, Math.floor((avail + gap) / (cw + gap)))));
      }
      drawer.classList.add('is-tall');
      drawer.style.setProperty('--head-h', cartHead.offsetHeight + 'px');
    }
  }
  let fitRaf = 0;
  const refit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitCart); };
  window.addEventListener('resize', refit);
  cartDesk.addEventListener?.('change', refit);
  document.fonts?.ready.then(refit);

  // one cart line (drawer + checkout summary): photo, name, variant, qty stepper, remove, line total
  function itemHTML(it) {
    const label = esc(`${it.name}${it.variant ? ` ${it.variant.toLowerCase()}` : ''}`);
    // the name links to the product page (<id>.html) when the product is in the search index
    const pageId = String(it.id).split('--')[0];
    const hasPage = (window.KOBG_SEARCH || []).some((p) => p.id === pageId);
    return `
    <li class="cart-item" data-id="${esc(it.id)}">
      <img class="cart-item-img" src="${esc(it.img || '')}" alt="" width="72" height="90" decoding="async">
      <div class="cart-item-info">
        <p class="cart-item-name">${hasPage ? `<a class="cart-item-link" href="${esc(pageId)}.html">${esc(it.name)}</a>` : esc(it.name)}</p>
        <p class="cart-item-meta">${it.variant ? `${esc(it.variant)} · ` : ''}${formatDH(it.price)}</p>
        <div class="qty" role="group" aria-label="Quantité, ${label}">
          <button type="button" class="qty-btn" data-act="dec" aria-label="Retirer un ${label}"${it.qty <= 1 ? ' disabled' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </button>
          <span class="qty-val" aria-live="polite">${it.qty}</span>
          <button type="button" class="qty-btn" data-act="inc" aria-label="Ajouter un ${label}"${it.qty >= MAX_QTY ? ' disabled' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="cart-item-side">
        <button type="button" class="cart-remove" data-act="remove" aria-label="Supprimer ${label} du panier">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <p class="cart-item-total">${formatDH(it.qty * it.price)}</p>
      </div>
    </li>`;
  }

  function bumpBadge() {
    cartBtn.classList.remove('is-bumped');
    void cartBtn.offsetWidth;
    cartBtn.classList.add('is-bumped');
  }

  function showToast(text) {
    toastTxt.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  // promo fields: the drawer's is a <form>; the ones inside an order form are a group (no nested forms)
  function bindPromo(root) {
    const input = root.querySelector('.cart-promo-input');
    const row = root.querySelector('.cart-promo-row');
    const on = root.querySelector('.cart-promo-on');
    const codeEl = root.querySelector('.cart-promo-code');
    const msg = root.querySelector('.cart-promo-msg');
    const remove = root.querySelector('.cart-promo-remove');
    if (!input || !row || !on || !remove) return;
    const setMsg = (text, isError) => {
      if (msg) { msg.textContent = text; msg.classList.toggle('is-error', !!isError); }
      input.setAttribute('aria-invalid', isError ? 'true' : 'false');
    };
    const apply = () => {
      const code = normCode(input.value);
      if (!code) { setMsg('Saisissez un code promo.', true); input.focus(); return; }
      if (!PROMO_CODES[code]) { setMsg(`Le code « ${code} » n’est pas valide.`, true); input.select(); return; }
      promo = code;
      savePromo();
      input.value = '';
      render();
      setMsg(`Code ${code} appliqué : -${PROMO_CODES[code]} % sur votre commande.`, false);
      remove.focus();
    };
    if (root.tagName === 'FORM') root.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
    else {
      root.querySelector('.cart-promo-apply')?.addEventListener('click', apply);
      // Enter applies the code instead of sending the order form around it
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    }
    input.addEventListener('input', () => { if (msg?.classList.contains('is-error')) setMsg('', false); });
    remove.addEventListener('click', () => {
      promo = '';
      savePromo();
      render();
      setMsg('Code promo retiré.', false);
      input.focus();
    });
    promoWidgets.push({ sync: () => { row.hidden = !!promo; on.hidden = !promo; if (codeEl) codeEl.textContent = promo; } });
  }
  document.querySelectorAll('.js-promo').forEach(bindPromo);
  // another tab changed the cart or the code: stay in sync
  window.addEventListener('storage', (e) => {
    if (e.key === CART_STORAGE_KEY) cart = loadCart();
    else if (e.key === PROMO_STORAGE_KEY) promo = PROMO_CODES[normCode(e.newValue)] ? normCode(e.newValue) : '';
    else return;
    render();
  });

  // ---- "copy the promo code" buttons (hero card) ----
  function copyText(text) {
    const legacy = () => new Promise((resolve, reject) => {
      // http:// on a LAN address has no Clipboard API: hidden textarea + execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      const prev = document.activeElement;
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      ok ? resolve() : reject(new Error('copy failed'));
    });
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }
  const copyTimers = new WeakMap();
  document.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = btn.dataset.copyCode;
      copyText(code).then(() => {
        document.querySelectorAll(`[data-copy-code="${code}"]`).forEach((b) => {
          b.classList.add('is-copied');
          clearTimeout(copyTimers.get(b));
          copyTimers.set(b, setTimeout(() => b.classList.remove('is-copied'), 1800));
        });
        showToast(`Code ${code} copié !`);
      }, () => {
        showToast(`Copie impossible : notez le code ${code}`);
      });
    });
  });

  function addToCart(btn) {
    const d = btn.dataset;
    if (!d.id) return;
    // the size picker (card <select> or product-page radios) turns into part of the line: its own id + "Couleur · Taille".
    // Product pages: data-scope points at the buy box (also used by the sticky mobile bar), which holds the size + quantity.
    const scope = d.scope ? document.getElementById(d.scope) : btn.closest('.product');
    const sizeSel = scope?.querySelector('.product-size, .pp-size-input:checked');
    const size = sizeSel ? sizeSel.value : '';
    if (!size && scope?.hasAttribute('data-need-size')) {   // product page: no size chosen yet
      scope.dispatchEvent(new CustomEvent('pp:needsize'));
      return;
    }
    const qtyEl = scope?.querySelector('.pp-qty-input');
    const add = qtyEl ? Math.max(1, Math.min(MAX_QTY, parseInt(qtyEl.value, 10) || 1)) : 1;
    const id = size ? `${d.id}--${size.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : d.id;
    const variant = [d.variant || '', size].filter(Boolean).join(' · ');
    const line = cart.find((it) => it.id === id);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + add);
    else cart.push({ id, name: d.name, variant, price: +d.price || 0, img: d.img || '', qty: add });
    saveCart();
    render();
    bumpBadge();

    btn.classList.add('is-added');
    clearTimeout(addedTimers.get(btn));
    addedTimers.set(btn, setTimeout(() => btn.classList.remove('is-added'), 1400));

    const qty = totalQty();
    const label = `${add > 1 ? `${add} × ` : ''}${d.name}${variant ? ` ${variant.toLowerCase()}` : ''}`;
    const done = add > 1 ? 'ajoutés' : 'ajouté';
    showToast(qty > add ? `${label} ${done} · ${plural(qty)} au panier` : `${label} ${done} au panier`);
  }

  document.querySelectorAll('.product-add, .pp-add').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn));
  });

  // quantity +/- and remove (event delegation; focus is put back after each re-render).
  // Used by the drawer list and the checkout summary list.
  function listAction(e, list, emptyFocus) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const row = btn.closest('.cart-item');
    const id = row.dataset.id;
    const idx = cart.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const act = btn.dataset.act;
    if (act === 'inc') cart[idx].qty = Math.min(MAX_QTY, cart[idx].qty + 1);
    else if (act === 'dec') cart[idx].qty = Math.max(1, cart[idx].qty - 1);
    else if (act === 'remove') cart.splice(idx, 1);
    saveCart();
    render();
    if (act === 'remove') {
      const next = list.children[Math.min(idx, list.children.length - 1)];
      (next ? next.querySelector('.cart-remove') : emptyFocus())?.focus();
    } else {
      const again = list.querySelector(`.cart-item[data-id="${CSS.escape(id)}"] [data-act="${act}"]`);
      if (again && !again.disabled) again.focus();
      else if (again) again.parentElement.querySelector(`[data-act="${act === 'inc' ? 'dec' : 'inc'}"]`).focus();
    }
  }
  cartList.addEventListener('click', (e) => listAction(e, cartList, () => document.getElementById('cartShop')));

  const isCartOpen = () => document.body.classList.contains('cart-open');
  function setCart(open) {
    if (open === isCartOpen()) return;
    if (open) {
      if (isMenuOpen()) setMenu(false);
      lastFocus = document.activeElement;
    }
    document.body.classList.toggle('cart-open', open);
    lenisSync();
    drawer.inert = !open;
    cartBtn.setAttribute('aria-expanded', String(open));
    behindCart.forEach((el) => { el.inert = open; });
    if (open) {
      cartClose.focus({ preventScroll: true });
    } else {
      // the header (with the cart button) lives inside .page, so restore focus after it's interactive again
      const back = lastFocus && document.contains(lastFocus) ? lastFocus : cartBtn;
      back.focus({ preventScroll: true });
    }
  }

  cartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setCart(true);
  });
  cartClose.addEventListener('click', () => setCart(false));
  overlay.addEventListener('click', () => setCart(false));
  document.getElementById('cartContinue').addEventListener('click', () => setCart(false));
  document.getElementById('cartShop').addEventListener('click', () => {
    lastFocus = null;
    setCart(false);
  });
  // "Acheter maintenant" -> commande.html; already there: just close the drawer and go to the form
  cartCheckout.addEventListener('click', (e) => {
    if (!cart.length) { e.preventDefault(); return; }
    if (document.querySelector('[data-checkout]')) {
      e.preventDefault();
      lastFocus = null;
      setCart(false);
      const f = document.getElementById('codForm');
      if (f) { smoothTo(f, { block: 'start' }); document.getElementById('codTitle')?.focus({ preventScroll: true }); }
    }
  });

  // Esc closes the cart; Tab stays inside it while it's open
  document.addEventListener('keydown', (e) => {
    if (!isCartOpen()) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      setCart(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...drawer.querySelectorAll('a[href], button:not([disabled])')]
      .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, true);

  // another tab changed the cart: follow it
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_STORAGE_KEY) return;
    cart = loadCart();
    render();
  });

  render();

  // =========================================================
  // Orders: cash-on-delivery forms (product pages + commande.html). One send function: sendOrder().
  // Never shows a success that didn't happen: no endpoint = "Commande indisponible", except in test mode.
  // =========================================================
  const ORDER_TEST = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || new URLSearchParams(location.search).get('test') === '1';
  // window.KOBG_ORDER_ENDPOINT (tests): overrides ORDER_ENDPOINT; '' forces the no-endpoint path.
  const orderEndpoint = () => String(('KOBG_ORDER_ENDPOINT' in window ? window.KOBG_ORDER_ENDPOINT : ORDER_ENDPOINT) || '').trim();
  const LAST_ORDER_KEY = 'kobg-last-order';
  const normPhone = (v) => String(v || '').replace(/[\s.\-()/]/g, '');
  const phoneOK = (v) => /^(?:(?:\+|00)?212|0)[67]\d{8}$/.test(normPhone(v));
  const phoneLocal = (v) => normPhone(v).replace(/^(?:\+|00)?212/, '0');          // +212612345678 -> 0612345678
  const phonePretty = (v) => phoneLocal(v).replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  function newOrderId() {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           // no 0/O, 1/I
    const buf = new Uint8Array(4);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(buf);
    else buf.forEach((_, k) => { buf[k] = Math.floor(Math.random() * 256); });
    return `KOBG-${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${[...buf].map((b) => abc[b % 32]).join('')}`;
  }
  const splitVariant = (v) => { const [colour = '', size = ''] = String(v || '').split(' · '); return { colour, size }; };
  const itemsText = (items) => items.map((it) => `${it.qty} × ${it.name}${[it.colour, it.size].filter(Boolean).length ? ` (${[it.colour, it.size].filter(Boolean).join(' · ')})` : ''} — ${plainDH(it.lineTotal)}`).join('\n');

  const ORDER_ERRORS = {
    unavailable: 'Commande indisponible pour le moment. Réessayez un peu plus tard ou écrivez-nous à info@knockoutboxinggear.com.',
    timeout: 'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.',
    network: 'Envoi impossible : vérifiez votre connexion internet puis réessayez.',
    http: 'Votre commande n’a pas pu être enregistrée. Réessayez dans un instant.',
    hp: 'Envoi impossible. Écrivez-nous à info@knockoutboxinggear.com.',
  };
  // POST one order. 'json': text/plain JSON (Apps Script reads e.postData.contents); 'form': urlencoded.
  // Both are "simple" requests: no CORS preflight. Success = HTTP 2xx and the reply isn't {ok:false}.
  async function sendOrder(payload) {
    const url = orderEndpoint();
    if (!url) {
      if (!ORDER_TEST) return { ok: false, error: 'unavailable' };
      await new Promise((r) => setTimeout(r, 700));
      return { ok: true, test: true };                       // TEST MODE: nothing is sent
    }
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 20000);
    try {
      let body;
      const headers = { Accept: 'application/json' };
      if (ORDER_ENDPOINT_FORMAT === 'form') {
        const flat = { ...payload, items: itemsText(payload.items), items_json: JSON.stringify(payload.items) };
        body = new URLSearchParams(Object.entries(flat).map(([k, v]) => [k, v == null ? '' : String(v)]));
      } else {
        body = JSON.stringify(payload);
        headers['Content-Type'] = 'text/plain;charset=utf-8';
      }
      const res = await fetch(url, { method: 'POST', body, headers, signal: ctrl?.signal, redirect: 'follow', credentials: 'omit' });
      if (!res.ok) return { ok: false, error: 'http' };
      let data = null;
      try { data = await res.json(); } catch (err) { data = null; }
      if (data && (data.ok === false || data.result === 'error')) return { ok: false, error: 'http' };
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err && err.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  const COD_RULES = {
    nom: (v) => (v.trim().length < 3 || !/\p{L}{2}/u.test(v) ? 'Indiquez votre nom complet.' : ''),
    ville: (v) => (v.trim().length < 2 ? 'Indiquez votre ville.' : ''),
    telephone: (v) => (!normPhone(v) ? 'Indiquez votre numéro de téléphone.'
      : phoneOK(v) ? '' : 'Numéro invalide : 06 ou 07 suivi de 8 chiffres (ou +212 6… / +212 7…).'),
  };
  // wires one order form: inline French errors, honeypot, busy state (no double submit), send, then merci.html.
  // getOrder() returns { items, sub, source } or { blocked: 'message' } (it shows its own hint, e.g. the size).
  function codForm(form, { getOrder, onSuccess }) {
    const submit = form.querySelector('.cod-submit');
    const submitTxt = submit.querySelector('.cod-submit-txt');
    const alertEl = form.querySelector('.cod-alert');
    const fields = Object.keys(COD_RULES).map((n) => form.elements[n]).filter(Boolean);
    const val = (n) => String(form.elements[n]?.value || '').trim().replace(/[ \t]+/g, ' ');
    const setErr = (el, msg) => {
      const err = document.getElementById(`${el.id}Err`);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      el.closest('.cod-field')?.classList.toggle('is-error', !!msg);
      if (err) { err.textContent = msg; err.hidden = !msg; }
    };
    const check = (el) => { const msg = COD_RULES[el.name](el.value); setErr(el, msg); return !msg; };
    const showAlert = (msg) => { alertEl.textContent = msg || ''; alertEl.hidden = !msg; };
    fields.forEach((el) => {
      el.addEventListener('blur', () => {
        if (el.name === 'telephone' && phoneOK(el.value)) el.value = phonePretty(el.value);
        if (el.value.trim() || el.getAttribute('aria-invalid') === 'true') check(el);
      });
      el.addEventListener('input', () => {
        if (el.getAttribute('aria-invalid') === 'true') check(el);
        if (!alertEl.hidden && !fields.some((f) => f.getAttribute('aria-invalid') === 'true')) showAlert('');
      });
    });
    let busy = false;
    const setBusy = (on) => {
      busy = on;
      submit.disabled = on;
      submit.classList.toggle('is-loading', on);
      submit.setAttribute('aria-busy', String(on));
      submitTxt.textContent = on ? 'Envoi en cours…' : 'Confirmer la commande';
    };
    window.addEventListener('pageshow', (e) => { if (e.persisted) setBusy(false); });   // back from merci.html
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      showAlert('');
      const order = getOrder();
      if (order.blocked) { showAlert(order.blocked); return; }
      const bad = fields.filter((el) => !check(el));
      if (bad.length) {
        showAlert(bad.length > 1 ? 'Merci de compléter les champs indiqués en rouge.' : 'Merci de corriger le champ indiqué en rouge.');
        smoothTo(bad[0], { block: 'center' });
        bad[0].focus({ preventScroll: true });
        return;
      }
      if (val('kobg_hp')) { showAlert(ORDER_ERRORS.hp); return; }       // honeypot: bots fill every field
      const t = calcTotals(order.sub);
      const payload = {
        orderId: newOrderId(),
        date: new Date().toISOString(),
        nom: val('nom'),
        telephone: phoneLocal(val('telephone')),
        ville: val('ville'),
        items: order.items,
        itemCount: order.items.reduce((n, it) => n + it.qty, 0),
        subtotal: t.sub,
        promoCode: t.pct ? promo : '',
        discountPct: t.pct,
        discount: t.discount,
        delivery: t.shipping,
        total: t.total,
        currency: 'MAD',
        source: order.source,
        page: location.origin + location.pathname,
      };
      setBusy(true);
      const res = await sendOrder(payload);
      if (!res.ok) {
        setBusy(false);
        showAlert(ORDER_ERRORS[res.error] || ORDER_ERRORS.network);
        smoothTo(alertEl, { block: 'center' });
        return;
      }
      try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ ...payload, test: !!res.test })); } catch (err) { /* private mode */ }
      onSuccess(payload);
      form.reset();
      fields.forEach((el) => setErr(el, ''));
      location.href = `merci.html?commande=${encodeURIComponent(payload.orderId)}${new URLSearchParams(location.search).get('test') === '1' ? '&test=1' : ''}`;
    });
    return { showAlert };
  }

  // ---- commande.html: COD form + cart summary (collapsible on phones) ----
  const coRoot = document.querySelector('[data-checkout]');
  if (coRoot) {
    const coGrid = document.getElementById('coGrid');
    const coEmpty = document.getElementById('coEmpty');
    const coList = document.getElementById('coList');
    const coSum = document.getElementById('coSum');
    const coToggle = document.getElementById('coSumToggle');
    const $ = (id) => document.getElementById(id);
    let coLeaving = false;
    const coRender = () => {
      if (coLeaving) return;
      const qty = totalQty();
      const t = totals();
      const wasEmpty = coGrid.hidden;
      coGrid.hidden = !qty;
      coEmpty.hidden = !!qty;
      coList.innerHTML = cart.map(itemHTML).join('');
      $('coCount').textContent = plural(qty);
      $('coSumCount').textContent = plural(qty);
      $('coSub').textContent = formatDH(t.sub);
      $('coDiscLine').hidden = !t.pct;
      if (t.pct) {
        $('coDisc').textContent = `-${formatDH(t.discount)}`;
        coSum.querySelectorAll('.js-disc-code').forEach((el) => { el.textContent = promo; });
        coSum.querySelectorAll('.js-disc-pct').forEach((el) => { el.textContent = t.pct; });
      }
      $('coShip').textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
      $('coTotal').textContent = formatDH(t.total);
      $('coSumToggleTotal').textContent = formatDH(t.total);
      $('codDue').textContent = formatDH(t.total);
      if (!qty && !wasEmpty && document.activeElement === document.body) $('coEmptyH')?.focus();
    };
    renderHooks.push(coRender);
    coRender();
    coList.addEventListener('click', (e) => listAction(e, coList, () => (cart.length ? null : $('coEmptyH'))));
    coToggle.addEventListener('click', () => {
      const open = coToggle.getAttribute('aria-expanded') !== 'true';
      coToggle.setAttribute('aria-expanded', String(open));
      coSum.classList.toggle('is-open', open);
    });
    codForm($('codForm'), {
      getOrder: () => {
        if (!cart.length) return { blocked: 'Votre panier est vide : ajoutez un article avant de commander.' };
        return {
          source: 'panier',
          sub: totalPrice(),
          items: cart.map((it) => ({
            id: it.id, name: it.name, ...splitVariant(it.variant), qty: it.qty, unitPrice: it.price, lineTotal: it.qty * it.price,
          })),
        };
      },
      onSuccess: () => { coLeaving = true; cart = []; saveCart(); render(); },
    });
  }

  // ---- merci.html: order number + recap (sessionStorage, this visit only) ----
  const merciRoot = document.querySelector('[data-merci]');
  if (merciRoot) {
    const $ = (id) => document.getElementById(id);
    const qid = new URLSearchParams(location.search).get('commande') || '';
    let o = null;
    try { o = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) || 'null'); } catch (err) { o = null; }
    if (o && (!o.orderId || (qid && o.orderId !== qid))) o = null;
    const id = o ? o.orderId : (/^KOBG-\d{6}-[A-Z0-9]{4}$/.test(qid) ? qid : '');
    if (id) {
      $('merciId').textContent = id;
      $('merciNumWrap').hidden = false;
      document.title = `Merci, commande ${id} — Knockout Boxing Gear`;
    } else {
      $('merciTag').textContent = 'Commande';
      $('merciTitle').textContent = 'Aucune commande récente';
      $('merciLead').textContent = 'Le récapitulatif n’est gardé que pendant votre visite. Si vous venez de commander, nous vous appelons très vite pour confirmer.';
    }
    if (o) {
      $('merciTest').hidden = !o.test;
      $('merciItems').innerHTML = (o.items || []).map((it) => `
        <li class="merci-item"><span class="merci-item-name"><strong>${esc(it.name)}</strong>${[it.colour, it.size].filter(Boolean).length ? `<small>${esc([it.colour, it.size].filter(Boolean).join(' · '))}</small>` : ''}</span>
          <span class="merci-item-qty">${esc(it.qty)} × ${formatDH(+it.unitPrice || 0)}</span><strong class="merci-item-total">${formatDH(+it.lineTotal || 0)}</strong></li>`).join('');
      $('merciTotals').innerHTML = `
        <p class="cart-line cart-line--sub"><span>Sous-total</span><strong>${formatDH(o.subtotal || 0)}</strong></p>
        ${o.discount ? `<p class="cart-line cod-line--disc"><span>Réduction ${esc(o.promoCode)} (-${esc(o.discountPct)}&nbsp;%)</span><strong>-${formatDH(o.discount)}</strong></p>` : ''}
        <p class="cart-line"><span>Livraison</span><strong>${o.delivery ? formatDH(o.delivery) : 'Offerte'}</strong></p>
        <p class="cart-total"><span>À payer à la livraison</span><strong>${formatDH(o.total || 0)}</strong></p>`;
      $('merciCust').innerHTML = [['Nom', o.nom], ['Téléphone', o.telephone ? phonePretty(o.telephone) : ''], ['Ville', o.ville]]
        .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
      $('merciRecap').hidden = false;
    }
  }

  // Carousels: every .products section (Best-sellers, Gants de sac, Gants de sparring, Plastrons, Avis) gets its own
  // native scroll-snap track (touch and trackpads just work), arrows that step one
  // card, mouse drag and a thin progress bar. Each instance keeps its own state.
  const glide = () => (reduceMotion.matches ? 'auto' : 'smooth');
  document.querySelectorAll('.products').forEach(setupCarousel);

  function setupCarousel(section) {
    const track = section.querySelector('.carousel');
    const prevBtn = section.querySelector('.carousel-btn[data-dir="prev"]');
    const nextBtn = section.querySelector('.carousel-btn[data-dir="next"]');
    const thumb = section.querySelector('.carousel-thumb');
    const allLink = section.querySelector('.products-all');
    if (!track || !prevBtn || !nextBtn || !thumb) return;
    const cards = track.children;
    // scrollLeft that brings card i to the start of the track
    const cardLeft = (i) => (cards[i] ? cards[i].offsetLeft - cards[0].offsetLeft : 0);

    let thumbW = 1;
    function measure() {
      thumbW = track.clientWidth / track.scrollWidth;
      thumb.style.setProperty('--w', `${thumbW * 100}%`);
      syncCarousel();
    }

    let syncQueued = false;
    function syncCarousel() {
      syncQueued = false;
      const max = track.scrollWidth - track.clientWidth;
      const left = track.scrollLeft;
      const p = max > 0 ? left / max : 0;
      // translateX is a % of the thumb's own width
      thumb.style.setProperty('--x', `${(p * (1 - thumbW) / thumbW) * 100}%`);
      prevBtn.disabled = left <= 2;
      nextBtn.disabled = left >= max - 2;
    }
    function queueSync() {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(syncCarousel);
    }

    // where the track is, in cards (fractional between snaps); a pending arrow
    // target counts, so quick repeated clicks keep stepping instead of stalling
    let target = null;
    let targetTimer;
    function position() {
      if (target !== null) return target;
      const i = track.scrollLeft / (cardLeft(1) || 1);
      return Math.abs(i - Math.round(i)) < .05 ? Math.round(i) : i;
    }
    function goTo(i) {
      target = Math.max(0, Math.min(cards.length - 1, i));
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: Math.min(cardLeft(target), max), behavior: glide() });
      clearTimeout(targetTimer);
      targetTimer = setTimeout(settle, 800);   // fallback where 'scrollend' isn't supported
    }
    function settle() {
      target = null;
      track.classList.remove('is-gliding');
    }

    prevBtn.addEventListener('click', () => goTo(Math.ceil(position()) - 1));
    nextBtn.addEventListener('click', () => goTo(Math.floor(position()) + 1));
    // "Voir tout": the section's own anchor scroll, plus the track back to its first card
    if (allLink) allLink.addEventListener('click', () => goTo(0));
    track.addEventListener('scroll', queueSync, { passive: true });
    track.addEventListener('scrollend', () => { clearTimeout(targetTimer); settle(); });
    new ResizeObserver(measure).observe(track);

    // mouse drag: free movement while held, then a glide to the next card in the
    // drag's direction (snap is off meanwhile so the two don't fight)
    let drag = null;
    let swallowClick = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.product-add, .product-opt')) return;
      drag = { x: e.clientX, left: track.scrollLeft, dx: 0, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(drag.dx) < 6) return;
        drag.moved = true;
        target = null;
        track.classList.add('is-dragging');
      }
      track.scrollLeft = drag.left - drag.dx;
    });
    function endDrag() {
      if (!drag) return;
      const { moved, dx } = drag;
      drag = null;
      if (!moved) return;
      // the click that ends a drag shouldn't open the product under the cursor
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      track.classList.replace('is-dragging', 'is-gliding');
      const i = track.scrollLeft / (cardLeft(1) || 1);
      goTo(dx < -30 ? Math.ceil(i) : dx > 30 ? Math.floor(i) : Math.round(i));
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // cards are links: stop the browser's own link/image drag from hijacking the gesture
    track.addEventListener('dragstart', (e) => e.preventDefault());
    track.addEventListener('click', (e) => {
      if (!swallowClick) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    // reveal the section once it scrolls into view
    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      section.classList.add('will-reveal');
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        section.classList.remove('will-reveal');
        section.classList.add('is-in');
        io.disconnect();
        // turn snapping back on once the last card has landed
        const done = () => { section.classList.add('is-revealed'); clearTimeout(fallback); };
        const fallback = setTimeout(done, 2500);
        track.lastElementChild?.addEventListener('animationend', done, { once: true });
      }, { threshold: .15 });
      io.observe(section);
    }
  }

  // Features: blocks rise in once, the first time the section scrolls into view
  document.querySelectorAll('.features').forEach((section) => {
    if (!('IntersectionObserver' in window) || reduceMotion.matches) return;
    section.classList.add('will-reveal');
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      section.classList.remove('will-reveal');
      section.classList.add('is-in');
      io.disconnect();
      // phones swipe this row: snapping waits until the cards have landed
      const done = () => { section.classList.add('is-revealed'); clearTimeout(fallback); };
      const fallback = setTimeout(done, 2000);
      section.querySelector('.features-grid')?.lastElementChild?.addEventListener('animationend', done, { once: true });
    }, { threshold: .15 });
    io.observe(section);
  });

  // FAQ: accordion, one answer open at a time. Without JS every answer stays visible
  // (the collapsed state only applies under .faq--js). Height animates in CSS (grid rows).
  document.querySelectorAll('.faq').forEach((section) => {
    const qs = [...section.querySelectorAll('.faq-q')];
    const panel = (q) => document.getElementById(q.getAttribute('aria-controls'));
    function set(q, open) {
      q.setAttribute('aria-expanded', String(open));
      q.closest('.faq-item').classList.toggle('is-open', open);
      panel(q).inert = !open;
    }
    qs.forEach((q, i) => set(q, i === 0));      // first answer open by default
    section.classList.add('faq--js');
    qs.forEach((q, i) => {
      q.addEventListener('click', () => {
        const open = q.getAttribute('aria-expanded') !== 'true';
        qs.forEach((o) => { if (o !== q) set(o, false); });
        set(q, open);
      });
      // arrow keys / Home / End move between questions
      q.addEventListener('keydown', (e) => {
        const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: qs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        qs[(to + qs.length) % qs.length].focus();
      });
    });

    // links to a question (e.g. footer "Guide des tailles" -> #faq-tailles) open that answer
    function openFromHash(hash) {
      const item = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
      const q = item && section.contains(item) ? item.querySelector('.faq-q') : null;
      if (!q) return;
      // swap instantly: an answer collapsing above the target would shift it mid-scroll
      section.classList.add('faq--instant');
      qs.forEach((o) => set(o, o === q));
      void section.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove('faq--instant')));
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#faq-"]');
      if (a) openFromHash(a.getAttribute('href'));
    });
    window.addEventListener('hashchange', () => openFromHash(location.hash));
    openFromHash(location.hash);

    const wa = section.querySelector('#faqWhatsapp');
    if (wa && WA_DIGITS) {
      const msg = 'Bonjour Knockout Boxing Gear, j’ai une question :';
      wa.href = `https://wa.me/${WA_DIGITS}?text=${encodeURIComponent(msg)}`;
    }

    if (!('IntersectionObserver' in window) || reduceMotion.matches) return;
    section.classList.add('will-reveal');
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      section.classList.remove('will-reveal');
      section.classList.add('is-in');
      io.disconnect();
    }, { threshold: .1 });
    io.observe(section);
  });

  // Footer: WhatsApp links + back-to-top
  if (WA_DIGITS) document.querySelectorAll('.js-wa').forEach((a) => {
    const msg = 'Bonjour Knockout Boxing Gear, j’ai une question.';
    a.href = `https://wa.me/${WA_DIGITS}?text=${encodeURIComponent(msg)}`;
  });
  else {
    // no WhatsApp number yet: the two big WhatsApp buttons (FAQ, footer) become "Nous contacter" -> contact.html;
    // the small links and the contact-page card are hidden by CSS (html:not(.has-wa)).
    document.querySelectorAll('#faqWhatsapp, .footer-wa').forEach((a) => {
      a.href = 'contact.html';
      a.removeAttribute('target');
      a.removeAttribute('rel');
      a.classList.remove('js-wa');
      a.classList.add('is-contact');
      a.querySelector('svg')?.remove();
      a.textContent = 'Nous contacter';
    });
  }
  document.getElementById('backToTop')?.addEventListener('click', () => {
    smoothTo(0);
    // keyboard users land back at the top too (first visible logo link)
    [...document.querySelectorAll('.bar-logo, .nav-logo')].find((l) => l.offsetParent && !l.closest('[inert]'))?.focus({ preventScroll: true });
  });
  // ---------------------------------------------------------
  // Shop pages (gants.html, protecteur-corporel.html): filter chips + price sort + #hash filters
  // ---------------------------------------------------------
  const shop = document.querySelector('[data-shop]');
  if (shop) {
    const groups = [...shop.querySelectorAll('.cat-group')];
    const chips = [...shop.querySelectorAll('.chip[data-filter]')];
    const sortSel = shop.querySelector('#gantsSort');
    const count = shop.querySelector('#gantsCount');
    groups.forEach((g) => [...g.querySelectorAll('.product')].forEach((li, i) => { li.dataset.order = i; }));
    // a chip filters either a whole group (gants: #gants-de-sac) or single cards by tag
    // (protecteur-corporel: data-tags="coloris-noir")
    const hasTag = (li, f) => (li.dataset.tags || '').split(' ').includes(f);
    function applyFilter(f, { scroll = false } = {}) {
      const isGroup = groups.some((g) => g.id === f);
      const isTag = !isGroup && groups.some((g) => [...g.querySelectorAll('.product')].some((li) => hasTag(li, f)));
      if (!isGroup && !isTag) f = 'tous';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === f)));
      let n = 0;
      groups.forEach((g) => {
        const show = f === 'tous' || isTag || g.id === f;
        g.hidden = !show;
        [...g.querySelectorAll('.product')].forEach((li) => {
          li.hidden = isTag && !hasTag(li, f);
          if (show && !li.hidden) n += 1;
        });
      });
      count.textContent = `${n} produit${n > 1 ? 's' : ''}`;
      if (scroll && isGroup) {
        smoothTo(document.getElementById(f));
      }
    }
    function applySort() {
      const v = sortSel ? sortSel.value : 'default';
      groups.forEach((g) => {
        const list = g.querySelector('.product-grid');
        const items = [...list.children];
        const key = (li) => Number(li.querySelector('[data-price]').dataset.price);
        items.sort((a, b) => v === 'asc' ? key(a) - key(b) : v === 'desc' ? key(b) - key(a) : a.dataset.order - b.dataset.order);
        items.forEach((li) => list.appendChild(li));
      });
    }
    chips.forEach((c) => c.addEventListener('click', () => {
      const f = c.dataset.filter;
      applyFilter(f);
      // keep the URL shareable without jumping the page
      history.replaceState(null, '', f === 'tous' ? location.pathname : `#${f}`);
    }));
    sortSel?.addEventListener('change', applySort);
    const fromHash = (scroll) => applyFilter(decodeURIComponent(location.hash.slice(1)) || 'tous', { scroll });
    window.addEventListener('hashchange', () => fromHash(true));
    fromHash(false);
    // arriving with #gants-de-sparring: the other group just got hidden, so land on it again
    const target = groups.find((g) => `#${g.id}` === location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  // Contact page: the form composes an e-mail in the visitor's mail app (static site, no server)
  const contactForm = document.getElementById('contactForm');
  contactForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!contactForm.reportValidity()) return;
    const d = new FormData(contactForm);
    const subject = `Contact site — ${d.get('nom')}`;
    const body = `${d.get('message')}\n\n${d.get('nom')}\n${d.get('email')}`;
    location.href = `mailto:info@knockoutboxinggear.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  // ---------------------------------------------------------
  // Search: header field on every page (live suggestions) + recherche.html (all results).
  // Static site: the product index is assets/search-index.js, generated by tools/build32.py
  // from the homepage cards. Matching ignores accents/case and tolerates small typos.
  // ---------------------------------------------------------
  const PRODUCTS = Array.isArray(window.KOBG_SEARCH) ? window.KOBG_SEARCH : [];
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();
  const words = (s) => fold(s).split(' ').filter(Boolean);
  const STOP = new Set(['de', 'des', 'du', 'le', 'la', 'les', 'l', 'd', 'un', 'une', 'et', 'en', 'pour', 'a', 'au', 'aux', 'avec']);
  const KEYWORDS = {
    'Gants de sac': 'gant gants boxe sac frappe entrainement',
    'Gants de sparring': 'gant gants boxe sparring combat',
    'Protecteur corporel': 'protecteur protection plastron body shield corps corporel ventre',
  };
  PRODUCTS.forEach((p, i) => {
    p.order = i;
    p.fields = [ // [weight, words]: model name first, then colour, collection, then everything else
      [3, words(`${p.short} ${p.name}`)],
      [2.5, words(p.colour)],
      [2, words(p.coll)],
      [1, words(`${KEYWORDS[p.coll] || ''} ${(p.tags || []).join(' ')} ${p.best ? 'best seller bestseller' : ''} rival ${(p.sizes || []).join(' ')}`)],
    ];
    p.compact = fold(`${p.short} ${p.colour} ${p.name}`).replace(/ /g, ''); // "rs100", "intellishock"
  });
  // optimal string alignment distance (one typo = insert, delete, replace or swap), capped at max
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        rowMin = Math.min(rowMin, v);
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  function termScore(t, list) {
    let best = 0;
    for (const w of list) {
      if (w === t) return 1;
      if (w.startsWith(t)) best = Math.max(best, t.length > 1 ? 0.85 : 0.4);
      else if (t.length >= 3 && w.includes(t)) best = Math.max(best, 0.6);
      else if (t.length >= 5 && best < 0.45 && !/\d/.test(t)) { // typos only on words, never on model codes
        const max = t.length >= 8 ? 2 : 1;
        if (editDist(t, w, max) <= max || (w.length > t.length && editDist(t, w.slice(0, t.length), max) <= max)) best = 0.45;
      }
    }
    return best;
  }
  function searchProducts(q) {
    let terms = words(q);
    const content = terms.filter((t) => !STOP.has(t));
    if (content.length) terms = content;
    if (!terms.length) return [];
    const whole = terms.join('');
    const res = [];
    PRODUCTS.forEach((p) => {
      let score = 0;
      for (const t of terms) {
        let s = 0;
        p.fields.forEach(([wgt, list]) => { s = Math.max(s, wgt * termScore(t, list)); });
        if (t.length >= 3 && p.compact.includes(t)) s = Math.max(s, 1.5);
        if (!s) return; // every word must match something
        score += s;
      }
      if (terms.length > 1 && whole.length >= 4 && p.compact.includes(whole)) score += 1;
      if (p.best) score += 0.2;
      res.push({ p, score });
    });
    return res.sort((a, b) => b.score - a.score || a.p.order - b.p.order).map((r) => r.p);
  }
  const resultsWord = (n) => `${n} résultat${n > 1 ? 's' : ''}`;
  const searchUrl = (q) => `recherche.html?q=${encodeURIComponent(q.trim())}`;

  // ---- header field: combobox with a listbox of up to 6 products + "Voir tous" ----
  const searchForm = document.querySelector('.header .search');
  const searchInput = searchForm?.querySelector('input[name="q"]');
  if (searchForm && searchInput) {
    const MAX_ROWS = 6;
    const panel = document.createElement('div');
    panel.className = 'search-panel';
    panel.setAttribute('data-lenis-prevent', '');
    panel.hidden = true;
    panel.innerHTML = '<ul class="search-list" id="searchList" role="listbox" aria-label="Suggestions de produits"></ul><div class="search-none" hidden></div>';
    const live = document.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    searchForm.append(panel, live);
    const list = panel.querySelector('.search-list');
    const none = panel.querySelector('.search-none');
    let opts = [];
    let active = -1;
    let liveTimer;

    const syncViewport = () => {
      // on phones the on-screen keyboard shrinks the visual viewport: keep the panel above it
      const vv = window.visualViewport;
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
    };
    const isOpen = () => !panel.hidden;
    function openPanel() {
      if (isOpen()) return;
      syncViewport();
      panel.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
      searchForm.classList.add('is-open');
      if (isMenuOpen()) setMenu(false);
    }
    function closePanel() {
      if (!isOpen()) return;
      panel.hidden = true;
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.removeAttribute('aria-activedescendant');
      searchForm.classList.remove('is-open');
      active = -1;
    }
    function setActive(i) {
      opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
      active = i;
      if (i < 0) { searchInput.removeAttribute('aria-activedescendant'); return; }
      searchInput.setAttribute('aria-activedescendant', opts[i].id);
      opts[i].scrollIntoView({ block: 'nearest' });
    }
    function renderSuggest() {
      const q = searchInput.value.trim();
      if (!q) { closePanel(); live.textContent = ''; return; }
      const res = searchProducts(q);
      list.innerHTML = res.slice(0, MAX_ROWS).map((p, i) => `
        <li class="search-opt" role="option" id="searchOpt${i}" aria-selected="false">
          <a href="${esc(p.url)}" tabindex="-1">
            <img src="${esc(p.img)}" alt="" width="48" height="60" loading="lazy" decoding="async">
            <span class="search-opt-txt"><span class="search-opt-name">${esc(p.short)}</span><span class="search-opt-meta">${esc(p.colour)} · ${esc(p.coll)}</span></span>
            <span class="search-opt-price">${formatDH(p.price)}</span>
          </a>
        </li>`).join('') + (res.length ? `
        <li class="search-opt search-opt--all" role="option" id="searchOptAll" aria-selected="false">
          <a href="${esc(searchUrl(q))}" tabindex="-1">Voir tous les résultats (${res.length})<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        </li>` : '');
      list.hidden = !res.length;
      none.hidden = !!res.length;
      if (!res.length) {
        none.innerHTML = `<p class="search-none-h">Aucun produit trouvé pour «&nbsp;${esc(q)}&nbsp;»</p>
          <p class="search-none-links"><a href="gants.html">Gants</a><a href="protecteur-corporel.html">Protecteur corporel</a></p>`;
      }
      opts = [...list.querySelectorAll('[role="option"]')];
      active = -1;
      searchInput.removeAttribute('aria-activedescendant');
      openPanel();
      clearTimeout(liveTimer); // announce once typing pauses
      liveTimer = setTimeout(() => {
        live.textContent = res.length ? `${resultsWord(res.length)}. Flèches haut et bas pour parcourir.` : `Aucun produit trouvé pour ${q}`;
      }, 450);
    }
    searchInput.addEventListener('input', renderSuggest);
    searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderSuggest(); });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen()) { renderSuggest(); return; }
        if (!opts.length) return;
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setActive(active < 0 ? (d > 0 ? 0 : opts.length - 1) : (active + d + opts.length) % opts.length);
      } else if (e.key === 'Enter') {
        if (isOpen() && active >= 0) {
          e.preventDefault();
          location.href = opts[active].querySelector('a').href;
        } else if (!searchInput.value.trim()) {
          e.preventDefault();
        }
      } else if (e.key === 'Escape') {
        if (isOpen()) { e.preventDefault(); e.stopPropagation(); closePanel(); }
        else if (searchInput.value) { e.preventDefault(); e.stopPropagation(); searchInput.value = ''; }
      } else if (e.key === 'Tab') {
        closePanel();
      }
    });
    searchForm.addEventListener('submit', (e) => {
      const q = searchInput.value.trim();
      e.preventDefault();
      if (q) location.href = searchUrl(q);
    });
    panel.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus (and the keyboard) in the field
    panel.addEventListener('mousemove', (e) => {
      const o = e.target.closest('[role="option"]');
      if (o && opts.indexOf(o) !== active) { opts.forEach((x) => x.setAttribute('aria-selected', String(x === o))); active = opts.indexOf(o); }
    });
    document.addEventListener('click', (e) => { if (!searchForm.contains(e.target)) closePanel(); });
    document.addEventListener('focusin', (e) => { if (!searchForm.contains(e.target)) closePanel(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (isOpen()) syncViewport(); });
    window.addEventListener('resize', () => { if (isOpen()) syncViewport(); });
  }

  // ---- recherche.html: every matching card (same markup as the collection pages) ----
  const searchPage = document.querySelector('[data-search-page]');
  if (searchPage) {
    const pageForm = searchPage.querySelector('.search-page-form');
    const pageInput = searchPage.querySelector('#searchPageInput');
    const grid = searchPage.querySelector('#searchGrid');
    const gridWrap = searchPage.querySelector('#resultats');
    const count = searchPage.querySelector('#searchCount');
    const empty = searchPage.querySelector('#searchEmpty');
    const emptyQ = searchPage.querySelector('#searchEmptyQ');
    const title = searchPage.querySelector('#searchTitle');
    const cardsById = new Map([...grid.children].map((li) => [li.dataset.pid, li]));
    function showResults(raw) {
      const q = raw.trim();
      const res = q ? searchProducts(q) : PRODUCTS.slice();
      cardsById.forEach((li) => { li.hidden = true; });
      let n = 0;
      res.forEach((p) => {
        const li = cardsById.get(p.id);
        if (!li) return;
        li.hidden = false;
        grid.appendChild(li); // most relevant first
        n += 1;
      });
      title.textContent = q ? `« ${q} »` : 'Tous les produits';
      count.textContent = q ? `${n ? resultsWord(n) : 'Aucun résultat'} pour « ${q} »` : `${n} produits`;
      emptyQ.textContent = q;
      empty.hidden = n > 0;
      gridWrap.hidden = n === 0;
      document.title = q ? `${q} — Recherche — Knockout Boxing Gear` : 'Recherche — Knockout Boxing Gear';
    }
    const setUrl = (q) => history.replaceState(null, '', q.trim() ? searchUrl(q) : 'recherche.html');
    const q0 = new URLSearchParams(location.search).get('q') || '';
    pageInput.value = q0;
    showResults(q0);
    let typing;
    pageInput.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => { showResults(pageInput.value); setUrl(pageInput.value); }, 160);
    });
    pageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(typing);
      showResults(pageInput.value);
      setUrl(pageInput.value);
      pageInput.blur(); // drop the phone keyboard so the results are visible
    });
  }

  // ---- collection pages: gants.html#produit-<id> scrolls to that card and highlights it ----
  function revealProduct() {
    const m = /^#produit-(.+)$/.exec(location.hash);
    if (!m) return;
    let id = m[1];
    try { id = decodeURIComponent(id); } catch (err) { /* keep raw */ }
    const btn = [...document.querySelectorAll('.product-grid .product-add')].find((b) => b.dataset.id === id);
    const card = btn?.closest('.product');
    if (!card || card.hidden) return;
    requestAnimationFrame(() => {
      smoothTo(card, { block: 'center' });
      card.classList.remove('is-found');
      void card.offsetWidth; // restart the highlight
      card.classList.add('is-found');
      card.querySelector('.product-link')?.focus({ preventScroll: true });
      clearTimeout(card.foundTimer);
      card.foundTimer = setTimeout(() => card.classList.remove('is-found'), 3200);
    });
  }
  revealProduct();
  window.addEventListener('hashchange', revealProduct);

  // =========================================================
  // Product pages (<id>.html, generated by tools/build33.py): gallery, size, quantity,
  // cash-on-delivery order form and the sticky mobile "Commander" bar. Arrow functions only (one IIFE, no hoisting clashes).
  // =========================================================
  const ppRoot = document.querySelector('[data-product]');
  if (ppRoot) {
    // ---- gallery: scroll-snap track + thumbnails + arrows; hover zoom with a fine pointer ----
    const ppTrack = document.getElementById('ppTrack');
    const ppSlides = ppTrack ? [...ppTrack.children] : [];
    const ppThumbs = [...document.querySelectorAll('.pp-thumb')];
    const ppCur = document.getElementById('ppCur');
    const ppPrev = document.querySelector('.pp-nav[data-dir="prev"]');
    const ppNext = document.querySelector('.pp-nav[data-dir="next"]');
    let ppIndex = 0;
    const ppSetActive = (i) => {
      ppIndex = i;
      ppThumbs.forEach((t, k) => t.setAttribute('aria-current', k === i ? 'true' : 'false'));
      if (ppCur) ppCur.textContent = i + 1;
      if (ppPrev) ppPrev.disabled = i <= 0;
      if (ppNext) ppNext.disabled = i >= ppSlides.length - 1;
    };
    const ppGo = (i) => {
      if (!ppTrack || !ppSlides.length) return;
      i = Math.max(0, Math.min(ppSlides.length - 1, i));
      ppTrack.scrollTo({ left: ppSlides[i].offsetLeft, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      ppSetActive(i);
    };
    if (ppTrack && ppSlides.length) {
      let ppRaf = 0;
      ppTrack.addEventListener('scroll', () => {
        cancelAnimationFrame(ppRaf);
        ppRaf = requestAnimationFrame(() => {
          const i = Math.round(ppTrack.scrollLeft / Math.max(1, ppTrack.clientWidth));
          if (i !== ppIndex) ppSetActive(Math.max(0, Math.min(ppSlides.length - 1, i)));
        });
      }, { passive: true });
      ppThumbs.forEach((t, k) => t.addEventListener('click', () => ppGo(k)));
      ppPrev?.addEventListener('click', () => ppGo(ppIndex - 1));
      ppNext?.addEventListener('click', () => ppGo(ppIndex + 1));
      ppTrack.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); ppGo(ppIndex + (e.key === 'ArrowRight' ? 1 : -1)); }
      });
      window.addEventListener('resize', () => { ppTrack.scrollLeft = ppSlides[ppIndex].offsetLeft; });
      ppSetActive(0);

      const ppFine = window.matchMedia('(hover: hover) and (pointer: fine)');
      ppSlides.forEach((slide) => {
        const img = slide.querySelector('img');
        if (!img) return;
        slide.addEventListener('pointermove', (e) => {
          if (!ppFine.matches || e.pointerType !== 'mouse') return;
          const r = slide.getBoundingClientRect();
          img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
          slide.classList.add('is-zoom');
        });
        slide.addEventListener('pointerleave', () => slide.classList.remove('is-zoom'));
      });
    }

    // ---- size (radios, nothing preselected) + quantity stepper ----
    const ppBuy = document.getElementById('ppBuy');
    const ppSizeVal = document.getElementById('ppSizeVal');
    const ppSizeErr = document.getElementById('ppSizeErr');
    const ppSizeBox = document.getElementById('ppSize');
    const ppQty = document.querySelector('.pp-qty-input');
    const ppBarMeta = document.getElementById('ppBarMeta');
    const ppSize = () => document.querySelector('.pp-size-input:checked')?.value || '';
    const ppQtyVal = () => Math.max(1, Math.min(MAX_QTY, parseInt(ppQty?.value, 10) || 1));
    const ppAddBtn = document.getElementById('ppAdd');
    const ppCod = document.getElementById('codForm');
    const $c = (id) => document.getElementById(id);
    // the order form's live summary: selection, unit price, qty, promo, delivery, total
    const codSync = () => {
      if (!ppCod || !ppAddBtn) return;
      const d = ppAddBtn.dataset;
      const size = ppSize();
      const qty = ppQtyVal();
      const t = calcTotals(qty * (+d.price || 0));
      const needSize = ppBuy?.hasAttribute('data-need-size');
      $c('codSel').innerHTML = `${esc(d.variant || '')}${needSize ? ` · ${size ? esc(size) : '<button type="button" class="cod-pick" id="codPick">Taille à choisir</button>'}` : ''}`;
      $c('codUnit').textContent = formatDH(+d.price || 0);
      $c('codQty').textContent = qty;
      $c('codSub').textContent = formatDH(t.sub);
      $c('codDiscLine').hidden = !t.pct;
      if (t.pct) {
        $c('codDisc').textContent = `-${formatDH(t.discount)}`;
        ppCod.querySelectorAll('.js-disc-code').forEach((el) => { el.textContent = promo; });
        ppCod.querySelectorAll('.js-disc-pct').forEach((el) => { el.textContent = t.pct; });
      }
      $c('codShip').textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
      $c('codTotal').textContent = formatDH(t.total);
    };
    renderHooks.push(codSync);
    const ppSync = () => {
      const size = ppSize();
      if (ppSizeVal) ppSizeVal.textContent = size || 'à choisir';
      if (size && ppSizeErr) { ppSizeErr.hidden = true; ppSizeBox?.classList.remove('is-error'); }
      if (ppQty) {
        const q = ppQtyVal();
        if (String(q) !== ppQty.value && document.activeElement !== ppQty) ppQty.value = q;
        document.querySelectorAll('.pp-qty-btn').forEach((b) => {
          b.disabled = +b.dataset.step < 0 ? q <= 1 : q >= MAX_QTY;
        });
      }
      if (ppBarMeta) ppBarMeta.textContent = [ppAddBtn.dataset.variant, size].filter(Boolean).join(' · ');
      codSync();
    };
    const ppNeedSize = () => {
      if (!ppSizeErr) return;
      ppSizeErr.hidden = false;
      ppSizeBox?.classList.remove('is-error');
      void ppSizeBox?.offsetWidth; // replay the shake
      ppSizeBox?.classList.add('is-error');
      if (ppSizeBox) smoothTo(ppSizeBox, { block: 'center' });
      document.querySelector('.pp-size-input')?.focus({ preventScroll: true });
    };
    ppBuy?.addEventListener('pp:needsize', ppNeedSize);
    document.querySelectorAll('.pp-size-input').forEach((r) => r.addEventListener('change', ppSync));
    document.querySelectorAll('.pp-qty-btn').forEach((b) => b.addEventListener('click', () => {
      ppQty.value = Math.max(1, Math.min(MAX_QTY, ppQtyVal() + +b.dataset.step));
      ppSync();
    }));
    ppQty?.addEventListener('input', ppSync);
    ppQty?.addEventListener('change', () => { ppQty.value = ppQtyVal(); ppSync(); });
    ppSync();
    if (ppCod && ppAddBtn) {
      ppCod.addEventListener('click', (e) => { if (e.target.closest('#codPick')) ppNeedSize(); });
      codForm(ppCod, {
        getOrder: () => {
          const d = ppAddBtn.dataset;
          const size = ppSize();
          if (ppBuy?.hasAttribute('data-need-size') && !size) { ppNeedSize(); return { blocked: 'Choisissez une taille (en haut du formulaire) pour continuer.' }; }
          const qty = ppQtyVal();
          const id = size ? `${d.id}--${size.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : d.id;
          return {
            source: 'fiche produit',
            sub: qty * (+d.price || 0),
            items: [{ id, name: d.name, colour: d.variant || '', size, qty, unitPrice: +d.price || 0, lineTotal: qty * (+d.price || 0) }],
          };
        },
        onSuccess: () => { if (ppQty) ppQty.value = 1; ppSync(); },
      });
    }

    // ---- sticky "Commander" bar (mobile): shown once the buy box's button has scrolled away,
    // hidden while the order form itself is on screen; it scrolls to the form ----
    const ppBar = document.getElementById('ppBar');
    document.getElementById('ppBarGo')?.addEventListener('click', () => {
      if (!ppCod) return;
      smoothTo(ppCod, { block: 'start' });
      $c('codTitle')?.focus({ preventScroll: true });
    });
    if (ppBar && ppAddBtn && 'IntersectionObserver' in window) {
      const footer = document.querySelector('.site-footer');
      let ppPast = false, ppAtFooter = false, ppCodIn = false;
      const ppBarSet = () => {
        const on = ppPast && !ppAtFooter && !ppCodIn;
        ppBar.classList.toggle('is-on', on);
        if (on) ppBar.removeAttribute('inert'); else ppBar.setAttribute('inert', '');
      };
      new IntersectionObserver(([en]) => {
        ppPast = !en.isIntersecting && en.boundingClientRect.top < 0;
        ppBarSet();
      }).observe(ppAddBtn);
      if (footer) new IntersectionObserver(([en]) => { ppAtFooter = en.isIntersecting; ppBarSet(); }).observe(footer);
      if (ppCod) new IntersectionObserver(([en]) => { ppCodIn = en.isIntersecting; ppBarSet(); }).observe(ppCod);
      // an instant jump (End key, a link, scrollTo) can skip right past the button without the
      // observer firing: re-check on scroll, once per frame
      let ppTick = 0;
      window.addEventListener('scroll', () => {
        if (ppTick) return;
        ppTick = requestAnimationFrame(() => {
          ppTick = 0;
          const r = ppAddBtn.getBoundingClientRect();
          const past = r.bottom <= 0;
          const atFooter = !!footer && footer.getBoundingClientRect().top < window.innerHeight;
          const cr = ppCod ? ppCod.getBoundingClientRect() : null;
          const codIn = !!cr && cr.top < window.innerHeight && cr.bottom > 0;
          if (past !== ppPast || atFooter !== ppAtFooter || codIn !== ppCodIn) { ppPast = past; ppAtFooter = atFooter; ppCodIn = codIn; ppBarSet(); }
        });
      }, { passive: true });
      ppBarSet();
    }
  }
})();
