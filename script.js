// Clean addresses (knockoutboxinggear.com/cgv, /rb10-intelli-shock-noir-rouge: GitHub Pages serves cgv.html for /cgv).
// - old GitHub Pages sub-path /KOBG/...: same page at the root;
// - on the 404 page: /RB10-Intelli-Shock-Noir-Rouge (GitHub Pages is case-sensitive) -> lower case, /cgv/ -> /cgv;
// - a page opened through its file name (/cgv.html, /index.html): the address bar shows the clean URL (same page, no reload).
(() => {
  const L = location, p = L.pathname, rest = L.search + L.hash;
  if (/^\/KOBG(?=\/|$)/i.test(p)) { L.replace((p.replace(/^\/KOBG/i, '') || '/') + rest); return; }
  if (document.body?.classList.contains('page-404') || document.querySelector('meta[name="kobg-404"]')) {
    const q = p.replace(/\/+$/, '') || '/';
    const low = q.toLowerCase();
    if (low !== p) L.replace(low + rest);
    return;
  }
  if (/\.html$/i.test(p)) {
    const clean = p.replace(/(?:^|\/)index\.html$/i, '/').replace(/\.html$/i, '') || '/';
    try { history.replaceState(history.state, '', clean + rest); } catch (err) { /* ignore */ }
  }
})();

