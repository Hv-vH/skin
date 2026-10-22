#!/usr/bin/env python
"""Verify that every slot file exists, matches spec/slots.json and fits its budget.

    python scripts/verify_assets.py --subject lusi

Exit code 0 only when all slots pass.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    args = parser.parse_args()

    slots = json.loads((ROOT / "spec" / "slots.json").read_text(encoding="utf-8"))["slots"]
    folder = ROOT / "skin-assets" / args.subject
    failures: list[str] = []

    print(f"{'slot':26s} {'size':>11s} {'actual':>11s} {'format':>7s} {'KB':>7s}  verdict")
    for slot in slots:
        path = folder / slot["file"]
        if not path.exists():
            failures.append(f"{slot['file']}: missing")
            print(f"{slot['file']:26s} {'-':>11s} {'-':>11s} {'-':>7s} {'-':>7s}  MISSING")
            continue
        try:
            with Image.open(path) as img:
                width, height = img.size
                fmt = (img.format or "").upper()
        except Exception as error:  # noqa: BLE001
            failures.append(f"{slot['file']}: unreadable ({error})")
            print(f"{slot['file']:26s} unreadable: {error}")
            continue

        kb = path.stat().st_size / 1024
        problems = []
        if (width, height) != (slot["w"], slot["h"]):
            problems.append(f"size {width}x{height} != {slot['w']}x{slot['h']}")
        expected = {"WEBP": "WEBP", "PNG": "PNG", "ICO": "ICO"}[slot["format"]]
        if fmt != expected:
            problems.append(f"format {fmt} != {expected}")
        if kb > slot["maxKB"]:
            problems.append(f"{kb:.0f}KB > {slot['maxKB']}KB")

        verdict = "ok" if not problems else "; ".join(problems)
        if problems:
            failures.append(f"{slot['file']}: {verdict}")
        print(
            f"{slot['file']:26s} {slot['w']}x{slot['h']:<6d} {width}x{height:<6d} "
            f"{fmt:>7s} {kb:7.1f}  {verdict}"
        )

    print()
    if failures:
        print(f"FAIL ({len(failures)} problem(s))")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"PASS: {len(slots)} slots verified for {args.subject}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
