
#!/usr/bin/env python
"""Map contact-sheet indices to files on disk and dump a catalog for v2 curation."""
from __future__ import annotations
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
TIERS = ["curated", "glam", "rejected/skipped", "rejected/dupes"]

out = {}
for subject in ("lusi", "yua"):
    index_path = ROOT / "preview" / subject / "index-raw.txt"
    entries = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        slot, name = line.split("\t", 1)
        found = None
        for tier in TIERS:
            candidate = ROOT / tier / subject / name
            if candidate.exists():
                found = candidate
                tier_hit = tier
                break
        if found is None:
            entries.append({"slot": int(slot), "name": name, "path": None, "tier": None})
            continue
        with Image.open(found) as img:
            w, h = ImageOps.exif_transpose(img).size
        entries.append({
            "slot": int(slot),
            "name": name,
            "path": str(found.relative_to(ROOT)).replace("\\", "/"),
            "tier": tier_hit,
            "w": w,
            "h": h,
            "px": w * h,
        })
    out[subject] = entries
    missing = [e for e in entries if e["path"] is None]
    print(subject, "entries:", len(entries), "missing:", len(missing))
    if missing:
        print("  missing:", [e["name"] for e in missing])

(ROOT / "sources" / "catalog-v2.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote sources/catalog-v2.json")