// =========================================================
// CONFIG — edit here
// ORDERS (cash on delivery): the order forms (product pages + commande) POST each order here.
// Paste the URL of your Google Apps Script web app (ends with /exec, see order-apps-script.gs),
// or a Formspree form URL (https://formspree.io/f/xxxx, then set ORDER_ENDPOINT_FORMAT = 'form').
// Set (task 38) to the shop's Apps Script web app: every order, from any host (localhost too), is REALLY sent.
// If emptied: real visitors get "Commande indisponible pour le moment" and NO order is taken; only on
// localhost / 127.0.0.1 or with ?test=1 is a success then SIMULATED (labelled on merci, nothing sent).
const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzlxT2m1l9jRQZQYQeIqsGXkxUw0GgKvOhk05uxn-eQwuQ4SzFYbBzZDWkN1MLoBUY42w/exec';
const ORDER_ENDPOINT_FORMAT = 'json';   // 'json' = JSON text body (Apps Script) · 'form' = form-encoded (Formspree)
// WhatsApp number used by the CONTACT links only (footer, FAQ, contact page). Orders never go through WhatsApp.
// International format, digits only: 212 (Morocco) + the number without its leading 0, e.g. '2126XXXXXXXX'.
// Left EMPTY on purpose (task 45): no real number yet, so every WhatsApp button stays HIDDEN on the whole site.
// Fill it in here (this one line) and the buttons appear everywhere with the right link.
const WHATSAPP_NUMBER = '';
const CART_STORAGE_KEY = 'kobg-cart-v1';
const PROMO_STORAGE_KEY = 'kobg-promo-v1';   // the promo-code feature was removed: this old key is only cleared
// Delivery: free for every order (no minimum).
const SHIPPING_FEE = 0;
const FREE_SHIPPING_FROM = 2000;
// Loyalty points (customer accounts): 1 point = 1 DH; 50 points per full 1500 DH of delivered purchases.
// Display only: the Apps Script (LOYALTY there) credits, checks and deducts the points. Keep both equal.
const LOYALTY = { step: 1500, reward: 50 };
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
    if (document.body.classList.contains('menu-open') || document.body.classList.contains('cart-open') || document.documentElement.matches('.wheel-open, .sheet-open')) lenis.stop();
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
  // same-page anchors (#faq-tailles, gants#gants-de-sac from gants, breadcrumb, footer...)
  document.addEventListener('click', (e) => {
    if (!lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    const page = (path) => path.replace(/\/index(?:\.html)?$/, '/').replace(/\.html$/, '');
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
  mobile.addEventListener?.('change', (e) => {
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
  // reduced motion: no autoplay, the still poster only (back to frame 0 = the poster image)
  if (video && reduceMotion.matches) { video.removeAttribute('autoplay'); video.autoplay = false; video.pause(); video.currentTime = 0; }
  reduceMotion.addEventListener?.('change', (e) => { if (video && e.matches) { video.pause(); video.currentTime = 0; } });
  // the autoplay attribute can start it after this script has run
  video?.addEventListener('play', () => { if (!videoShouldPlay()) { video.pause(); if (reduceMotion.matches) video.currentTime = 0; } });
  if (video && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      videoOnScreen = entry.isIntersecting;
      syncVideo();
    }).observe(video);
  }
  reduceMotion.addEventListener?.('change', syncVideo);
  syncVideo();

  // ---------------------------------------------------------
  // Cart: client-side only. Items live in localStorage;
  // "Acheter maintenant" goes to commande (cash-on-delivery form + summary).
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
  // a malformed #%E0 in a shared link must not stop the rest of the page's script
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (err) { return s; } };

  // the product index (assets/search-index.js) is the price list: a saved line whose price is stale
  // (or was edited in the browser) gets today's price; a product or size that no longer exists is dropped.
  // The server re-prices every order the same way, so this only keeps what the shopper sees honest.
  const CATALOG = new Map((Array.isArray(window.KOBG_SEARCH) ? window.KOBG_SEARCH : []).map((p) => [p.id, p]));
  const sizeSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  function fromCatalog(it) {
    if (!CATALOG.size) return it;
    const [base, slug = ''] = String(it.id).split('--');
    const p = CATALOG.get(base);
    if (!p) return null;
    const size = (p.sizes || []).find((s) => sizeSlug(s) === slug) || '';
    if ((p.sizes || []).length ? !size : slug) return null;
    if (p.inStock === false || (size && (p.soldOut || []).includes(size))) return null; // out of stock: drop
    return { ...it, name: p.name, variant: [p.colour, size].filter(Boolean).join(' · '), price: p.price, img: p.img || it.img };
  }
  function loadCart() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      return Array.isArray(data)
        ? data.filter((it) => it && it.id && it.name && Number.isFinite(+it.price) && +it.qty > 0)
          .map((it) => fromCatalog({ ...it, price: +it.price, qty: Math.min(MAX_QTY, Math.floor(+it.qty)) }))
          .filter(Boolean)
        : [];
    } catch (err) { return []; }
  }
  let cart = loadCart();
  function saveCart() {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (err) { /* private mode: cart still works for this visit */ }
  }

  const totalQty = () => cart.reduce((n, it) => n + it.qty, 0);
  const totalPrice = () => cart.reduce((n, it) => n + it.qty * it.price, 0);

  // promo codes were removed: drop a code saved by an older version of the site
  try { localStorage.removeItem(PROMO_STORAGE_KEY); } catch (err) { /* ignore */ }
  // one rule everywhere (cart, checkout, product form): % off the subtotal; delivery always free
  // An order form (checkout, product page) may carry a « Roue de la chance » discount (signed in, ticked):
  // it comes off the items subtotal only.
  const wheelBoxes = new WeakMap();
  const wheelPct = (form) => (form && wheelBoxes.has(form) ? wheelBoxes.get(form).pct() : 0);
  function calcTotals(sub, form) {
    const w = wheelPct(form);
    const pct = w;
    const discount = Math.round(sub * pct / 100);
    const shipping = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    return { sub, pct, discount, shipping, total: sub - discount + shipping, wheel: !!w, code: w ? 'Roue de la chance' : '' };
  }
  const totals = () => calcTotals(totalPrice());
  const plainDH = (n) => formatDH(n).replace(/\u00a0/g, ' ');
  const renderHooks = [];     // checkout summary, product order form: re-drawn with the cart

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
      discountCode.textContent = t.code;
    }
    shippingEl.textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
    totalEl.textContent = formatDH(t.total);
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
    // the name links to the product page (its clean URL in the search index) when the product is in the index
    const pageId = String(it.id).split('--')[0];
    const hit = (window.KOBG_SEARCH || []).find((p) => p.id === pageId);
    const hasPage = !!(hit && hit.url);
    return `
    <li class="cart-item" data-id="${esc(it.id)}">
      <img class="cart-item-img" src="${esc(it.img || '')}" alt="" width="72" height="90" decoding="async">
      <div class="cart-item-info">
        <p class="cart-item-name">${hasPage ? `<a class="cart-item-link" href="${esc(hit.url)}">${esc(it.name)}</a>` : esc(it.name)}</p>
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



  function addToCart(btn) {
    const d = btn.dataset;
    if (!d.id || btn.disabled || 'oos' in d) return;   // out of stock (colour)
    // the size picker (card <select> or product-page radios) turns into part of the line: its own id + "Couleur · Taille".
    // Product pages: data-scope points at the buy box (also used by the sticky mobile bar), which holds the size + quantity.
    const scope = d.scope ? document.getElementById(d.scope) : btn.closest('.product');
    const sizeSel = scope?.querySelector('.product-size, .pp-size-input:checked');
    const size = sizeSel ? sizeSel.value : '';
    if (sizeSel && (sizeSel.disabled || sizeSel.selectedOptions?.[0]?.disabled)) return; // out of stock (size)
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
  // "Acheter maintenant" -> commande; already there: just close the drawer and go to the form
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
  // back / forward cache (browser Back): the page returns as it was left, but the cart and code may have changed since
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    cart = loadCart();
    render();
    acctPaint();
  });

  render();

  // =========================================================
  // Orders: cash-on-delivery forms (product pages + commande). One send function: sendOrder().
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
    // refusals from the order server (_ops/order-apps-script.gs)
    bad_field: 'Merci de corriger le champ indiqué en rouge.',
    bad_item: 'Un article de votre commande n’est plus disponible (modèle ou taille). Actualisez la page, vérifiez votre panier puis réessayez.',
    bad_order: 'Votre commande n’a pas pu être enregistrée : vérifiez les quantités puis réessayez.',
    too_many: 'Plusieurs commandes ont déjà été envoyées avec ce numéro : nous vous appelons très vite pour les confirmer. Pour une autre demande, écrivez-nous à info@knockoutboxinggear.com.',
    busy: 'Beaucoup de commandes en ce moment : réessayez dans une minute.',
    bad_points: 'Votre solde de points a changé : vérifiez le montant des points à utiliser puis confirmez à nouveau.',
    auth: 'Votre session a expiré : le total a été recalculé sans vos points ni votre remise. Reconnectez-vous pour les utiliser, ou confirmez la commande sans eux.',
    bad_wheel: 'Votre remise « Roue de la chance » n’est plus disponible (déjà utilisée ou expirée). Vérifiez le total puis confirmez à nouveau.',
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
      if (data && (data.ok === false || data.result === 'error')) {
        return { ok: false, error: Object.prototype.hasOwnProperty.call(ORDER_ERRORS, data.error) ? data.error : 'http', field: data.field,
          balance: Number.isFinite(data.balance) ? data.balance : null, max: Number.isFinite(data.max) ? data.max : null };
      }
      // the Apps Script always answers { ok: true, … } once the order is stored: anything else is not a confirmation
      // (a retry re-sends the same order number, so it can't be stored twice)
      if (ORDER_ENDPOINT_FORMAT === 'json' && !(data && data.ok === true)) return { ok: false, error: 'http' };
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err && err.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }


  // =========================================================
  // Customer accounts (optional; compte + assets/account.js). Same backend as the orders.
  // The session token lives in localStorage ("Rester connecté") or sessionStorage (this tab only).
  // Signed in: the header icon gets a dot, order forms are pre-filled and orders are linked to the account.
  // =========================================================
  const ACCT_KEY = 'kobg-account-v1';
  const ACCT_TOKEN = /^k1\.[A-Za-z0-9_-]{43}$/;
  const acctStores = () => { const s = []; try { s.push(localStorage, sessionStorage); } catch (err) { /* storage blocked */ } return s; };
  const acctStore = {
    read() {
      for (const st of acctStores()) {
        try {
          const o = JSON.parse(st.getItem(ACCT_KEY) || 'null');
          if (o && ACCT_TOKEN.test(o.token) && o.exp > Date.now() && o.profile && typeof o.profile === 'object') return o;
          if (o) st.removeItem(ACCT_KEY);
        } catch (err) { /* corrupt entry: ignored */ }
      }
      return null;
    },
    // { session, exp, profile } from the server; remember = localStorage
    save(res, remember) {
      const cur = this.read();
      const keep = remember == null ? !!(cur && cur.remember) : !!remember;
      const o = { token: res.session || (cur && cur.token), exp: res.exp || (cur && cur.exp), profile: res.profile || (cur && cur.profile) || {}, remember: keep };
      if (!ACCT_TOKEN.test(o.token)) return null;
      this.clear();
      try { (keep ? localStorage : sessionStorage).setItem(ACCT_KEY, JSON.stringify(o)); } catch (err) { /* private mode: this page only */ }
      acctPaint();
      return o;
    },
    clear() { acctStores().forEach((st) => { try { st.removeItem(ACCT_KEY); } catch (err) { /* ignore */ } }); acctPaint(); },
  };
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const ACCT_ERRORS = {
    unavailable: 'L’espace client est indisponible pour le moment. Vous pouvez toujours commander sans compte.',
    timeout: 'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.',
    network: 'Connexion impossible : vérifiez votre connexion internet puis réessayez.',
    http: 'Une erreur est survenue. Réessayez dans un instant.',
    server: 'Une erreur est survenue. Réessayez dans un instant.',
    bad_login: 'E-mail ou mot de passe incorrect.',
    locked: 'Trop d’essais. Réessayez dans {min} min, ou choisissez un nouveau mot de passe avec « Mot de passe oublié ».',
    busy: 'Le service est très sollicité : réessayez dans quelques minutes.',
    email_taken: 'Un compte existe déjà avec cet e-mail. Connectez-vous ou utilisez « Mot de passe oublié ».',
    weak_password: 'Mot de passe trop faible : 8 caractères minimum, évitez les suites évidentes (12345678, motdepasse…).',
    bad_field: 'Merci de corriger le champ indiqué en rouge.',
    bad_password: 'Mot de passe actuel incorrect.',
    bad_reset: 'Ce lien n’est plus valable (déjà utilisé, remplacé par un plus récent ou expiré). Demandez-en un nouveau.',
    mail_unavailable: 'Envoi de l’e-mail impossible pour le moment. Réessayez plus tard ou écrivez-nous à info@knockoutboxinggear.com.',
    auth: 'Votre session a expiré : reconnectez-vous.',
  };
  // one account call: { ok:true, ...data } or { ok:false, error, field?, retryIn? }; 'auth' signs out locally
  async function acctApi(action, data = {}) {
    const url = orderEndpoint();
    if (!url || ORDER_ENDPOINT_FORMAT === 'form') return { ok: false, error: 'unavailable' };
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 25000);
    try {
      const res = await fetch(url, {
        method: 'POST', body: JSON.stringify({ ...data, action }), signal: ctrl?.signal, redirect: 'follow', credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'text/plain;charset=utf-8' },
      });
      if (!res.ok) return { ok: false, error: 'http' };
      let out = null;
      try { out = await res.json(); } catch (err) { out = null; }
      if (!out || typeof out !== 'object') return { ok: false, error: 'http' };
      if (out.ok === false && out.error === 'auth') acctSignedOut();
      return out.ok === false ? { ...out, error: String(out.error || 'http') } : { ...out, ok: true };
    } catch (err) {
      return { ok: false, error: err && err.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }
  const acctMsg = (res) => (ACCT_ERRORS[res.error] || ACCT_ERRORS.http).replace('{min}', String(Math.max(1, Math.ceil((+res.retryIn || 60) / 60))));

  // header icon (every page)
  const acctBtn = document.getElementById('acctBtn');
  function acctPaint() {
    if (!acctBtn) return;
    const s = acctStore.read();
    acctBtn.classList.toggle('is-in', !!s);
    acctBtn.setAttribute('aria-label', s ? `Mon compte${firstName(s.profile.nom) ? ` (${firstName(s.profile.nom)}, connecté)` : ' (connecté)'}` : 'Mon compte : se connecter ou créer un compte');
    acctBtn.title = s ? 'Mon compte' : 'Se connecter';
  }
  const acctHooks = [];
  // signed in / out / another account: order-form notes, points and discount boxes, then every total, re-drawn
  const acctChanged = () => { acctHooks.forEach((fn) => fn()); renderHooks.forEach((fn) => fn()); };
  // the server answered 'auth' (expired or revoked session): carry on as a guest, and show it at once
  function acctSignedOut() { acctStore.clear(); acctChanged(); }
  acctPaint();
  window.addEventListener('storage', (e) => { if (e.key === ACCT_KEY || e.key === null) { acctPaint(); acctChanged(); } });

  // order forms: pre-fill from the profile, a one-line "signed in / sign in" note above the fields
  function acctOrderForm(form) {
    const fs = form.querySelector('.cod-fields');
    if (!fs) return;
    const note = document.createElement('p');
    note.className = 'acct-note';
    fs.before(note);
    const back = encodeURIComponent(location.pathname.split('/').pop().replace(/\.html$/, '') || 'accueil');
    const filled = {};                     // what fill() typed in: replaced if another account signs in, never what the visitor typed
    const fill = () => {
      const s = acctStore.read();
      if (!s) {
        note.innerHTML = `Vous avez un compte&nbsp;? <a href="compte?retour=${back}">Connectez-vous</a> pour pré-remplir vos coordonnées, suivre la commande et cumuler des points fidélité <span class="acct-note-opt">(facultatif)</span>.`;
        return;
      }
      const p = s.profile;
      const where = [p.adresse, p.ville].filter(Boolean).join(', ');
      note.innerHTML = `<span class="acct-note-in"><strong>Connecté${p.nom ? ` : ${esc(p.nom)}` : ''}</strong> · commande enregistrée dans <a href="compte">votre compte</a>.</span>${where ? `<span class="acct-note-adr">Adresse enregistrée : ${esc(where)}</span>` : ''}`;
      [['nom', p.nom], ['telephone', p.telephone ? phonePretty(p.telephone) : ''], ['ville', p.ville]].forEach(([n, v]) => {
        const el = form.elements[n];
        if (el && v && (!el.value.trim() || el.value === filled[n])) { el.value = v; filled[n] = v; }
      });
    };
    const box = ptsBoxes.get(form);
    const wbox = wheelBoxes.get(form);
    const paint = () => { fill(); box?.render(); wbox?.render(); };
    fill();
    acctHooks.push(paint);
    // one quiet check that the session is still valid (profile current, points balance); a dead one = guest order.
    // Checkout: at once. Product pages: only when the order form comes near the screen.
    let asked = false;
    let askedFor = '';                     // the session the points / discount below belong to
    const ask = () => {
      const s = acctStore.read();
      if (asked || !s) return;
      asked = true;
      askedFor = s.token;
      acctApi('me', { session: s.token }).then((r) => {
        if (r.ok && r.profile) acctStore.save({ profile: r.profile });
        if (r.ok) wbox?.set(r.wheel || null);
        if (r.ok && r.points) box?.set(r.points);
        else asked = false;
        paint();
      });
    };
    if (form.closest('[data-checkout]') || !('IntersectionObserver' in window)) ask();
    else {
      const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); ask(); } }, { rootMargin: '400px 0px' });
      io.observe(form);
    }
    acctHooks.push(() => {
      const s = acctStore.read();
      // signed out, or another account: the previous one's points and discount go, then the new one is asked
      if ((s ? s.token : '') !== askedFor) { askedFor = ''; asked = false; box?.set(null); wbox?.set(null); }
      if (s && !box?.info()) { asked = false; ask(); }
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { asked = false; ask(); paint(); } });
  }

  // ---- loyalty points at checkout (signed in): "Utiliser mes points", an amount, capped at the order total ----
  // The render hooks ask ptsUse(form, total) how much comes off; the server checks the balance again.
  const ptsBoxes = new WeakMap();
  const ptsUse = (form, total) => (form && ptsBoxes.has(form) ? ptsBoxes.get(form).apply(total) : 0);
  let ptsSeq = 0;
  function pointsBox(form) {
    const id = `ptsAmount${++ptsSeq}`;
    const box = document.createElement('div');
    box.className = 'pts-box';
    box.hidden = true;
    box.innerHTML = `
      <p class="pts-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Points fidélité</span><strong class="pts-bal"></strong></p>
      <label class="pts-use"><input type="checkbox" class="pts-check"><span>Utiliser mes points sur cette commande</span></label>
      <div class="pts-amount" hidden>
        <label class="pts-amount-label" for="${id}">Montant à déduire</label>
        <div class="pts-amount-row">
          <input class="pts-input" id="${id}" type="number" inputmode="numeric" min="1" step="1" autocomplete="off" form="" aria-describedby="${id}Hint">
          <span class="pts-unit" aria-hidden="true">DH</span>
          <button type="button" class="pts-all">Tout utiliser</button>
        </div>
        <p class="pts-hint" id="${id}Hint" aria-live="polite"></p>
      </div>
      <p class="pts-earn"></p>`;
    (form.querySelector('.cod-due') || form.querySelector('.cod-alert')).before(box);
    const check = box.querySelector('.pts-check');
    const input = box.querySelector('.pts-input');
    const amount = box.querySelector('.pts-amount');
    let info = null;
    let total = 0;
    const cap = () => (info ? Math.max(0, Math.min(Math.floor(info.balance), total)) : 0);
    const chosen = () => {
      const n = Math.floor(+input.value);
      return Number.isFinite(n) ? Math.max(0, Math.min(n, cap())) : 0;
    };
    const redraw = () => renderHooks.forEach((fn) => fn());
    const ctl = {
      info: () => info,
      set(p) { info = p && Number.isFinite(+p.balance) ? { ...p, balance: +p.balance } : null; ctl.render(); redraw(); },
      on: () => !!(info && acctStore.read() && check.checked && cap() > 0),
      apply(t) { total = Math.max(0, +t || 0); ctl.render(); return ctl.on() ? chosen() : 0; },
      render() {
        const s = acctStore.read();
        box.hidden = !(s && info);
        if (box.hidden) return;
        const c = cap();
        box.querySelector('.pts-bal').textContent = `${formatDH(Math.max(0, info.balance))} disponibles`;
        check.disabled = c <= 0;
        if (c <= 0) check.checked = false;
        box.querySelector('.pts-use').classList.toggle('is-off', c <= 0);
        amount.hidden = !check.checked;
        input.max = String(c);
        if (check.checked && document.activeElement !== input && (+input.value > c || !(+input.value >= 1))) input.value = String(c);
        const used = ctl.on() ? chosen() : 0;
        box.querySelector('.pts-hint').textContent = check.checked
          ? `Jusqu’à ${formatDH(c)} sur cette commande${used ? ` · solde après : ${formatDH(info.balance - used)}` : ''}.`
          : '';
        const next = Number.isFinite(+info.next) && +info.next > 0 ? +info.next : LOYALTY.step;
        box.querySelector('.pts-earn').textContent = `Plus que ${formatDH(next)} d’achats livrés pour gagner ${formatDH(info.reward || LOYALTY.reward)}.`;
      },
    };
    check.addEventListener('change', () => { if (check.checked) input.value = String(cap()); redraw(); if (check.checked) input.focus(); });
    input.addEventListener('input', redraw);
    input.addEventListener('change', () => { input.value = String(chosen() || cap()); redraw(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    box.querySelector('.pts-all').addEventListener('click', () => { input.value = String(cap()); redraw(); });
    ptsBoxes.set(form, ctl);
    return ctl;
  }
  // ---- « Roue de la chance » discount at checkout (signed in, won on the wheel, claimed, not used, not expired) ----
  function wheelBox(form) {
    const box = document.createElement('div');
    box.className = 'wheel-box';
    box.hidden = true;
    box.innerHTML = `
      <p class="pts-head"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg><span>Roue de la chance</span><strong class="wheel-val"></strong></p>
      <label class="pts-use"><input type="checkbox" class="wheel-check" checked><span class="wheel-use-txt"></span></label>
      <p class="wheel-hint" aria-live="polite"></p>`;
    (form.querySelector('.cod-due') || form.querySelector('.cod-alert')).before(box);
    const check = box.querySelector('.wheel-check');
    let info = null;
    const redraw = () => renderHooks.forEach((fn) => fn());
    const ctl = {
      info: () => info,
      set(w) {
        info = w && w.kind === 'remise' && w.state === 'active' && +w.value > 0 && +w.value <= 100 ? { ...w, value: +w.value } : null;
        ctl.render(); redraw();
      },
      on: () => !!(info && acctStore.read() && check.checked),
      pct: () => (ctl.on() ? info.value : 0),
      render() {
        box.hidden = !(acctStore.read() && info);
        if (box.hidden) return;
        box.querySelector('.wheel-val').textContent = `-${info.value}\u00a0%`;
        box.querySelector('.wheel-use-txt').textContent = `Utiliser ma remise de -${info.value}\u00a0% sur les articles`;
        box.querySelector('.wheel-hint').textContent = `${info.until ? `Valable jusqu’au ${info.until}, ` : ''}une seule commande.`;
      },
    };
    check.addEventListener('change', redraw);
    renderHooks.push(() => ctl.render());
    wheelBoxes.set(form, ctl);
    return ctl;
  }
  // the "Points fidélité -X DH" line, created once just above a summary's total line
  function ptsLine(totalStrong, cls) {
    const row = totalStrong?.closest('p');
    if (!row) return null;
    let line = row.previousElementSibling;
    if (!line || !line.classList.contains('js-pts-line')) {
      line = document.createElement('p');
      line.className = `${cls} cod-line--pts js-pts-line`;
      line.hidden = true;
      line.innerHTML = '<span>Points fidélité</span><strong></strong>';
      row.before(line);
    }
    return line;
  }
  function showPts(totalStrong, cls, used) {
    const line = ptsLine(totalStrong, cls);
    if (!line) return;
    line.hidden = !used;
    line.querySelector('strong').textContent = `-${formatDH(used)}`;
  }

  // ---- « Roue de la chance »: the visitor's spin (signed token from the server), kept in this browser ----
  // { token, slice, prize, at, claimBy, claimed, refused? }. The token is what proves the result: the browser
  // can't change the prize (signature), and the server allows one claim per spin, account, e-mail and phone.
  const WHEEL_KEY = 'kobg-wheel-v1';
  const WHEEL_TOKEN = /^w1\.[A-Za-z0-9]{16}\.\d{1,2}\.[a-z0-9]{1,24}\.[0-9a-z]{6,10}\.[A-Za-z0-9_-]{43}$/;
  const WHEEL_ERRORS = {
    wheel_used: 'Ce lot a déjà été attribué à un autre compte.',
    wheel_account: 'Votre compte a déjà reçu un lot de la Roue de la chance : un seul lot par personne.',
    wheel_person: 'Un lot de la Roue de la chance a déjà été attribué avec cet e-mail ou ce numéro de téléphone : un seul lot par personne.',
    wheel_expired: 'Ce tirage date de plus de 30 jours : le lot ne peut plus être réclamé.',
    wheel_bad: 'Ce tirage n’est pas valable.',
    wheel_off: 'La Roue de la chance est terminée pour le moment.',
  };
  const wheelStore = {
    read() {
      try {
        const o = JSON.parse(localStorage.getItem(WHEEL_KEY) || 'null');
        if (o && WHEEL_TOKEN.test(o.token) && o.prize && typeof o.prize === 'object') return o;
      } catch (err) { /* blocked or corrupt */ }
      return null;
    },
    save(o) { try { localStorage.setItem(WHEEL_KEY, JSON.stringify(o)); } catch (err) { /* private mode: this visit only */ } },
    patch(x) { const o = this.read(); if (o) this.save({ ...o, ...x }); return o ? { ...o, ...x } : null; },
    // why this spin can't be attached (for whoever is signed in now), '' if it still can. A refusal about one account
    // (« already has a prize ») doesn't stop another person on this browser; past its 30 days an unclaimed spin is expired.
    refusal(o) {
      if (!o || o.claimed) return '';
      if (o.refused && (!o.refusedBy || o.refusedBy === acctEmail())) return o.refused;
      return o.claimBy && o.claimBy <= Date.now() ? 'wheel_expired' : '';
    },
    // a prize still to attach to an account (not yet claimed, not refused, claim window open)
    pending() { const o = this.read(); return o && !o.claimed && !this.refusal(o) ? o : null; },
  };
  const WHEEL_ACCOUNT_ERRORS = ['wheel_account', 'wheel_person'];    // about the account that tried, not about the spin
  const acctEmail = () => { const s = acctStore.read(); return s ? String(s.profile.email || '').toLowerCase() : ''; };
  // attach the stored prize to the signed-in account: { ok, wheel, balance } | { ok:false, error, message } | null (nothing to claim)
  async function wheelClaim(session) {
    const w = wheelStore.pending();
    if (!w || !session) return null;
    const r = await acctApi('wheel_claim', { session, token: w.token });
    if (r.ok) { wheelStore.patch({ claimed: true }); return r; }
    if (r.error === 'wheel_used' && r.mine) { wheelStore.patch({ claimed: true }); return { ok: true, already: true }; }
    // final (not retried): for the spin, or for this account only
    if (WHEEL_ERRORS[r.error]) wheelStore.patch({ refused: r.error, refusedBy: WHEEL_ACCOUNT_ERRORS.includes(r.error) ? acctEmail() : '' });
    return { ...r, message: WHEEL_ERRORS[r.error] || acctMsg(r) };
  }

  window.KOBGAccount = Object.freeze({
    api: acctApi, store: acctStore, message: acctMsg, errors: ACCT_ERRORS,
    wheel: Object.freeze({ store: wheelStore, claim: wheelClaim, errors: WHEEL_ERRORS }),
    phoneOK, phoneLocal, phonePretty, normPhone, esc, formatDH, firstName,
    available: () => !!orderEndpoint() && ORDER_ENDPOINT_FORMAT !== 'form',
  });

  const COD_RULES = {
    nom: (v) => (v.trim().length < 3 || !/\p{L}{2}/u.test(v) ? 'Indiquez votre nom complet.' : ''),
    ville: (v) => (v.trim().length < 2 ? 'Indiquez votre ville.' : ''),
    telephone: (v) => (!normPhone(v) ? 'Indiquez votre numéro de téléphone.'
      : phoneOK(v) ? '' : 'Numéro invalide : 06 ou 07 suivi de 8 chiffres (ou +212 6… / +212 7…).'),
  };
  // wires one order form: inline French errors, honeypot, busy state (no double submit), send, then merci.
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
      submit.disabled = on || form.classList.contains('is-oos');
      submit.classList.toggle('is-loading', on);
      submit.setAttribute('aria-busy', String(on));
      submitTxt.textContent = on ? 'Envoi en cours…' : (form.classList.contains('is-oos') ? 'Épuisé' : 'Confirmer la commande');
    };
    window.addEventListener('pageshow', (e) => { if (e.persisted) setBusy(false); });   // back from merci
    const wheel = wheelBox(form);
    const pts = pointsBox(form);
    acctOrderForm(form);
    if (form.classList.contains('is-oos')) {   // sold out: every control (incl. the ones added by JS) stays disabled
      const lock = () => form.querySelectorAll('input, select, textarea, button').forEach((el) => { if (!el.disabled) el.disabled = true; });
      lock();
      new MutationObserver(lock).observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }
    // One order number per order: a retry after a timeout or a lost reply re-sends the same number, and the server
    // stores it only once (same number + same phone). Anything changed (items, phone, points, discount) = a new number.
    let pending = null;                    // { key, id } of the last attempt that did not succeed
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      if (form.classList.contains('is-oos')) { showAlert('Ce produit est épuisé : la commande est impossible pour le moment.'); return; }   // sold out
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
      const t = calcTotals(order.sub, form);
      const used = pts.apply(t.total);
      const key = JSON.stringify([order.items, phoneLocal(val('telephone')), used, t.wheel, '']);
      if (!pending || pending.key !== key) pending = { key, id: newOrderId() };
      const payload = {
        orderId: pending.id,
        date: new Date().toISOString(),
        nom: val('nom'),
        telephone: phoneLocal(val('telephone')),
        ville: val('ville'),
        items: order.items,
        itemCount: order.items.reduce((n, it) => n + it.qty, 0),
        subtotal: t.sub,
        promoCode: '',
        ...(t.wheel ? { wheel: true } : {}),
        discountPct: t.pct,
        discount: t.discount,
        delivery: t.shipping,
        total: t.total - used,
        ...(used ? { points: used } : {}),
        currency: 'MAD',
        source: order.source,
        page: location.origin + location.pathname,
      };
      setBusy(true);
      const acct = acctStore.read();                   // signed in: the order goes to the account (token never stored)
      const res = await sendOrder(acct ? { ...payload, session: acct.token } : payload);
      if (!res.ok) {
        setBusy(false);
        const bad = res.error === 'bad_field' && fields.find((el) => el.name === res.field);
        if (bad) setErr(bad, 'Vérifiez ce champ.');
        if (res.error === 'bad_points' && res.balance != null && pts.info()) pts.set({ ...pts.info(), balance: res.balance });
        if (res.error === 'auth') acctSignedOut();       // the total on screen drops the points / discount at once
        if (res.error === 'bad_wheel') wheel.set(null);
        showAlert(res.error === 'bad_points' && res.balance != null
          ? `Votre solde de points a changé : ${formatDH(Math.max(0, res.balance))} disponibles. Vérifiez le montant puis confirmez à nouveau.`
          : ORDER_ERRORS[res.error] || ORDER_ERRORS.network);
        smoothTo(alertEl, { block: 'center' });
        return;
      }
      // the server re-prices the order from the catalog: its numbers (and its order number) are the ones that count
      const srv = res.data && Number.isFinite(res.data.total) ? res.data : null;
      const done = srv ? {
        ...payload,
        orderId: /^KOBG-\d{6}-[A-Z0-9]{4}$/.test(srv.orderId) ? srv.orderId : payload.orderId,
        items: Array.isArray(srv.items) ? srv.items : payload.items,
        subtotal: +srv.subtotal || 0, promoCode: srv.promoCode || '', discountPct: +srv.discountPct || 0,
        discount: +srv.discount || 0, delivery: +srv.delivery || 0, total: srv.total, linked: srv.linked === true,
        points: +srv.points || 0, balance: Number.isFinite(srv.balance) ? srv.balance : null, wheel: +srv.wheel || 0,
      } : payload;
      pending = null;
      try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ ...done, test: !!res.test })); } catch (err) { /* private mode */ }
      onSuccess(done);
      form.reset();
      fields.forEach((el) => setErr(el, ''));
      location.href = `merci?commande=${encodeURIComponent(done.orderId)}${new URLSearchParams(location.search).get('test') === '1' ? '&test=1' : ''}`;
    });
    return { showAlert };
  }

  // ---- commande: COD form + cart summary (collapsible on phones) ----
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
      const t = calcTotals(totalPrice(), $('codForm'));
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
        coSum.querySelectorAll('.js-disc-code').forEach((el) => { el.textContent = t.code; });
        coSum.querySelectorAll('.js-disc-pct').forEach((el) => { el.textContent = t.pct; });
      }
      $('coShip').textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
      const used = ptsUse($('codForm'), t.total);
      showPts($('coTotal'), 'cart-line', used);
      $('coTotal').textContent = formatDH(t.total - used);
      $('coSumToggleTotal').textContent = formatDH(t.total - used);
      $('codDue').textContent = formatDH(t.total - used);
      if (!qty && !wasEmpty && document.activeElement === document.body) $('coEmptyH')?.focus();
    };
    renderHooks.push(coRender);
    coRender();
    // Back from merci (back / forward cache): the summary follows the cart again
    window.addEventListener('pageshow', (e) => { if (e.persisted) { coLeaving = false; coRender(); } });
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

  // ---- merci: order number + recap (sessionStorage, this visit only) ----
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
        ${o.discount ? `<p class="cart-line cod-line--disc"><span>Réduction ${o.promoCode === 'ROUE' ? 'Roue de la chance' : esc(o.promoCode)} (-${esc(o.discountPct)}&nbsp;%)</span><strong>-${formatDH(o.discount)}</strong></p>` : ''}
        <p class="cart-line"><span>Livraison</span><strong>${o.delivery ? formatDH(o.delivery) : 'Offerte'}</strong></p>
        ${o.points ? `<p class="cart-line cod-line--pts"><span>Points fidélité</span><strong>-${formatDH(+o.points)}</strong></p>` : ''}
        <p class="cart-total"><span>À payer à la livraison</span><strong>${formatDH(o.total || 0)}</strong></p>`;
      $('merciCust').innerHTML = [['Nom', o.nom], ['Téléphone', o.telephone ? phonePretty(o.telephone) : ''], ['Ville', o.ville]]
        .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
      $('merciRecap').hidden = false;
      if (o.linked) {
        const p = document.createElement('p');
        p.className = 'acct-note acct-note--merci';
        p.innerHTML = `Cette commande est enregistrée dans <a href="compte">votre compte</a> : suivez son statut à tout moment.${o.balance != null ? ` Solde de points fidélité : <strong>${formatDH(Math.max(0, +o.balance))}</strong>.` : ''} Elle vous rapportera des points une fois livrée (${formatDH(LOYALTY.reward)} tous les ${formatDH(LOYALTY.step)} d’achat).`;
        $('merciCust').after(p);
      }
    }
  }

  // Carousels: every .products section (Best-sellers, Gants de sac, Gants de sparring, Plastrons, Guide d’achat) gets its own
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
      const item = hash && hash.length > 1 ? document.getElementById(safeDecode(hash.slice(1))) : null;
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
    // no WhatsApp number yet: the two big WhatsApp buttons (FAQ, footer) become "Nous contacter" -> contact;
    // the small links and the contact-page card are hidden by CSS (html:not(.has-wa)).
    document.querySelectorAll('#faqWhatsapp, .footer-wa').forEach((a) => {
      a.href = 'contact';
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
  // Shop pages (gants, protecteur-corporel): filter chips + price sort + #hash filters
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
    const fromHash = (scroll) => applyFilter(safeDecode(location.hash.slice(1)) || 'tous', { scroll });
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
  // Search: header field on every page (live suggestions) + recherche (all results).
  // Static site: the product index is assets/search-index.js, generated by tools/build32.py
  // from the homepage cards. Matching ignores accents/case and tolerates small typos.
  // ---------------------------------------------------------
  const PRODUCTS = Array.isArray(window.KOBG_SEARCH) ? window.KOBG_SEARCH : [];
  const oosRank = (p) => (p.inStock === false ? 1 : 0); // in-stock products first, sold-out last (stable)
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
    return res.sort((a, b) => oosRank(a.p) - oosRank(b.p) || b.score - a.score || a.p.order - b.p.order).map((r) => r.p);
  }
  const resultsWord = (n) => `${n} résultat${n > 1 ? 's' : ''}`;
  const searchUrl = (q) => `recherche?q=${encodeURIComponent(q.trim())}`;

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

    // narrow phones: the field can be ~60 px wide; when « RECHERCHER » does not fit, the magnifier alone says it
    // (no half word; the aria-label is unchanged). Re-checked whenever the field changes size (header shrinks on scroll).
    const phText = searchInput.placeholder;
    const phMeasure = document.createElement('span');
    phMeasure.setAttribute('aria-hidden', 'true');
    phMeasure.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;text-transform:uppercase';
    phMeasure.textContent = phText;
    const phFit = () => {
      const cs = getComputedStyle(searchInput, '::placeholder');
      Object.assign(phMeasure.style, { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontVariationSettings: cs.fontVariationSettings, letterSpacing: cs.letterSpacing });
      document.body.appendChild(phMeasure);
      const fits = phMeasure.getBoundingClientRect().width <= searchInput.clientWidth + 1;
      phMeasure.remove();
      if (searchInput.placeholder !== (fits ? phText : '')) searchInput.placeholder = fits ? phText : '';
    };
    if ('ResizeObserver' in window) new ResizeObserver(phFit).observe(searchInput);
    document.fonts?.ready.then(phFit);

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
            <span class="search-opt-price">${formatDH(p.price)}${p.compareAt > p.price ? `<s class="price-was">${formatDH(p.compareAt)}</s>` : ''}</span>
          </a>
        </li>`).join('') + (res.length ? `
        <li class="search-opt search-opt--all" role="option" id="searchOptAll" aria-selected="false">
          <a href="${esc(searchUrl(q))}" tabindex="-1">Voir tous les résultats (${res.length})<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        </li>` : '');
      list.hidden = !res.length;
      none.hidden = !!res.length;
      if (!res.length) {
        none.innerHTML = `<p class="search-none-h">Aucun produit trouvé pour «&nbsp;${esc(q)}&nbsp;»</p>
          <p class="search-none-links"><a href="gants">Gants</a><a href="protecteur-corporel">Protecteur corporel</a></p>`;
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

  // ---- recherche: every matching card (same markup as the collection pages) ----
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
      const res = q ? searchProducts(q) : PRODUCTS.slice().sort((a, b) => oosRank(a) - oosRank(b));
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
    const setUrl = (q) => history.replaceState(null, '', q.trim() ? searchUrl(q) : 'recherche');
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

  // ---- collection pages: gants#produit-<id> scrolls to that card and highlights it ----
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
      const t = calcTotals(qty * (+d.price || 0), ppCod);
      const needSize = ppBuy?.hasAttribute('data-need-size');
      $c('codSel').innerHTML = `${esc(d.variant || '')}${needSize ? ` · ${size ? esc(size) : '<button type="button" class="cod-pick" id="codPick">Taille à choisir</button>'}` : ''}`;
      $c('codUnit').textContent = formatDH(+d.price || 0);
      $c('codQty').textContent = qty;
      $c('codSub').textContent = formatDH(t.sub);
      $c('codDiscLine').hidden = !t.pct;
      if (t.pct) {
        $c('codDisc').textContent = `-${formatDH(t.discount)}`;
        ppCod.querySelectorAll('.js-disc-code').forEach((el) => { el.textContent = t.code; });
        ppCod.querySelectorAll('.js-disc-pct').forEach((el) => { el.textContent = t.pct; });
      }
      $c('codShip').textContent = t.shipping ? formatDH(t.shipping) : 'Offerte';
      const used = ptsUse(ppCod, t.total);
      showPts($c('codTotal'), 'cod-line', used);
      $c('codTotal').textContent = formatDH(t.total - used);
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
      document.querySelector('.pp-size-input:not(:disabled)')?.focus({ preventScroll: true });
    };
    ppBuy?.addEventListener('pp:needsize', ppNeedSize);
    document.querySelectorAll('.pp-size-input').forEach((r) => r.addEventListener('change', () => {   // sold-out size: never selectable
      if (r.disabled || r.closest('.is-oos')) { r.checked = false; ppSync(); }
    }, true));
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
          if (ppAddBtn.disabled || 'oos' in ppAddBtn.dataset) return { blocked: 'Ce coloris est en rupture de stock pour le moment.' };
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

// Sold-out sizes (Épuisé) are never clickable, focusable or selected: card <select>s fall back to the first in-stock size.
(() => {
  const isOosOpt = (o) => o && (o.disabled || /Épuisé/.test(o.textContent));
  const fixSelect = (sel) => {
    [...sel.options].forEach((o) => { if (isOosOpt(o)) { o.disabled = true; o.setAttribute('aria-disabled', 'true'); } });
    if (isOosOpt(sel.selectedOptions[0])) {
      const ok = [...sel.options].find((o) => !o.disabled);
      if (ok) sel.value = ok.value; else { sel.disabled = true; sel.setAttribute('aria-disabled', 'true'); }
    }
  };
  const fixRadio = (r) => {
    if (r.disabled || r.closest('.is-oos')) {
      r.disabled = true; r.tabIndex = -1; r.setAttribute('aria-disabled', 'true');
      r.closest('label')?.setAttribute('aria-disabled', 'true');
      if (r.checked) r.checked = false;
    }
  };
  const run = () => {
    document.querySelectorAll('select.product-size').forEach(fixSelect);
    document.querySelectorAll('.pp-size-input').forEach(fixRadio);
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches?.('select.product-size') && isOosOpt(t.selectedOptions[0])) { e.stopImmediatePropagation(); fixSelect(t); }
    if (t.matches?.('.pp-size-input') && (t.disabled || t.closest('.is-oos'))) { e.stopImmediatePropagation(); t.checked = false; }
  }, true);
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.pp-size-btn.is-oos')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  window.addEventListener('pageshow', run);   // back/forward cache can restore a stale selection
})();
