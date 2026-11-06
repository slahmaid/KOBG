# KOBG conversion coverage — after Pass 4 (2026-11-06)

| Pass | Book | Status |
|------|------|--------|
| 1 | Schwartz | Implemented |
| 2 | Whitman | Implemented |
| 3 | Barden / Decoded | Implemented |
| 4 | Dooley / Brainfluence | **Implemented** (COD friction + construction sensory + A/B hypotheses) |
| 5 | Ariely | Pending |
| 6 | Cialdini | Evidence-needed / pending |
| 7 | Great Leads (6 types) | Partial (Pass1); full evaluation pending |

## Pass 4 changes

### Checkout / COD (47 pages with fieldsets; `compte.html` untouched)
- Labels: « Ville de livraison », « Téléphone mobile » (Nom complet kept)
- Hints: « Pour l’appel de confirmation de commande. » / « Ville au Maroc où le colis doit être remis. » / « 06 ou 07 — nous vous appelons avant l’envoi. »
- `aria-describedby` includes hint + error ids; fields remain `nom`, `ville`, `telephone`, `kobg_hp`
- `commande.html` intro: « Compte facultatif. Aucun paiement en ligne. Indiquez nom, ville et téléphone : nous confirmons par appel, puis vous payez à la livraison. »
- CSS `.cod-hint` (Pass4 block)

### Sensory (RS11V)
- Wrist paragraph now cites Wrist Lock 2 + AirFlow Control + soft lining / large hand compartment (from fiche); removed “soutien… inégalé”

### Justified hash update
- `commande.html` sensitive hash updated (form clarity only). **`script.js` unchanged.**

### A/B hypotheses (not run; no uplift claimed)
1. Intro clarity — metric: start→submit; guardrail: invalid-phone rate
2. Visible field hints — metric: field error rate / time-to-complete; guardrail: empty submits
3. Specific labels — metric: completion; guardrail: autofill still works (`autocomplete` tokens unchanged)

### Mock / production safety
- Local preview injects `window.KOBG_ORDER_ENDPOINT='/__api'` via `/__dev.js` (ports 8081 / 3700).
- Do **not** open static files as `file://` or bypass `__dev.js` — that would use production Apps Script URL.
- Pass3 reduced-motion runtime still **unverified** in browsers.

## Files
Many `*.html` COD fieldsets, `commande.html`, `rs11v-evolution-noir.html`, `styles.css`, `_ops/pass4-assert.py`, docs.

## Update
Pass 5 completed — see `2026-11-06-kobg-pass5-log.md`. Passes 6–7 still pending.
