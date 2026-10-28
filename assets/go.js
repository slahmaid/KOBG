// Redirect stub (old product address, e.g. gants-de-sac-rival-rb10-intelli-shock-noir-rouge.html): goes to the clean URL
// given in data-to, keeping ?query and #hash (old e-mails, carts, search results). <meta http-equiv="refresh"> is the no-JS fallback.
(() => {
  const me = document.currentScript;
  const to = me && me.dataset.to;
  if (to && /^\/[a-z0-9-]*$/.test(to)) location.replace(to + location.search + location.hash);
})();
