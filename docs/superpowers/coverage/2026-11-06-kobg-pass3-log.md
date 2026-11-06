# KOBG conversion coverage — after Pass 3 (2026-11-06)

| Pass | Book | Status |
|------|------|--------|
| 1 | Schwartz | Implemented |
| 2 | Whitman / Cashvertising | Implemented |
| 3 | Barden / Decoded | **Implemented** (scoped CSS hierarchy/imagery/type) |
| 4 | Dooley | Pending + evidence-dependent |
| 5 | Ariely | Pending |
| 6 | Cialdini | Evidence-needed / pending |
| 7 | Great Leads (6 types) | Partial (Pass1 lead); full evaluation pending |

## Pass 3 design changes (hypotheses — not guaranteed effects)

CSS-only in `styles.css` (`KOBG Pass3` block). No HTML copy/asset/price changes.

1. Hero promo secondary: smaller `.promo-big`, lower `.promo-deco` opacity (0.42) under `.hero .panel--promo`.
2. Path CTAs primary: `.hero-path` min-height 48px, stronger shadow/border; focus-visible accent kept.
3. Product cards: media `object-position: 50% 36%` (cover, no stretch); name line-height 1.08.
4. Flagship gallery: stage `#f2f2f2`; clearer thumb focus/active.
5. `prefers-reduced-motion: reduce`: disable PDP zoom transform. Limitation: CSS cannot pause hero `<video>` autoplay.

## Preserved
Pass1 lead/paths/scrim; Pass2 homepage + RS11V copy; catalog/backend hashes.

## Files
`styles.css`, `_ops/pass3-assert.py`, plan + this coverage log.

## Update
Pass 4 completed — see `2026-11-06-kobg-pass4-log.md`. Passes 5–7 still pending.
