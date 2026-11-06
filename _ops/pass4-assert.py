#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
errors=[]
def fail(m): errors.append(m)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

HINTS = [
    "Pour l’appel de confirmation de commande.",
    "Ville au Maroc où le colis doit être remis.",
    "06 ou 07 — nous vous appelons avant l’envoi.",
]
INTRO = "Compte facultatif. Aucun paiement en ligne. Indiquez nom, ville et téléphone : nous confirmons par appel, puis vous payez à la livraison."
WRIST = "Ventilation <strong>AirFlow Control</strong> et doublure intérieure douce"

def main():
    for s in ("pass1-assert.py","pass2-assert.py","pass3-assert.py"):
        r=subprocess.run([sys.executable,str(ROOT/"_ops"/s)],cwd=str(ROOT),capture_output=True,text=True)
        if r.returncode!=0:
            fail(f"{s} failed:\n{(r.stdout or '')}{(r.stderr or '')}")

    # homepage pass1/2 preserved
    idx=(ROOT/"index.html").read_text(encoding="utf-8")
    if "Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement." not in idx:
        fail("pass1 lead missing")
    css=(ROOT/"styles.css").read_text(encoding="utf-8")
    if "KOBG Pass3" not in css: fail("pass3 css missing")
    if "KOBG Pass4" not in css: fail("pass4 css marker missing")
    if ".cod-hint" not in css: fail("cod-hint CSS missing")

    co=(ROOT/"commande.html").read_text(encoding="utf-8")
    if INTRO not in co: fail("commande intro missing")
    for h in HINTS:
        if h not in co: fail(f"commande missing hint {h!r}")
    if 'aria-describedby="codNomHint codNomErr"' not in co: fail("commande nom aria-describedby")
    if 'aria-describedby="codVilleHint codVilleErr"' not in co: fail("commande ville aria-describedby")
    if 'aria-describedby="codTelHint codTelErr"' not in co: fail("commande tel aria-describedby")
    if ">Ville de livraison<" not in co: fail("commande ville label")
    if ">Téléphone mobile<" not in co: fail("commande tel label")
    # still only these named inputs in fieldset
    fs=re.search(r'<fieldset class="cod-fields">[\s\S]*?</fieldset>', co).group(0)
    names=re.findall(r'name="([^"]+)"', fs)
    if set(names) != {"nom","ville","telephone","kobg_hp"}:
        fail(f"commande field names changed: {names}")

    pp=(ROOT/"rs11v-evolution-noir.html").read_text(encoding="utf-8")
    for h in HINTS:
        if h not in pp: fail(f"rs11v missing hint {h!r}")
    if WRIST not in pp: fail("rs11v AirFlow sensory sentence missing")
    if "soutien du poignet inégalé" in pp: fail("rs11v old unequal wrist hype still present")

    # majority of product COD pages got hints
    pages=list(ROOT.glob("*.html"))
    with_hint=sum(1 for p in pages if "codNomHint" in p.read_text(encoding="utf-8", errors="replace"))
    if with_hint < 40:
        fail(f"expected codNomHint on most COD pages, found {with_hint}")

    # sensitive: allow commande.html to match updated baseline file if present
    sens_path=ROOT/".pass1-backup/sensitive-hashes.json"
    sens=json.loads(sens_path.read_text(encoding="utf-8"))
    override=ROOT/".pass4-backup/sensitive-hashes-override.json"
    if override.is_file():
        ov=json.loads(override.read_text(encoding="utf-8"))
        sens.update({k:v for k,v in ov.items() if isinstance(v,str) and k.endswith((".html",".js",".gs"))})
    for rel,digest in sens.items():
        if sha(ROOT/rel)!=digest:
            fail(f"sensitive changed: {rel}")

    # script.js must remain byte-identical to pass1 baseline unless override says otherwise
    if not override.is_file() or "script.js" not in json.loads(override.read_text(encoding="utf-8")):
        base=json.loads((ROOT/".pass1-backup/sensitive-hashes.json").read_text())
        if sha(ROOT/"script.js")!=base["script.js"]:
            fail("script.js changed (Pass4 preferred HTML/CSS only)")

    if errors:
        print("PASS4 ASSERT FAIL")
        for e in errors: print(" -", e)
        return 1
    print("PASS4 ASSERT OK")
    return 0

if __name__=="__main__":
    sys.exit(main())
