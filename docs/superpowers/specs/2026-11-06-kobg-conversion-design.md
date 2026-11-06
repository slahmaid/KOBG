# KOBG conversion design — 2026-11-06

**Status:** design only — awaiting final user approval before any code edits.  
**Source:** audited extract `/workspace/kobg-audit-20261106-015144-2913489/KOBG-main` (standalone ZIP; no git).  
**Direction approved:** product-benefits + purchase-confidence. Language FR; currency MAD (DH); keep Knockout/Rival visual system (Archivo, black/grey panels, accent `#d0202a`).

**Hard limits:** Do not change catalog prices, `compareAt`, `soldOut` / `inStock`, shipping fee math, loyalty step/reward, wheel odds, or Apps Script order pricing. No new offers. No fake timers, stock counters, reviews, discounts, medical/protection guarantees, or champion endorsements. Existing site lines (free ship, COD, 24–48 h, 7-day returns, “distributeur officiel”, “prix habituel”) stay **existing claims**, not elevated to proven facts. Frameworks below are structuring heuristics — not universal laws or conversion guarantees.

---

## Goal

Above the fold, help a Morocco visitor pick **sac vs sparring** (and next product path) with clear benefits; below that, reinforce **how buying works** (COD, delivery, returns, size, authenticity FAQ as already on site) without inventing proof.

## Approved first-pass hero (pass 7 lead)

Replace soft “Conçu pour le ring” emphasis with:

- **Lead (Promise + Problem-Solution):** « Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement. »
- **Primary actions:** two product-selection controls — « Gants de sac » and « Gants de sparring » must reuse the corresponding working category destinations already used by home sections; verify both targets before delivery.
- **Keep as secondary/chrome (do not newly assert):** official-distributor badge treatment already in H1/badge; promo “Jusqu’à -23 %” only if left as current card — do not strengthen wording; do not add unverified authenticity claims in the new lead.
- **H1/SEO:** preserve accessible “gants de boxe Rival au Maroc” intent; visible marketing line is the approved lead (implementer may keep sr-only SEO fragment if needed — no new claim text).

---

## Sequential passes (all seven)

| # | Book | Mapping | Spec’d change | Acceptance |
|---|------|---------|---------------|------------|
| 1 | Schwartz — awareness / desire / sophistication | **Planned** | Home lead channels existing desire (right glove for training type), not feature-stack or “official” as the hook. Assume Solution→Product-aware. | Lead + two paths visible without scroll on common mobile/desktop; no new mass-desire claims beyond training fit. |
| 2 | Whitman — Life Force 8 / hierarchy | **Planned** (relevant drives only: injury-avoidance via correct glove type; value via existing price chips) | Headline hierarchy: lead > path CTAs > secondary promo/collection panels. Price presentation unchanged (DH, compareAt as today). | Typographic/visual order matches; no new psychological copy (“hardwired”, etc.). |
| 3 | Barden — implicit value | **Planned** | Hero System-1: glove imagery/video + clear training choice; %-off stays secondary panel. CTA contrast uses existing accent/black buttons. | One primary decision (sac/sparring) readable in ~1 glance; promo not competing as equal primary. |
| 4 | Dooley — friction / sensory / CRO | **Planned** + **evidence-dependent** | Friction: clarify COD form labels/help using existing fields only (`nom`, `ville`, `telephone`). Sensory: prefer existing fiche words (e.g. microfibre, V-Strap, oz) in path labels/subcopy — no new performance promises. CRO: define tests, don’t ship winners as fact. | Order form still 3 fields + honeypot; no extra required fields. Subcopy cites only text already on PDPs/FAQ. |
| 5 | Ariely — free / anchors / bundles | **Planned** (free ship framing already on site) · **Not appropriate** now for new anchors/bundles | Keep zero-cost “livraison gratuite” wording as-is. Do **not** add decoys, bundles, or new compare-at logic. | `SHIPPING_FEE`, `FREE_SHIPPING_FROM`, prices, loyalty untouched. |
| 6 | Cialdini — scarcity / proof / reciprocity | **Evidence-dependent** · fake tactics **Not appropriate** | Scarcity UI only if wired to real `soldOut`/`inStock` (optional later). Social proof: **no** review blocks until real reviews supplied. Reciprocity: no new gifts; existing loyalty/wheel/FAQ may be linked more clearly, not rewritten as guarantees. | Zero invented reviews/timers/counters. No champion endorsement modules. |
| 7 | Masterson/Forde — Great Leads | **Planned** | Ship approved Promise + Problem-Solution lead; evaluate all six lead types (Promise, Problem-Solution, Big Idea, Secret, Story, Proclamation); document which fit available evidence and prepare truthful test variants where supported, rather than forcing every lead onto the same page. | Exact approved French sentence (or trivial punctuation-only tweak) present; path buttons primary. |

**Explicitly not appropriate this cycle:** fake urgency, fabricated discounts, medical claims, “#1 / most sold” amplification beyond existing PDP sentences, authenticity claims not already on the page.

---

## Files / modules / data flow (no backend redesign)

| Area | Touch (when implementing later) | Must not break |
|------|----------------------------------|---------------|
| Home hero | `index.html` (+ `styles.css` if CTA layout) | Marquee/FAQ/cart chrome |
| Path targets | Existing `gants.html` / in-page anchors / collection links | URL scheme without `.html` |
| PDP / cards | Optional microcopy alignment only | `assets/search-index.js` prices & stock |
| Checkout confidence | `commande.html` help text; shared COD partials on PDPs if identical | `script.js` `sendOrder`, Apps Script re-price |
| Loyalty / wheel | Link/clarify only | `LOYALTY`, wheel claim rules |
| Admin / `_ops` | Out of scope | — |

**Data flow unchanged:** browser cart → `commande` / PDP COD → `ORDER_ENDPOINT` → Apps Script validates against live `search-index.js` → sheet. Client totals are display-only.

---

## Evidence dependencies (unknowns stay open)

- Legal `data-todo` ×16; Moroccan contact vs CA WhatsApp.  
- Proof assets for “distributeur officiel” / authenticity (none in ZIP).  
- Real customer reviews (none in ZIP).  
- Body-shield stock fields incomplete in index.  
- Whether “prix habituel” / -23 % remains policy-accurate.  
- Operational claims (24–48 h, 7-day returns, free ship) = site text only until business confirms.

Do not fill these with invented values in implementation.

---

## Error handling / responsive / a11y / order-path checks (no real orders)

- **Responsive:** hero lead + both path buttons usable at ~390px and ~1440px; no horizontal clip; tap targets ≥ existing CTA sizes.  
- **A11y:** one clear H1 strategy; buttons are `<a>` or `<button>` with discernible names; don’t rely on color alone for sac vs sparring; keep `prefers-reduced-motion` behavior for hero video as today.  
- **Errors:** COD validation messages unchanged in meaning; out-of-stock still blocked via existing `inStock`/`soldOut` logic.  
- **Order-path tests (local only):** `node _ops/dev-server.js` + fake backend — open home → path → PDP → add available size → cart → `commande` UI fill → submit to mock (no production Apps Script, no real order). Confirm empty cart / OOS paths still show existing alerts.

---

## Out of scope

Sitewide redesign, new SKUs/prices/promos, review widgets, legal entity fill-in, WhatsApp number change, Apps Script redeploy, i18n, git/repo/network publish.

## Self-review

No TBD placeholders for copy that was approved; unknowns listed as evidence dependencies. No contradiction with “don’t change price/loyalty/shipping math.” Alt discount-forward / founder-story leads deferred. Spec is design-only — implementation starts only after user final approval of this document.
