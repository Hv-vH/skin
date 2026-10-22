#!/usr/bin/env python
"""Near-duplicate detection and basic integrity check for harvested images.

Keeps the highest-resolution copy of each visual cluster; moves the rest to
rejected/dupes/. Corrupt or unreadable files go to rejected/broken/.

    python scripts/dedupe.py --subject lusi [--tier curated]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def dhash(img: Image.Image, size: int = 8) -> int:
    gray = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    bits = 0
    for row in range(size):
        base = row * (size + 1)
        for col in range(size):
            bits = (bits << 1) | (1 if pixels[base + col] > pixels[base + col + 1] else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def collect(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--tier", default="raw", choices=["raw", "curated", "glam"])
    parser.add_argument("--threshold", type=int, default=6)
    args = parser.parse_args()

    folder = ROOT / args.tier / args.subject
    files = collect(folder)
    if not files:
        print(f"no files in {folder}")
        return 1

    dupe_dir = ROOT / "rejected" / "dupes" / args.subject
    broken_dir = ROOT / "rejected" / "broken" / args.subject
    dupe_dir.mkdir(parents=True, exist_ok=True)
    broken_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict] = []
    for path in files:
        try:
            with Image.open(path) as img:
                img.load()
                width, height = img.size
                aspect = round(width / height, 4)
                hashes = dhash(ImageOps.exif_transpose(img))
        except Exception as error:  # noqa: BLE001 - any decode failure is a reject
            shutil.move(str(path), str(broken_dir / path.name))
            records.append({"file": path.name, "status": "broken", "error": str(error)[:120]})
            continue
        records.append(
            {
                "file": path.name,
                "status": "ok",
                "width": width,
                "height": height,
                "aspect": aspect,
                "dhash": hashes,
                "bytes": path.stat().st_size,
            }
        )

    good = [r for r in records if r["status"] == "ok"]
    good.sort(key=lambda r: (r["width"] * r["height"], r["bytes"]), reverse=True)

    kept: list[dict] = []
    duplicates: list[dict] = []
    for record in good:
        twin = None
        for reference in kept:
            if hamming(record["dhash"], reference["dhash"]) <= args.threshold:
                twin = reference
                break
        if twin is None:
            kept.append(record)
        else:
            duplicates.append({**record, "duplicate_of": twin["file"]})

    for record in duplicates:
        source = folder / record["file"]
        if source.exists():
            shutil.move(str(source), str(dupe_dir / source.name))

    report = {
        "subject": args.subject,
        "tier": args.tier,
        "scanned": len(files),
        "kept": len(kept),
        "duplicates": len(duplicates),
        "broken": len([r for r in records if r["status"] == "broken"]),
        "threshold": args.threshold,
        "items": kept,
        "dupes": duplicates,
    }
    out = ROOT / "sources" / f"dedupe-{args.tier}-{args.subject}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"{args.subject}/{args.tier}: scanned={report['scanned']} kept={report['kept']} "
        f"dupes={report['duplicates']} broken={report['broken']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
