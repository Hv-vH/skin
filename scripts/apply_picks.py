#!/usr/bin/env python
"""Move reviewed picks from raw/ into curated/ and glam/; park the rest in rejected/.

    python scripts/apply_picks.py --subject lusi

Reads spec/picks-<subject>.json and preview/<subject>/index-raw.txt.
Every raw file is either kept (curated/glam) or moved to rejected/skipped/<subject>/,
so raw/ stays empty after a full review and the ledger keeps a reason per file.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    args = parser.parse_args()

    subject = args.subject
    picks_path = ROOT / "spec" / f"picks-{subject}.json"
    index_path = ROOT / "preview" / subject / "index-raw.txt"
    raw_dir = ROOT / "raw" / subject

    if not picks_path.exists():
        raise SystemExit(f"missing {picks_path}")
    if not index_path.exists():
        raise SystemExit(f"missing {index_path}")

    picks = json.loads(picks_path.read_text(encoding="utf-8"))
    index: dict[int, str] = {}
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        slot, name = line.split("\t", 1)
        index[int(slot)] = name.strip()

    curated_dir = ROOT / "curated" / subject
    glam_dir = ROOT / "glam" / subject
    skipped_dir = ROOT / "rejected" / "skipped" / subject
    for folder in (curated_dir, glam_dir, skipped_dir):
        folder.mkdir(parents=True, exist_ok=True)

    moved = {"curated": 0, "glam": 0, "skipped": 0, "missing": 0}
    ledger: list[dict] = []

    def place(slot: int, tier: str) -> None:
        name = index.get(slot)
        if not name:
            moved["missing"] += 1
            return
        source = raw_dir / name
        if not source.exists():
            moved["missing"] += 1
            ledger.append({"slot": slot, "file": name, "tier": tier, "result": "missing"})
            return
        target_dir = {"curated": curated_dir, "glam": glam_dir, "skipped": skipped_dir}[tier]
        shutil.move(str(source), str(target_dir / name))
        moved[tier] += 1
        ledger.append({"slot": slot, "file": name, "tier": tier, "result": "moved"})

    for slot in picks.get("curated", []):
        place(slot, "curated")
    for slot in picks.get("glam", []):
        place(slot, "glam")
    for slot in range(1, len(index) + 1):
        if slot not in set(picks.get("curated", [])) | set(picks.get("glam", [])):
            place(slot, "skipped")

    notes = picks.get("rejected_notes", {})
    for row in ledger:
        row["note"] = notes.get(str(row["slot"]), "")

    out = ROOT / "sources" / f"picks-{subject}.json"
    out.write_text(json.dumps({"subject": subject, "moved": moved, "items": ledger}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"{subject}: curated={moved['curated']} glam={moved['glam']} "
        f"skipped={moved['skipped']} missing={moved['missing']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
