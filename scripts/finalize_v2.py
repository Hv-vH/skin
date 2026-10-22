#!/usr/bin/env python
"""Refresh provenance for the v2 material pack.

- keeps candidate catalog paths pointing at _v1/ (where old tiers live)
- sources/manifest-curated-<subject>.csv : curated file -> source url + crop info
- sources/manifest-slots-<subject>.csv   : rendered slot -> curated file -> source url
"""
from __future__ import annotations
import csv, json, re
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
LICENSE = "personal local use only; do not redistribute"

cat = json.loads((ROOT / "sources" / "catalog-v2.json").read_text(encoding="utf-8"))
for entries in cat.values():
    for e in entries:
        p = e.get("path") or ""
        if p and not p.startswith("_v1/"):
            e["path"] = "_v1/" + p
(ROOT / "sources" / "catalog-v2.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")

ledger = list(csv.DictReader((ROOT / "sources" / "sources.csv").open(encoding="utf-8-sig")))
by_sha, by_note = {}, {}
for row in ledger:
    sha = row.get("sha256") or ""
    if len(sha) >= 8:
        by_sha[sha[:8]] = row
    if row.get("note"):
        by_note[row["note"]] = row

for subject in ("lusi", "yua"):
    crops = json.loads((ROOT / "sources" / f"crops-{subject}.json").read_text(encoding="utf-8"))
    rows = []
    for path in sorted((ROOT / "curated" / subject).iterdir()):
        if not path.is_file():
            continue
        m = re.search(r"_([0-9a-f]{8})(__wmcut)?\.[A-Za-z]+$", path.name)
        sha8 = m.group(1) if m else ""
        match = by_sha.get(sha8) or by_note.get(path.name.replace("__wmcut", ""))
        with Image.open(path) as img:
            width, height = ImageOps.exif_transpose(img).size
        rows.append({
            "file": path.name, "subject": subject, "width": width, "height": height,
            "watermark_crop_pct": crops.get(path.name, 0.0),
            "original_file": match.get("note", "") if match else "",
            "image_url": match.get("image_url", "") if match else "",
            "page_url": match.get("page_url", "") if match else "",
            "engine": match.get("engine", "") if match else "",
            "query": match.get("query", "") if match else "",
            "license": LICENSE,
        })
    out = ROOT / "sources" / f"manifest-curated-{subject}.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"manifest-curated-{subject}.csv: {len(rows)} files, {sum(1 for r in rows if r['image_url'])} with source url")

slots_meta = {s["key"]: s for s in json.loads((ROOT / "spec" / "slots.json").read_text(encoding="utf-8"))["slots"]}
for subject in ("lusi", "yua"):
    curated = {r["file"]: r for r in csv.DictReader((ROOT / "sources" / f"manifest-curated-{subject}.csv").open(encoding="utf-8-sig"))}
    sel = json.loads((ROOT / "spec" / f"selection-{subject}.json").read_text(encoding="utf-8"))
    rows = []
    for key, pick in sel["slots"].items():
        if key not in slots_meta:
            continue
        info = curated.get(Path(pick["source"]).name, {})
        rows.append({
            "slot": key, "asset_file": slots_meta[key]["file"],
            "asset_size": f"{slots_meta[key]['w']}x{slots_meta[key]['h']}",
            "source": pick["source"], "focus": "%s,%s" % tuple(pick["focus"]),
            "watermark_crop_pct": info.get("watermark_crop_pct", ""),
            "image_url": info.get("image_url", ""),
            "original_file": info.get("original_file", ""), "license": LICENSE,
        })
    out = ROOT / "sources" / f"manifest-slots-{subject}.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"manifest-slots-{subject}.csv: {len(rows)} slots")
