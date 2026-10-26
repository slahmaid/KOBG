// =========================================================
// CONFIG — edit here
// WhatsApp number that receives orders from the cart's "Commander" button.
// International format, digits only (212 = Morocco, without the leading 0).
// PLACEHOLDER: replace with the shop's real WhatsApp number before going live.
const WHATSAPP_NUMBER = '212600000000';
const CART_STORAGE_KEY = 'kobg-cart-v1';
// Promo codes accepted in the cart (static site: checked client-side, confirmed on WhatsApp).
const PROMO_CODES = { KOBG26: 10 };          // code -> % off the subtotal
const PROMO_STORAGE_KEY = 'kobg-promo-v1';
// Delivery: 25 DH, free from 500 DH of products (threshold uses the subtotal BEFORE the discount).
const SHIPPING_FEE = 25;
const FREE_SHIPPING_FROM = 500;
// =========================================================

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
  // Cart: client-side only (no backend). Items live in localStorage;
  // "Commander" opens WhatsApp with the order summary pre-filled.
  // ---------------------------------------------------------
  const cartBtn = document.getElementById('cartBtn');
  const cartCount = document.getElementById('cartCount');
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  const cartList = document.getElementById('cartList');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartFoot = document.getElementById('cartFoot');
  const cartHeadCount = document.getElementById('cartHeadCount');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartCheckout = document.getElementById('cartCheckout');
  const discountLine = document.getElementById('cartDiscountLine');
  const discountEl = document.getElementById('cartDiscount');
  const discountCode = document.getElementById('cartDiscountCode');
  const shippingEl = document.getElementById('cartShipping');
  const totalEl = document.getElementById('cartTotal');
  const promoForm = document.getElementById('cartPromo');
  const promoInput = document.getElementById('cartPromoInput');
  const promoInputRow = promoForm.querySelector('.cart-promo-row');
  const promoOn = document.getElementById('cartPromoOn');
  const promoCodeEl = document.getElementById('cartPromoCode');
  const promoMsg = document.getElementById('cartPromoMsg');
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
  function totals() {
    const sub = totalPrice();
    const pct = promo ? PROMO_CODES[promo] : 0;
    const discount = Math.round(sub * pct / 100);
    const shipping = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    return { sub, pct, discount, shipping, total: sub - discount + shipping };
  }
  const plainDH = (n) => formatDH(n).replace(/\u00a0/g, ' ');

  function whatsappLink() {
    const t = totals();
    const lines = cart.map((it) => `• ${it.qty} × ${it.name}${it.variant ? ` (${it.variant})` : ''} : ${plainDH(it.qty * it.price)}`);
    const msg = [
      'Bonjour Knockout Boxing Gear, je souhaite passer commande :',
      '',
      ...lines,
      '',
      `Sous-total : ${plainDH(t.sub)} (${plural(totalQty())})`,
      ...(t.pct ? [`Code promo : ${promo} (-${t.pct} %) : -${plainDH(t.discount)}`] : []),
      `Livraison : ${t.shipping ? plainDH(t.shipping) : 'offerte'}`,
      `Total : ${plainDH(t.total)}`,
      '',
      'Merci de me confirmer la disponibilité et la livraison.',
    ].join('\n');
    return `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  }

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
    promoInputRow.hidden = !!promo;
    promoOn.hidden = !promo;
    promoCodeEl.textContent = promo;
    cartEmpty.hidden = qty > 0;
    cartFoot.hidden = qty === 0;
    cartList.hidden = qty === 0;
    cartCheckout.href = qty ? whatsappLink() : '#';

    cartList.innerHTML = cart.map((it) => {
      const label = esc(`${it.name}${it.variant ? ` ${it.variant.toLowerCase()}` : ''}`);
      return `
      <li class="cart-item" data-id="${esc(it.id)}">
        <img class="cart-item-img" src="${esc(it.img || '')}" alt="" width="72" height="90" decoding="async">
        <div class="cart-item-info">
          <p class="cart-item-name">${esc(it.name)}</p>
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
    }).join('');
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

  function setPromoMsg(text, isError) {
    promoMsg.textContent = text;
    promoMsg.classList.toggle('is-error', !!isError);
    promoInput.setAttribute('aria-invalid', isError ? 'true' : 'false');
  }
  promoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normCode(promoInput.value);
    if (!code) { setPromoMsg('Saisissez un code promo.', true); promoInput.focus(); return; }
    if (!PROMO_CODES[code]) { setPromoMsg(`Le code « ${code} » n’est pas valide.`, true); promoInput.select(); return; }
    promo = code;
    savePromo();
    promoInput.value = '';
    render();
    setPromoMsg(`Code ${code} appliqué : -${PROMO_CODES[code]} % sur votre commande.`, false);
    document.getElementById('cartPromoRemove').focus();
  });
  promoInput.addEventListener('input', () => { if (promoMsg.classList.contains('is-error')) setPromoMsg('', false); });
  document.getElementById('cartPromoRemove').addEventListener('click', () => {
    promo = '';
    savePromo();
    render();
    setPromoMsg('Code promo retiré.', false);
    promoInput.focus();
  });
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
    // the card's size picker (gloves) turns into part of the line: its own id + "Couleur · Taille"
    const sizeSel = btn.closest('.product')?.querySelector('.product-size');
    const size = sizeSel ? sizeSel.value : '';
    const id = size ? `${d.id}--${size.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : d.id;
    const variant = [d.variant || '', size].filter(Boolean).join(' · ');
    const line = cart.find((it) => it.id === id);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + 1);
    else cart.push({ id, name: d.name, variant, price: +d.price || 0, img: d.img || '', qty: 1 });
    saveCart();
    render();
    bumpBadge();

    btn.classList.add('is-added');
    clearTimeout(addedTimers.get(btn));
    addedTimers.set(btn, setTimeout(() => btn.classList.remove('is-added'), 1400));

    const qty = totalQty();
    const label = `${d.name}${variant ? ` ${variant.toLowerCase()}` : ''}`;
    showToast(qty > 1 ? `${label} ajouté · ${plural(qty)} au panier` : `${label} ajouté au panier`);
  }

  document.querySelectorAll('.product-add').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn));
  });

  // quantity +/- and remove (event delegation; focus is put back after each re-render)
  cartList.addEventListener('click', (e) => {
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
      const next = cartList.children[Math.min(idx, cartList.children.length - 1)];
      (next ? next.querySelector('.cart-remove') : document.getElementById('cartShop')).focus();
    } else {
      const again = cartList.querySelector(`.cart-item[data-id="${CSS.escape(id)}"] [data-act="${act}"]`);
      if (again && !again.disabled) again.focus();
      else if (again) again.parentElement.querySelector(`[data-act="${act === 'inc' ? 'dec' : 'inc'}"]`).focus();
    }
  });

  const isCartOpen = () => document.body.classList.contains('cart-open');
  function setCart(open) {
    if (open === isCartOpen()) return;
    if (open) {
      if (isMenuOpen()) setMenu(false);
      lastFocus = document.activeElement;
    }
    document.body.classList.toggle('cart-open', open);
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
  cartCheckout.addEventListener('click', (e) => {
    if (!cart.length) e.preventDefault();
    else cartCheckout.href = whatsappLink();
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
    if (wa) {
      const msg = 'Bonjour Knockout Boxing Gear, j’ai une question :';
      wa.href = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
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
  document.querySelectorAll('.js-wa').forEach((a) => {
    const msg = 'Bonjour Knockout Boxing Gear, je souhaite passer une commande.';
    a.href = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  });
  document.getElementById('backToTop')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    // keyboard users land back at the top too (first visible logo link)
    [...document.querySelectorAll('.bar-logo, .nav-logo')].find((l) => l.offsetParent && !l.closest('[inert]'))?.focus({ preventScroll: true });
  });
  // ---------------------------------------------------------
  // Gants page (gants.html): filter chips + price sort + #hash filters
  // ---------------------------------------------------------
  const shop = document.querySelector('[data-shop]');
  if (shop) {
    const groups = [...shop.querySelectorAll('.cat-group')];
    const chips = [...shop.querySelectorAll('.chip[data-filter]')];
    const sortSel = shop.querySelector('#gantsSort');
    const count = shop.querySelector('#gantsCount');
    groups.forEach((g) => [...g.querySelectorAll('.product')].forEach((li, i) => { li.dataset.order = i; }));
    function applyFilter(f, { scroll = false } = {}) {
      if (!groups.some((g) => g.id === f)) f = 'tous';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === f)));
      let n = 0;
      groups.forEach((g) => {
        const show = f === 'tous' || g.id === f;
        g.hidden = !show;
        if (show) n += g.querySelectorAll('.product').length;
      });
      count.textContent = `${n} produit${n > 1 ? 's' : ''}`;
      if (scroll && f !== 'tous') {
        document.getElementById(f).scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
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
})();
