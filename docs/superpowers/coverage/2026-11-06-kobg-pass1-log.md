# KOBG Pass 1 coverage log — 2026-11-06

**Pass:** 1 / 7 (Schwartz — market sophistication, awareness, mass desire / attention hooks)  
**Status:** Pass 1 implementation complete on standalone extract. Passes 2–7 **pending**. Do not treat the conversion program as finished.

## Hypotheses (not facts)

- **Awareness:** primary homepage visitors are Solution-aware → Product-aware (need gloves / know Rival), not Unaware.  
- **Desire channeled:** choose the correct Rival glove family for training type (sac vs sparring), not a newly created desire.  
- **Sophistication:** ~stage 2–3 in Morocco Rival retail (features + “official” claims already noisy); Pass 1 avoids stacking more feature/official hooks in the lead.

These are working assumptions for copy structure only — not proven audience research.

## Great Leads note

Shipped lead type: **Promise + Problem-Solution** (approved sentence). Evaluating all six types (Promise, Problem-Solution, Big Idea, Secret, Story, Proclamation) remains for a later pass; not claimed done here.

## Changes

| File | Change |
|------|--------|
| `index.html` | Badge demoted from `<h1>` to `<p>` (visual chrome unchanged). New single `<h1>` with exact approved lead + sr-only SEO fragment. Added `nav.hero-paths` with `a.hero-path` → `gants#gants-de-sac` / `gants#gants-de-sparring`. |
| `styles.css` | Append-only Pass 1 block for `.headline--lead`, `.hero-lead-text`, `.hero-paths`, `.hero-path` (+ narrow breakpoint). Original bytes preserved as prefix. |
| `_ops/pass1-assert.py` | Automated acceptance checks (created). |
| `docs/superpowers/plans/2026-11-06-kobg-pass1.md` | Implementation plan. |
| `docs/superpowers/coverage/2026-11-06-kobg-pass1-log.md` | This log. |

**Unchanged (hash-verified):** `script.js`, `assets/search-index.js`, `assets/wheel.js`, `assets/account.js`, `assets/admin.js`, `assets/meta-pixel.js`, `commande.html`, `_ops/order-apps-script.gs`.

## Mapping

| Spec Pass 1 acceptance | Result |
|------------------------|--------|
| Exact French lead visible | Yes (HTML + HTTP `/` on extract server) |
| Two primary path links with working destinations | Yes → category sections with real headings/products |
| One H1 strategy + SEO intent preserved | Yes (`gants de boxe Rival au Maroc` in H1 via sr-only) |
| No new authenticity/performance/policy claims | Yes |
| Prices / stock / shipping / loyalty / wheel / orders untouched | Yes (sensitive hashes) |

## Verification run

- TDD: assert script failed before HTML/CSS change; passed after.  
- Fresh: `python3 _ops/pass1-assert.py` → `PASS1 ASSERT OK`.  
- HTTP (extract preview `http://127.0.0.1:8081/`): lead ×1, hero-path ×2, `/gants` exposes `#gants-de-sac` and `#gants-de-sparring`.  
- No real orders; fake backend only.  
- **Limitation:** no desktop/browser automation permitted here — parent should visually QA hero at ~390px and ~1440px (lead wrap, CTA tap targets, video/badge still OK).

## Package

`/workspace/KOBG-pass-1.zip` — top-level `KOBG-main/`, excludes `.pass1-backup/`.

## Next

Pass 2 (Whitman hierarchy) only after parent visual check / go-ahead. Not started.

## Post-QA contrast fix (desktop 1280x800)

**Issue (from parent screenshot):** white `.headline--lead` text crossed the white decorative `.notch--bl` cutout (bottom-left of `.panel--feature`), so leading glyphs ("Vo...") lost contrast.

**Fix (`styles.css` Pass 1 block only):**
1. Offset `.headline--lead` and `.hero-paths` with `left: calc(var(--notch) + var(--g))` so copy/CTAs sit clear of the notch.
2. Dark scrim on the lead: `background: rgba(0,0,0,.72)` + padding/radius so all headline glyphs sit on a dark field even if residual overlap occurs.
3. Mobile: keep verified 390px fit; lead `bottom: calc(var(--notch) + 52px)`; paths still notch-clear on the left.

No HTML copy/href changes; sensitive files unchanged. Pass 2 still pending.
