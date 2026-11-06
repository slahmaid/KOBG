#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def fail(m): errors.append(m)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

CALC_SNIPPETS = [
    "const SHIPPING_FEE = 0;",
    "const FREE_SHIPPING_FROM = 2000;",
    "const shipping = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;",
]

def main():
    for s in ("pass1-assert.py","pass2-assert.py","pass3-assert.py","pass4-assert.py"):
        r=subprocess.run([sys.executable,str(ROOT/"_ops"/s)],cwd=str(ROOT),capture_output=True,text=True)
        if r.returncode!=0:
            fail(f"{s} failed:\n{(r.stdout or '')}{(r.stderr or '')}")

    js=(ROOT/"script.js").read_text(encoding="utf-8")
    for snip in CALC_SNIPPETS:
        if snip not in js:
            fail(f"shipping calc snippet missing/changed: {snip}")
    # display fallbacks must be 0 DH not Offerte for shipping assignments
    if js.count("? formatDH(t.shipping) : 'Offerte'") or js.count('? formatDH(t.shipping) : "Offerte"'):
        fail("shipping display still uses Offerte fallback")
    if js.count("? formatDH(o.delivery) : 'Offerte'"):
        fail("delivery template still uses Offerte")
    if js.count("? formatDH(t.shipping) : '0\\u00a0DH'") + js.count("? formatDH(t.shipping) : '0\u00a0DH'") < 3:
        # allow unicode form in source
        if "formatDH(t.shipping) : '0" not in js and 'formatDH(t.shipping) : "0' not in js:
            fail("expected 0 DH shipping display fallbacks in script.js")
    if "sans frais cachés" in js.lower() or "no hidden fees" in js.lower():
        fail("forbidden no-hidden-fees claim")

    # HTML
    pages_bad_ship=0
    pages_ok=0
    for p in ROOT.glob("*.html"):
        t=p.read_text(encoding="utf-8", errors="replace")
        if 'id="cartShipping"' in t:
            if 'id="cartShipping">0&nbsp;DH' not in t and 'id="cartShipping">0\xa0DH' not in t:
                pages_bad_ship+=1
            else:
                pages_ok+=1
        if "sans frais cachés" in t.lower():
            fail(f"forbidden claim in {p.name}")
    if pages_bad_ship:
        fail(f"cartShipping not 0 DH on {pages_bad_ship} pages")
    if pages_ok < 50:
        fail(f"expected many cartShipping 0 DH pages, got {pages_ok}")

    co=(ROOT/"commande.html").read_text(encoding="utf-8")
    if 'id="coShip">0&nbsp;DH' not in co:
        fail("commande coShip not 0 DH")
    if co.count("Total à payer à la livraison") < 2:
        fail("commande should show Total à payer à la livraison on summary + due")

    idx=(ROOT/"index.html").read_text(encoding="utf-8")
    if "Total à payer à la livraison" not in idx:
        fail("index cart total label missing Total à payer à la livraison")
    # preserve pass1 lead
    if "Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement." not in idx:
        fail("pass1 lead missing")

    css=(ROOT/"styles.css").read_text(encoding="utf-8")
    if "KOBG Pass5" not in css:
        fail("Pass5 CSS marker missing")

    # sensitive hashes with optional override for script.js
    sens=json.loads((ROOT/".pass1-backup/sensitive-hashes.json").read_text(encoding="utf-8"))
    ov=ROOT/".pass5-backup/sensitive-hashes-override.json"
    if ov.is_file():
        data=json.loads(ov.read_text(encoding="utf-8"))
        sens.update({k:v for k,v in data.items() if isinstance(v,str) and ("." in k)})
    for rel,digest in sens.items():
        if sha(ROOT/rel)!=digest:
            fail(f"sensitive changed: {rel}")

    if errors:
        print("PASS5 ASSERT FAIL")
        for e in errors: print(" -", e)
        return 1
    print("PASS5 ASSERT OK")
    return 0

if __name__=="__main__":
    sys.exit(main())
