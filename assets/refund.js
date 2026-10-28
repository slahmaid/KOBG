/* Politique de remboursement : bottom sheet opened by any link with class "js-refund"
   (static link under each order form, href="cgv.html#remboursement" so it still works without JS).
   Content = summary of CGV articles 6–9 ter; the CGV stay the reference. */
(() => {
  'use strict';
  if (window.kobgRefund) return;
  const MAIL = 'info@knockoutboxinggear.com';
  const CGV = 'cgv.html#remboursement';
  const html = `
  <div class="sheet-panel">
    <header class="sheet-head">
      <div class="sheet-grab" aria-hidden="true"></div>
      <p class="promo-tag sheet-tag"><span class="promo-dot" aria-hidden="true"></span><span>Rétractation et retours</span></p>
      <h2 class="sheet-h" id="refundTitle">Politique de remboursement</h2>
      <button type="button" class="sheet-x" aria-label="Fermer la politique de remboursement">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>
    </header>
    <div class="sheet-body" id="refundBody" tabindex="0" aria-label="Contenu de la politique de remboursement">
      <p class="sheet-lead">Résumé des articles 6 à 9 ter de nos <a href="${CGV}">conditions générales de vente</a>, qui font foi.</p>
      <section class="sheet-sec">
        <h3>Rien à payer en ligne</h3>
        <ul>
          <li>Le paiement se fait uniquement <strong>à la livraison, en espèces</strong>, auprès du livreur.</li>
          <li>Tant que la commande n’est pas expédiée, vous pouvez la <strong>modifier ou l’annuler sans frais</strong> (lors de l’appel de confirmation ou par e-mail).</li>
          <li>Si elle n’est pas livrée dans un délai raisonnable au regard des délais annoncés, vous pouvez l’annuler sans frais.</li>
        </ul>
      </section>
      <section class="sheet-sec">
        <h3>Délais de retour</h3>
        <ul>
          <li><strong>14 jours à compter de la réception</strong> : notre politique de retour, au-delà du délai légal de 7 jours (loi n° 31-08).</li>
          <li><strong>Articles soldés</strong> (prix barré) : délai légal de 7 jours uniquement. Ils restent couverts par les garanties légales.</li>
        </ul>
      </section>
      <section class="sheet-sec">
        <h3>Comment faire</h3>
        <ol>
          <li>Avant tout renvoi, écrivez à <a href="mailto:${MAIL}">${MAIL}</a> : votre nom, le téléphone utilisé pour la commande, le numéro de commande si vous l’avez et les articles concernés.</li>
          <li>Nous répondons sous 24 h (jours ouvrés) avec l’adresse et les modalités de retour.</li>
          <li>Les colis renvoyés sans demande préalable ne sont pas acceptés.</li>
        </ol>
      </section>
      <section class="sheet-sec">
        <h3>État des produits</h3>
        <p>Complets, dans leur emballage d’origine, avec leurs étiquettes et dans l’état où vous les avez reçus. Vous pouvez les essayer (taille, maintien) mais pas vous entraîner avec : pour des raisons d’hygiène, des gants ou un protecteur portés à l’entraînement (sac, sparring) ne sont pas repris.</p>
      </section>
      <section class="sheet-sec">
        <h3>Frais de retour</h3>
        <p>À votre charge, sauf si le produit reçu est défectueux, endommagé ou ne correspond pas à votre commande.</p>
      </section>
      <section class="sheet-sec">
        <h3>Produit défectueux, endommagé ou erroné</h3>
        <p>Inspectez votre commande dès réception et écrivez-nous immédiatement (photo si possible) si un article est défectueux, endommagé ou ne correspond pas à votre commande (modèle, taille, coloris). Après vérification, il est <strong>remplacé ou, à défaut, remboursé</strong>, et les frais de retour sont à notre charge. Cela s’ajoute au droit de rétractation et aux garanties légales.</p>
      </section>
      <section class="sheet-sec">
        <h3>Remboursement</h3>
        <ul>
          <li>Les sommes payées pour les produits retournés, <strong>y compris les frais de livraison initiaux</strong> si vous retournez toute la commande.</li>
          <li><strong>Sans délai et au plus tard sous 15 jours</strong> après l’exercice de votre droit de rétractation.</li>
          <li>Par <strong>virement bancaire</strong> ou tout autre moyen convenu avec vous (le paiement ayant été fait en espèces).</li>
          <li>Nous vous informons dès la réception et la vérification du retour. Pas remboursé(e) sous 15 jours ? Écrivez-nous.</li>
        </ul>
      </section>
      <section class="sheet-sec">
        <h3>Échanges</h3>
        <p>Pour changer de taille ou de coloris : retournez l’article dans les conditions ci-dessus puis, une fois le retour accepté, passez une nouvelle commande. Un doute entre deux tailles ? Écrivez-nous avant de commander.</p>
      </section>
      <section class="sheet-sec">
        <h3>Points fidélité et Roue de la chance</h3>
        <ul>
          <li>Commande annulée ou retournée : les <strong>points utilisés sont recrédités</strong>.</li>
          <li>Retour d’une commande livrée : les points qu’elle avait rapportés sont déduits du solde (qui peut devenir temporairement négatif, puis se reconstitue avec vos prochains achats).</li>
          <li>Les points et les lots de la Roue de la chance n’ont <strong>pas de valeur monétaire</strong> : ils ne sont pas échangeables contre de l’argent.</li>
        </ul>
      </section>
      <p class="sheet-foot"><a class="sheet-cgv" href="${CGV}">Lire les articles 6 à 9 ter des CGV</a><span> · Contact : <a href="mailto:${MAIL}">${MAIL}</a></span></p>
    </div>
  </div>`;

  let dlg = null, lastFocus = null, closing = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.id = 'refundSheet';
    dlg.setAttribute('aria-labelledby', 'refundTitle');
    dlg.setAttribute('data-lenis-prevent', '');
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.querySelector('.sheet-x').addEventListener('click', close);
    // backdrop click (the dialog box itself is only the transparent area around the panel)
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });   // Escape → animated close
    dlg.addEventListener('close', () => {
      clearTimeout(closing); closing = 0;
      dlg.classList.remove('is-in', 'is-out');
      document.documentElement.classList.remove('sheet-open');
      window.kobgLenis?.start?.();
      if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    });
    // focus trap (showModal already makes the page inert; this keeps Tab cycling inside the sheet)
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...dlg.querySelectorAll('a[href], button, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function open(trigger) {
    if (!dlg) build();
    if (dlg.open && !closing) return;
    clearTimeout(closing); closing = 0;
    lastFocus = trigger || document.activeElement;
    dlg.classList.remove('is-out');
    if (!dlg.open) dlg.showModal();
    document.documentElement.classList.add('sheet-open');
    window.kobgLenis?.stop?.();
    dlg.querySelector('.sheet-body').scrollTop = 0;
    dlg.querySelector('.sheet-x').focus();
    requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-in')));
  }
  function close() {
    if (!dlg || !dlg.open || closing) return;
    dlg.classList.remove('is-in'); dlg.classList.add('is-out');
    closing = setTimeout(() => dlg.close(), reduce.matches ? 0 : 280);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.js-refund');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a);
  });
  window.kobgRefund = { open, close };
})();
