# KOBG conversion coverage — after Pass 5 (2026-11-06)

| Pass | Book | Status |
|------|------|--------|
| 1 | Schwartz | Implemented |
| 2 | Whitman | Implemented |
| 3 | Barden | Implemented |
| 4 | Dooley | Implemented |
| 5 | Ariely / Predictably Irrational | **Implemented** (explicit 0 DH delivery + payable-at-delivery totals) |
| 6 | Cialdini | Evidence-needed / pending |
| 7 | Great Leads (6 types) | Partial (Pass1); full evaluation pending |

## Pass 5 visible changes
- Shipping display `Offerte` → **`0 DH`** in `script.js` (4 display sites) + HTML initials (`cartShipping` / `coShip` / `codShip`)
- Cart/checkout total label → **« Total à payer à la livraison »**
- PDP/COD note (`.cod-ship-note`) → **« Livraison : 0 DH partout au Maroc. »**
- CSS Pass5 emphasis on those lines

## Unchanged math
`SHIPPING_FEE = 0`, `FREE_SHIPPING_FROM = 2000`, shipping formula unchanged. Mock order: `delivery: 0`, total equals subtotal.

## Evidence-dependent / inappropriate this cycle (evaluated, not silently skipped)
- **compareAt / % savings amplification:** evidence-dependent (provenance unverified) — not amplified
- **Decoy prices / new anchors:** inappropriate this cycle
- **Bundles / fabricated bundle discounts:** inappropriate this cycle
- **“No hidden fees” wording:** not used (not fully evidenced beyond shown totals)

## Justified sensitive updates
- `script.js` hash updated (**display strings only**; calc snippets asserted stable)
- `commande.html` hash refreshed for label/0 DH initials

## Limitations
- Parent visual QA for cart drawer with items; no shell browser automation
- Pass3 reduced-motion runtime still unverified
- Use preview `:8081` / `:3700` only (`/__dev.js` mock) — not `file://`
