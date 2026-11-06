# KOBG conversion coverage — after Pass 6 (2026-11-06)

| Pass | Book | Status |
|------|------|--------|
| 1 | Schwartz | Implemented |
| 2 | Whitman | Implemented |
| 3 | Barden | Implemented |
| 4 | Dooley | Implemented |
| 5 | Ariely / Predictably Irrational | Implemented |
| 6 | Cialdini / Influence | **Implemented** (truthful catalog availability + loyalty clarity only) |
| 7 | Great Leads (6 types) | Partial (Pass1); full evaluation pending |

## Pass 6 visible changes
- PDP `#ppAvail` (role=status, aria-live=polite): live text from existing `KOBG_SEARCH` `soldOut` / `inStock` only — e.g. « Taille 14 oz : disponible selon le catalogue. », « Taille 12 oz : épuisée selon le catalogue. », « Épuisé selon le catalogue. », « Disponibilité selon le catalogue. » (body shields missing stock fields), « Choisissez une taille. Disponibilité selon le catalogue. »
- Updates on size selection (pointer + keyboard change events via existing `ppSync`)
- Loyalty perk / cart notes: **50 DH / 1 500 DH d’achats livrés**, crédités après livraison, **facultatif / compte optionnel**, links `compte` + `cgv#fidelite`
- CSS Pass6: `.pp-avail` + state colors; no dark-pattern urgency styling

## Unchanged
- Catalog `assets/search-index.js` byte-stable
- `LOYALTY = { step: 1500, reward: 50 }`, shipping fee math, prices, compareAt, checkout gating, guest checkout, wheel odds
- Pass1 hero; Pass4 hints; Pass5 `0 DH` / « Total à payer à la livraison »

## Cialdini levers (explicit evaluation)
| Lever | Disposition |
|-------|-------------|
| Reciprocity | Clarify existing loyalty only — **no new gifts** |
| Commitment / consistency | Existing size selection; no new forced account |
| Social proof | **Evidence-dependent** — no reviews/badges added |
| Authority | Existing “distributeur officiel” unchanged; **no new coach/official badges** |
| Liking | Not fabricated this cycle |
| Scarcity | Only real `soldOut`/`inStock` labeling; **no numeric low-stock / timers** |
| Unity | Not fabricated this cycle |

Not claimed as universal laws or proven conversion uplift.

## Justified sensitive updates
- `script.js`: Pass6 display/status helpers only (calc snippets asserted stable)
- `commande.html`: loyalty note clarity + CGV link

## Limitations
- Catalog is site source, not confirmed live warehouse inventory
- Parent visual QA on :8081 / :3700; no shell browser automation; no real orders
- Pass3 reduced-motion runtime still unverified

## Eligibility copy fix (same Pass6 cycle)
Misleading « compte client optionnel » implied guests earn points. CGV `#fidelite`: only orders placed while signed in earn points; guest orders are not attached retroactively. Guest checkout remains allowed.

**Final loyalty note (PDP perk / cart / commande):**
> Commande sans compte possible. Pour les points fidélité, connectez-vous avant de commander : 50 DH tous les 1 500 DH d’achats livrés, crédités après livraison. Les commandes invitées ne sont pas rattachées rétroactivement. Conditions.

(Links: `compte`, `cgv#fidelite`. « 50 DH » = 50 points at 1 point = 1 DH per CGV; not cash outside points.)

