#!/usr/bin/env python
"""One-sheet visual check of every generated slot for a subject.

    python scripts/slot_overview.py --subject lusi
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--cell", type=int, default=380)
    args = parser.parse_args()

    slots = json.loads((ROOT / "spec" / "slots.json").read_text(encoding="utf-8"))["slots"]
    folder = ROOT / "skin-assets" / args.subject
    try:
        label = ImageFont.truetype(str(FONT_BOLD), 17)
    except Exception:  # noqa: BLE001
        label = ImageFont.load_default()

    cols = 4
    cell_w, cell_h = args.cell, args.cell
    pad, cap = 12, 30
    rows = (len(slots) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell_w + pad) + pad, rows * (cell_h + cap + pad) + pad + 56), (24, 25, 30))
    draw = ImageDraw.Draw(sheet)
    draw.text((pad + 4, 14), f"{args.subject} · slot overview", font=label, fill=(240, 240, 244))

    for index, slot in enumerate(slots):
        path = folder / slot["file"]
        col, row = index % cols, index // cols
        x = pad + col * (cell_w + pad)
        y = 56 + pad + row * (cell_h + cap + pad)
        draw.rounded_rectangle([x, y, x + cell_w, y + cell_h], radius=8, fill=(38, 39, 46))
        if path.exists():
            with Image.open(path) as img:
                img = img.convert("RGBA")
                fitted = ImageOps.contain(img, (cell_w - 10, cell_h - 10), Image.Resampling.LANCZOS)
                checker = Image.new("RGBA", fitted.size, (60, 61, 70, 255))
                checker.alpha_composite(fitted)
                sheet.paste(checker.convert("RGB"), (x + (cell_w - fitted.width) // 2, y + (cell_h - fitted.height) // 2))
            size_text = f"{slot['w']}x{slot['h']} {path.stat().st_size // 1024}KB"
        else:
            size_text = "missing"
        draw.text((x + 4, y + cell_h + 5), f"{slot['file']} · {size_text}", font=label, fill=(196, 200, 210))

    out = ROOT / "preview" / args.subject / "slot-overview.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=88, optimize=True)
    print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
