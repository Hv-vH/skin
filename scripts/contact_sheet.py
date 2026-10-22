#!/usr/bin/env python
"""Build labelled contact sheets so a human can triage harvested images.

    python scripts/contact_sheet.py --subject lusi --tier raw --per-sheet 36

Writes preview/<subject>/sheet-<tier>-<n>.jpg plus an index file listing
`slot -> filename` so picks can be written into spec/selection-<subject>.json.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
FONT = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:  # noqa: BLE001
        return ImageFont.load_default()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--tier", default="raw", choices=["raw", "curated", "glam"])
    parser.add_argument("--cols", type=int, default=6)
    parser.add_argument("--cell", type=int, default=300)
    parser.add_argument("--per-sheet", type=int, default=36)
    args = parser.parse_args()

    folder = ROOT / args.tier / args.subject
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS) if folder.exists() else []
    if not files:
        print(f"no files in {folder}")
        return 1

    label_font = load_font(FONT, 15)
    index_font = load_font(FONT_BOLD, 26)

    out_dir = ROOT / "preview" / args.subject
    out_dir.mkdir(parents=True, exist_ok=True)
    index_lines: list[str] = []

    cell_w = args.cell
    cell_h = int(args.cell * 1.42)
    pad = 10
    caption = 34

    pages = math.ceil(len(files) / args.per_sheet)
    for page in range(pages):
        chunk = files[page * args.per_sheet : (page + 1) * args.per_sheet]
        cols = min(args.cols, len(chunk))
        rows = math.ceil(len(chunk) / cols)
        sheet_w = cols * (cell_w + pad) + pad
        sheet_h = rows * (cell_h + caption + pad) + pad + 64
        sheet = Image.new("RGB", (sheet_w, sheet_h), (26, 27, 32))
        draw = ImageDraw.Draw(sheet)
        draw.text((pad + 4, 16), f"{args.subject} · {args.tier} · sheet {page + 1}/{pages}", font=index_font, fill=(235, 236, 240))

        for i, path in enumerate(chunk):
            slot = page * args.per_sheet + i + 1
            col = i % cols
            row = i // cols
            x = pad + col * (cell_w + pad)
            y = 64 + pad + row * (cell_h + caption + pad)
            try:
                with Image.open(path) as img:
                    img = ImageOps.exif_transpose(img)
                    width, height = img.size
                    thumb = ImageOps.fit(img.convert("RGB"), (cell_w, cell_h), Image.Resampling.LANCZOS)
                    sheet.paste(thumb, (x, y))
                    meta = f"{width}x{height}  {path.stat().st_size // 1024}KB"
            except Exception as error:  # noqa: BLE001
                meta = f"unreadable: {error}"[:40]
            draw.rectangle([x, y, x + cell_w, y + cell_h], outline=(70, 72, 80))
            badge = str(slot)
            draw.rectangle([x, y, x + 46, y + 34], fill=(20, 21, 26))
            draw.text((x + 9, y + 3), badge, font=index_font, fill=(255, 214, 150))
            draw.text((x + 2, y + cell_h + 6), f"#{slot} {meta}", font=label_font, fill=(186, 190, 200))
            index_lines.append(f"{slot}\t{path.name}")

        sheet_path = out_dir / f"sheet-{args.tier}-{page + 1}.jpg"
        sheet.save(sheet_path, quality=86, optimize=True)
        print(f"wrote {sheet_path.relative_to(ROOT)}  ({len(chunk)} cells)")

    index_path = out_dir / f"index-{args.tier}.txt"
    index_path.write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    print(f"wrote {index_path.relative_to(ROOT)}  ({len(files)} images)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
