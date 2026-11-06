#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
errors = []
def fail(m): errors.append(m)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

HOME_LEAD = "Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement."
TYPES = ("Promise", "Problem-Solution", "Big Idea", "Secret", "Story", "Proclamation")
STATUS_TAGS = ("implemented", "evidence-dependent", "not appropriate", "documented-only")

# Proper nouns / claims that must NOT newly appear on a-propos beyond prior page
FORBIDDEN_NEW = (
    "champion du monde", "n°1", "numero 1", "numéro 1", "#1",
    "secret de fabrication", "formule secrète", "meilleur vendeur du Maroc",
    "garantit la conversion", "Mike Tyson", "Canelo",
)

REQUIRED_PRIOR_FACTS = (
    "M. Jamal",
    "boxeur amateur",
    "Knockout Boxing Gear",
    "Rival",
)

def main():
    for s in ("pass1-assert.py","pass2-assert.py","pass3-assert.py","pass4-assert.py","pass5-assert.py","pass6-assert.py"):
        r = subprocess.run([sys.executable, str(ROOT/"_ops"/s)], cwd=str(ROOT), capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"{s} failed:\n{(r.stdout or '')}{(r.stderr or '')}")
    r = subprocess.run(["node", str(ROOT/"_ops"/"pass6-avail-test.js")], cwd=str(ROOT), capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"pass6-avail-test.js failed:\n{(r.stdout or '')}{(r.stderr or '')}")

    idx = (ROOT/"index.html").read_text(encoding="utf-8")
    if HOME_LEAD not in idx:
        fail("homepage approved lead missing or altered")
    if 'href="gants#gants-de-sac"' not in idx or 'href="gants#gants-de-sparring"' not in idx:
        fail("homepage hero paths missing")
    # freeze vs pass7 backup if present (lead must stay)
    bak = ROOT/".pass7-backup/index.html"
    if bak.is_file():
        if HOME_LEAD not in bak.read_text(encoding="utf-8"):
            fail("pass7 backup index unexpectedly lacks approved lead")
        # hero lead span must match backup exactly
        def lead_span(t):
            m = re.search(r'class="hero-lead-text">([^<]*)</span>', t)
            return m.group(1) if m else None
        if lead_span(idx) != lead_span(bak.read_text(encoding="utf-8")):
            fail("homepage hero-lead-text changed vs pass7 baseline")

    vf = ROOT/"_ops/lead-variants.md"
    if not vf.is_file():
        fail("_ops/lead-variants.md missing")
    else:
        vt = vf.read_text(encoding="utf-8")
        for typ in TYPES:
            if typ not in vt:
                fail(f"lead-variants missing type {typ}")
        found_status = sum(1 for tag in STATUS_TAGS if tag in vt.lower() or tag in vt)
        # require each type section has a Status line
        for typ in TYPES:
            m = re.search(rf"##\s*{re.escape(typ)}\b([\s\S]*?)(?=\n##\s|\Z)", vt)
            if not m:
                fail(f"lead-variants missing ## {typ} section")
                continue
            body = m.group(1)
            if not re.search(r"(?i)status\s*:", body):
                fail(f"lead-variants {typ} missing Status:")
            if "Français" not in body and "French" not in body and "Variant" not in body and "«" not in body:
                fail(f"lead-variants {typ} missing French variant copy")

    cov = ROOT/"docs/superpowers/coverage/2026-11-06-kobg-pass7-log.md"
    if not cov.is_file():
        fail("pass7 coverage log missing")
    else:
        ct = cov.read_text(encoding="utf-8")
        for typ in TYPES:
            if typ not in ct:
                fail(f"coverage missing {typ}")
        if "Solution" not in ct and "Product-aware" not in ct:
            # awareness match
            if "product-aware" not in ct.lower() and "Product-aware" not in ct:
                fail("coverage missing awareness match note")

    about = (ROOT/"a-propos.html").read_text(encoding="utf-8")
    about_bak = (ROOT/".pass7-backup/a-propos.html").read_text(encoding="utf-8")
    if about != about_bak:
        # Story improvement applied — must keep prior facts and not invent
        for fact in REQUIRED_PRIOR_FACTS:
            if fact not in about:
                fail(f"a-propos lost prior fact {fact!r}")
            if fact not in about_bak:
                fail(f"baseline a-propos unexpectedly missing {fact!r}")
        for bad in FORBIDDEN_NEW:
            if bad.lower() in about.lower() and bad.lower() not in about_bak.lower():
                fail(f"a-propos introduced unsupported claim {bad!r}")
        # Story opening should put Jamal early in H1 or sub-lead
        m = re.search(r'id="aboutTitle"[^>]*>([\s\S]*?)</h1>', about)
        h1 = re.sub(r"<[^>]+>", "", m.group(1)).replace("\xa0", " ").strip() if m else ""
        lead = ""
        m2 = re.search(r'class="sub-lead"[^>]*>([\s\S]*?)</p>', about)
        if m2:
            lead = re.sub(r"<[^>]+>", "", m2.group(1)).replace("\xa0", " ").strip()
        opening = h1 + " " + lead
        if "Jamal" not in opening and "boxeur amateur" not in opening:
            fail("a-propos Story opening (H1/sub-lead) does not lead with founder facts")
        # Must not keep old proclamation-only H1 as sole opening if we claim Story improvement
        if h1.strip() == "Né du ring, fait pour ceux qui ne font aucun compromis.":
            fail("a-propos H1 still old proclamation-style; Story improvement not applied")

    # sensitive unchanged (pass6 override)
    sens = json.loads((ROOT/".pass1-backup/sensitive-hashes.json").read_text(encoding="utf-8"))
    ov = ROOT/".pass6-backup/sensitive-hashes-override.json"
    if ov.is_file():
        sens.update({k: v for k, v in json.loads(ov.read_text()).items() if isinstance(v, str) and "." in k})
    for rel, digest in sens.items():
        if sha(ROOT/rel) != digest:
            fail(f"sensitive changed: {rel}")

    if errors:
        print("PASS7 ASSERT FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print("PASS7 ASSERT OK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
