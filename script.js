// Knockout Boxing Gear — header, hero and product carousel interactions
(function () {
  const burger = document.getElementById('burger');
  const nav = document.getElementById('mainNav');
  const dropToggle = document.querySelector('.drop-toggle');
  const drop = document.querySelector('.nav-drop');
  const behindMenu = document.querySelectorAll('.hero, .products');
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
      // the sheet hangs off the header: jump (not scroll) back to the top first
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
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

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!isMenuOpen());
  });

  dropToggle.addEventListener('click', (e) => {
    e.stopPropagation();
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

  // desktop dropdown: tabbing out of it closes it
  drop.addEventListener('focusout', (e) => {
    if (!isMenuOpen() && !drop.contains(e.relatedTarget)) setDrop(false);
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
      setDrop(false);
      if (hadFocus) dropToggle.focus();
    }
  });

  // Video: plays only while it's on screen and not behind the menu; never for reduced motion
  let videoOnScreen = true;
  const videoShouldPlay = () => videoOnScreen && !isMenuOpen() && !reduceMotion.matches;
  function syncVideo() {
    const play = videoShouldPlay();
    if (play && video.paused) video.play().catch(() => {});
    else if (!play && !video.paused) video.pause();
  }
  // the autoplay attribute can start it after this script has run
  video.addEventListener('play', () => { if (!videoShouldPlay()) video.pause(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      videoOnScreen = entry.isIntersecting;
      syncVideo();
    }).observe(video);
  }
  reduceMotion.addEventListener('change', syncVideo);
  syncVideo();

  // Add to cart (hero + and card buttons): bump the header badge, confirm with a toast
  const cartBtn = document.getElementById('cartBtn');
  const cartCount = document.getElementById('cartCount');
  const toast = document.getElementById('toast');
  const toastTxt = toast.querySelector('.toast-txt');
  const addedTimers = new WeakMap();
  let count = 0;
  let toastTimer;

  function addToCart(name, btn) {
    count += 1;
    cartCount.textContent = count;
    cartBtn.setAttribute('aria-label', `Panier, ${count} article${count > 1 ? 's' : ''}`);
    cartBtn.classList.add('has-items');
    cartBtn.classList.remove('is-bumped');
    void cartBtn.offsetWidth;
    cartBtn.classList.add('is-bumped');

    btn.classList.add('is-added');
    clearTimeout(addedTimers.get(btn));
    addedTimers.set(btn, setTimeout(() => btn.classList.remove('is-added'), 1400));

    toastTxt.textContent = count > 1
      ? `${name} ajouté · ${count} au panier`
      : `${name} ajouté au panier`;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  const plus = document.querySelector('.plus-btn');
  plus.addEventListener('click', () => addToCart('Knockout Pro', plus));
  document.querySelectorAll('.product-add').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.name, btn));
  });

  // Carousel: native scroll-snap track (touch and trackpads just work), arrows step
  // one card, mouse can drag, thin progress bar
  const products = document.querySelector('.products');
  const track = document.getElementById('gloveTrack');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const thumb = document.getElementById('carouselThumb');
  const cards = track.children;
  const glide = () => (reduceMotion.matches ? 'auto' : 'smooth');
  // scrollLeft that brings card i to the start of the track
  const cardLeft = (i) => cards[i].offsetLeft - cards[0].offsetLeft;

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
  track.addEventListener('scroll', queueSync, { passive: true });
  track.addEventListener('scrollend', () => { clearTimeout(targetTimer); settle(); });
  new ResizeObserver(measure).observe(track);

  // mouse drag: free movement while held, then a glide to the next card in the
  // drag's direction (snap is off meanwhile so the two don't fight)
  let drag = null;
  let swallowClick = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.product-add')) return;
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
    products.classList.add('will-reveal');
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      products.classList.remove('will-reveal');
      products.classList.add('is-in');
      io.disconnect();
    }, { threshold: .15 });
    io.observe(products);
  }
})();
