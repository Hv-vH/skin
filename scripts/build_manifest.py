#!/usr/bin/env python
"""Join curated/glam files back to their source URLs and write a shareable manifest.

    python scripts/build_manifest.py --subject lusi

Output: sources/manifest-<subject>.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LICENSE_NOTE = "personal local use only; do not redistribute"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    args = parser.parse_args()

    ledger_path = ROOT / "sources" / "sources.csv"
    rows = list(csv.DictReader(ledger_path.open(encoding="utf-8-sig")))
    by_prefix: dict[str, dict] = {}
    for row in rows:
        sha = row.get("sha256") or ""
        if len(sha) >= 8:
            by_prefix[sha[:8]] = row

    out_rows = []
    for tier in ("curated", "glam"):
        folder = ROOT / tier / args.subject
        if not folder.exists():
            continue
        for path in sorted(folder.iterdir()):
            if not path.is_file():
                continue
            prefix = path.stem.split("_")[-1]
            match = by_prefix.get(prefix)
            out_rows.append(
                {
                    "file": path.name,
                    "tier": tier,
                    "subject": args.subject,
                    "width": match.get("width_real", "") if match else "",
                    "height": match.get("height_real", "") if match else "",
                    "image_url": match.get("image_url", "") if match else "",
                    "page_url": match.get("page_url", "") if match else "",
                    "engine": match.get("engine", "") if match else "",
                    "query": match.get("query", "") if match else "",
                    "license": LICENSE_NOTE,
                }
            )

    out = ROOT / "sources" / f"manifest-{args.subject}.csv"
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(out_rows[0].keys()) if out_rows else ["file"])
        writer.writeheader()
        writer.writerows(out_rows)

    matched = sum(1 for row in out_rows if row["image_url"])
    print(f"{args.subject}: {len(out_rows)} files, {matched} matched to source urls -> {out.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
