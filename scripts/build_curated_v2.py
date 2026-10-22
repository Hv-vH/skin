#!/usr/bin/env python
"""Rebuild curated/<subject>/ from spec/picks-v2.json.

- copies each chosen source file into curated/
- when a bottom text watermark is present, cuts the given fraction off the
  bottom and saves a __wmcut.jpg instead (files under _v1/ stay untouched)
- writes sources/crops-<subject>.json and sources/acquisition-v2-<subject>.csv
"""
from __future__ import annotations
import csv, json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
picks = json.loads((ROOT / "spec" / "picks-v2.json").read_text(encoding="utf-8"))
catalog = json.loads((ROOT / "sources" / "catalog-v2.json").read_text(encoding="utf-8"))

for subject in ("lusi", "yua"):
    by_slot = {e["slot"]: e for e in catalog[subject]}
    cfg = picks[subject]
    out_dir = ROOT / "curated" / subject
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*"):
        old.unlink()
    rows, crops = [], {}
    for slot in cfg["curated"]:
        e = by_slot[slot]
        src = ROOT / e["path"]
        cut = float(cfg["watermark_crop"].get(str(slot), 0))
        with Image.open(src) as raw:
            img = ImageOps.exif_transpose(raw).convert("RGB")
            w, h = img.size
            if cut > 0:
                new_h = max(1, round(h * (1 - cut)))
                img = img.crop((0, 0, w, new_h))
                out_name = Path(e["name"]).stem + "__wmcut.jpg"
                img.save(out_dir / out_name, "JPEG", quality=95, subsampling=0, optimize=True)
            else:
                out_name = e["name"]
                (out_dir / out_name).write_bytes(src.read_bytes())
        rows.append({"slot": slot, "out": out_name, "source": e["path"],
                     "src_w": e["w"], "src_h": e["h"],
                     "out_w": img.size[0], "out_h": img.size[1],
                     "watermark_crop_pct": round(cut * 100, 1)})
        if cut > 0:
            crops[out_name] = round(cut * 100, 1)
    with (ROOT / "sources" / f"acquisition-v2-{subject}.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader(); writer.writerows(rows)
    (ROOT / "sources" / f"crops-{subject}.json").write_text(json.dumps(crops, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{subject}: {len(rows)} curated, {len(crops)} watermark-cropped -> curated/{subject}")
