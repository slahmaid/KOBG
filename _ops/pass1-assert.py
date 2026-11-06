#!/usr/bin/env python3
"""Pass 1 acceptance assertions for KOBG homepage hero (no network orders)."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEAD = "Vos gants Rival pour le sac ou le sparring. Choisissez selon votre entraînement."
SENSITIVE = [
    "script.js",
    "assets/search-index.js",
    "assets/wheel.js",
    "assets/account.js",
    "assets/admin.js",
    "assets/meta-pixel.js",
    "commande.html",
    "_ops/order-apps-script.gs",
]
BACKUP = ROOT / ".pass1-backup"
HASH_FILE = BACKUP / "sensitive-hashes.json"
errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def main() -> int:
    idx_path = ROOT / "index.html"
    gants_path = ROOT / "gants.html"
    if not idx_path.is_file():
        fail(f"missing {idx_path}")
        return report()
    idx = idx_path.read_text(encoding="utf-8")
    # Strip docs mentions: only count lead outside docs/ if any — index has no docs
    if idx.count(LEAD) < 1:
        fail(f"exact lead missing in index.html: {LEAD!r}")
    if idx.count(LEAD) > 1:
        fail(f"exact lead appears {idx.count(LEAD)} times (expected 1 visible source string)")

    # Old side headline pair should not remain as marketing h2 lines
    if re.search(
        r'headline--side[\s\S]{0,200}Conçu pour[\s\S]{0,80}le ring',
        idx,
        re.I,
    ):
        fail("old side headline 'Conçu pour / le ring' still present in hero")

    h1s = re.findall(r"<h1\b[^>]*>([\s\S]*?)</h1>", idx, re.I)
    if len(h1s) != 1:
        fail(f"expected exactly 1 <h1>, found {len(h1s)}")
    else:
        h1_text = re.sub(r"<[^>]+>", " ", h1s[0])
        h1_text = re.sub(r"\s+", " ", h1_text).strip()
        if LEAD not in h1_text:
            fail("H1 accessible text must include the approved lead")
        if "gants de boxe Rival au Maroc" not in h1_text:
            fail("H1 accessible text must preserve SEO intent 'gants de boxe Rival au Maroc'")

    # Path CTAs must be primary hero controls (class hero-path), not only nav duplicates
    def find_hero_cta(label: str, needle: str) -> None:
        found = False
        for m in re.finditer(r"<a\b([^>]*)>([\s\S]*?)</a>", idx, re.I):
            attrs, inner = m.group(1), m.group(2)
            cls = re.search(r'class=["\']([^"\']+)["\']', attrs, re.I)
            if not cls or "hero-path" not in cls.group(1).split():
                continue
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", inner)).strip()
            if text != label:
                continue
            href = re.search(r'href=["\']([^"\']+)["\']', attrs, re.I)
            if not href:
                fail(f"hero CTA {label!r} missing href")
                return
            h = href.group(1).strip()
            if ".html" in h.split("#")[0]:
                fail(f"hero CTA {label!r} href uses .html: {h}")
            norm = h.lstrip("/")
            if needle not in norm and norm != needle:
                fail(f"hero CTA {label!r} href {h!r} does not target {needle!r}")
                return
            found = True
            break
        if not found:
            fail(f"missing hero-path CTA with exact text {label!r}")

    find_hero_cta("Gants de sac", "gants#gants-de-sac")
    find_hero_cta("Gants de sparring", "gants#gants-de-sparring")
    if 'class="hero-paths"' not in idx and "class='hero-paths'" not in idx:
        fail('missing hero-paths nav wrapper')

    # Destination content on gants.html
    if not gants_path.is_file():
        fail("missing gants.html")
    else:
        g = gants_path.read_text(encoding="utf-8")
        for aid, heading in (
            ("gants-de-sac", "Gants de sac"),
            ("gants-de-sparring", "Gants de sparring"),
        ):
            if f'id="{aid}"' not in g and f"id='{aid}'" not in g:
                fail(f"gants.html missing id={aid}")
            # heading near id
            m = re.search(rf'id=["\']{re.escape(aid)}["\'][\s\S]{{0,500}}', g)
            if not m or heading not in m.group(0):
                fail(f"gants.html #{aid} region missing heading text {heading!r}")

    # Local asset refs newly required: all assets/ refs in index must exist
    for m in re.finditer(r"""(?:src|href)=["'](assets/[^"']+)["']""", idx):
        rel = m.group(1).split("?")[0]
        if not (ROOT / rel).is_file():
            fail(f"dangling asset ref in index.html: {rel}")

    # Sensitive hashes
    current = {}
    for rel in SENSITIVE:
        p = ROOT / rel
        if not p.is_file():
            fail(f"sensitive file missing: {rel}")
            continue
        current[rel] = sha256(p)
    if HASH_FILE.is_file():
        baseline = json.loads(HASH_FILE.read_text(encoding="utf-8"))
        for rel, digest in baseline.items():
            if current.get(rel) != digest:
                fail(f"sensitive file changed: {rel}")
    else:
        print("NOTE: no sensitive-hashes baseline yet; current hashes:")
        print(json.dumps(current, indent=2))

    return report()


def report() -> int:
    if errors:
        print("PASS1 ASSERT FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print("PASS1 ASSERT OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
