#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
errors = []
def fail(m): errors.append(m)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

FORBIDDEN = [
    "plus que", "derniers exemplaires", "stock limité", "seulement", "hurry",
    "low stock", "only .* left", "fake review", "avis clients vérifiés",
    "étoiles", "★★★★★", "coach recommande", "garantie conversion",
]

LOYALTY_REQUIRED = (
    "Commande sans compte possible",
    "connectez-vous",
    "avant de commander",
    "achats livrés",
    "crédités après livraison",
    "rétroactivement",
    "cgv#fidelite",
)
LOYALTY_FORBIDDEN = (
    "compte client optionnel",
    "Points fidélité <strong>(facultatif)</strong>",
    "Fidélité (facultatif)",
    "Points fidélité (facultatif)",
)

def check_loyalty_copy(label: str, chunk: str) -> None:
    for bad in LOYALTY_FORBIDDEN:
        if bad in chunk:
            fail(f"{label}: misleading {bad!r}")
    for phrase in LOYALTY_REQUIRED:
        if phrase not in chunk:
            fail(f"{label}: missing {phrase!r}")
    if 'href="compte"' not in chunk:
        fail(f"{label}: missing compte link")

def main():
    for s in ("pass1-assert.py","pass2-assert.py","pass3-assert.py","pass4-assert.py","pass5-assert.py"):
        r = subprocess.run([sys.executable, str(ROOT/"_ops"/s)], cwd=str(ROOT), capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"{s} failed:\n{(r.stdout or '')}{(r.stderr or '')}")

    r = subprocess.run(["node", str(ROOT/"_ops"/"pass6-avail-test.js")], cwd=str(ROOT), capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"pass6-avail-test.js failed:\n{(r.stdout or '')}{(r.stderr or '')}")

    js = (ROOT/"script.js").read_text(encoding="utf-8")
    if "function kobgCatalogAvailMessage" not in js:
        fail("kobgCatalogAvailMessage missing")
    if "ppAvail" not in js or "aria-live" not in js:
        fail("ppAvail live status wiring missing in script.js")
    if "const LOYALTY = { step: 1500, reward: 50 };" not in js:
        fail("LOYALTY step/reward mutated")
    for snip in (
        "const SHIPPING_FEE = 0;",
        "const FREE_SHIPPING_FROM = 2000;",
        "const shipping = sub === 0 || sub >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;",
    ):
        if snip not in js:
            fail(f"shipping calc changed: {snip}")

    css = (ROOT/"styles.css").read_text(encoding="utf-8")
    if "KOBG Pass6" not in css or ".pp-avail" not in css:
        fail("Pass6 CSS marker / .pp-avail missing")

    perk_ok = 0
    for p in ROOT.glob("*.html"):
        t = p.read_text(encoding="utf-8", errors="replace")
        m = re.search(r'class="pp-perk--pts"[\s\S]*?</li>', t)
        if not m:
            continue
        check_loyalty_copy(f"perk {p.name}", m.group(0))
        perk_ok += 1
    if perk_ok < 40:
        fail(f"expected many eligibility-correct loyalty perks, got {perk_ok}")

    co = (ROOT/"commande.html").read_text(encoding="utf-8")
    # Pass6 summary foot note contains Points fidélité eligibility
    m = re.search(r'class="cart-note">[\s\S]*?connectez-vous[\s\S]*?</p>', co)
    if not m:
        fail("commande summary loyalty cart-note missing")
    else:
        check_loyalty_copy("commande summary note", m.group(0))

    idx = (ROOT/"index.html").read_text(encoding="utf-8")
    if "Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement." not in idx:
        fail("pass1 lead missing")
    if "Total à payer à la livraison" not in idx:
        fail("pass5 cart total label missing")
    m = re.search(r'class="cart-note cart-note--pts">[\s\S]*?</p>', idx)
    if not m:
        fail("index cart-note--pts missing")
    else:
        check_loyalty_copy("index cart-note--pts", m.group(0))

    # sensitive hashes with pass6 override
    sens = json.loads((ROOT/".pass1-backup/sensitive-hashes.json").read_text(encoding="utf-8"))
    ov6 = ROOT/".pass6-backup/sensitive-hashes-override.json"
    if ov6.is_file():
        data = json.loads(ov6.read_text(encoding="utf-8"))
        sens.update({k: v for k, v in data.items() if isinstance(v, str) and ("." in k)})
    for rel, digest in sens.items():
        if sha(ROOT/rel) != digest:
            fail(f"sensitive changed: {rel}")

    cat_base = ROOT/".pass6-backup/search-index.sha256"
    cat = ROOT/"assets/search-index.js"
    if cat_base.is_file() and sha(cat) != cat_base.read_text().strip():
        fail("assets/search-index.js catalog mutated")

    if errors:
        print("PASS6 ASSERT FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print("PASS6 ASSERT OK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
