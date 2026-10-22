#!/usr/bin/env python
"""Write the canonical spec/selection-<subject>.json for the v2 re-curation.

Source of truth: spec/picks-v2.json (contact-sheet slot numbers + watermark cut
fractions) joined with sources/catalog-v2.json (slot -> original file, now under _v1/).
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# slot -> (contact-sheet slot index, focus, optional extra blur)
picks = {
  "lusi": {
    "bg-chat-light":      (9,   [0.5, 0.45]),
    "bg-chat-dark":       (61,  [0.5, 0.42]),
    "bg-ambient-blur":    (13,  [0.5, 0.50]),
    "hero-portrait":      (60,  [0.5, 0.22]),
    "sidebar-character":  (67,  [0.5, 0.22]),
    "card-photo":         (111, [0.5, 0.30]),
    "ribbon-wide":        (60,  [0.5, 0.58], 8),
    "ribbon-strip":       (130, [0.5, 0.62], 18),
    "avatar-512":         (1,   [0.5, 0.22]),
    "avatar-192":         (1,   [0.5, 0.22]),
    "favicon-128":        (1,   [0.5, 0.22]),
    "favicon-32":         (1,   [0.5, 0.22]),
    "desktop-icon":       (1,   [0.5, 0.22]),
  },
  "yua": {
    "bg-chat-light":      (62,  [0.5, 0.42]),
    "bg-chat-dark":       (89,  [0.5, 0.45]),
    "bg-ambient-blur":    (62,  [0.5, 0.50]),
    "hero-portrait":      (2,   [0.5, 0.18]),
    "sidebar-character":  (20,  [0.5, 0.20]),
    "card-photo":         (30,  [0.5, 0.30]),
    "ribbon-wide":        (62,  [0.5, 0.55], 8),
    "ribbon-strip":       (34,  [0.5, 0.55], 18),
    "avatar-512":         (8,   [0.5, 0.25]),
    "avatar-192":         (8,   [0.5, 0.25]),
    "favicon-128":        (8,   [0.5, 0.25]),
    "favicon-32":         (8,   [0.5, 0.25]),
    "desktop-icon":       (8,   [0.5, 0.25]),
  },
}

catalog = json.loads((ROOT / "sources" / "catalog-v2.json").read_text(encoding="utf-8"))
pick_doc = json.loads((ROOT / "spec" / "picks-v2.json").read_text(encoding="utf-8"))

for subject, slots in picks.items():
    by_slot = {e["slot"]: e for e in catalog[subject]}
    crops = pick_doc[subject]["watermark_crop"]
    sel = {"subject": subject, "auto": False,
           "note": "v2 hand re-pick (2026-10-21). Bottom text watermarks are already cut in curated/ sources (files ending __wmcut). focus anchors the crop inside the overflow.",
           "slots": {}}
    for key, spec in slots.items():
        slot_index, focus = spec[0], spec[1]
        name = by_slot[slot_index]["name"]
        if str(slot_index) in crops:
            name = Path(name).stem + "__wmcut.jpg"
        source = f"curated/{subject}/{name}"
        if not (ROOT / source).exists():
            raise SystemExit(f"missing curated source: {source}")
        entry = {"source": source, "focus": focus}
        if len(spec) > 2:
            entry["blur"] = spec[2]
        sel["slots"][key] = entry
    out = ROOT / "spec" / f"selection-{subject}.json"
    out.write_text(json.dumps(sel, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", out.relative_to(ROOT))
