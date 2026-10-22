#!/usr/bin/env python
"""Verification sheet: bottom band of every watermark-cropped curated file."""
from __future__ import annotations
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
F = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 17)
FB = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 25)
COLS, ROWS, TW, BAND, PAD, LABEL = 3, 4, 500, 240, 8, 22
PER = COLS * ROWS

for subject in ("lusi", "yua"):
    crops = json.loads((ROOT / "sources" / f"crops-{subject}.json").read_text(encoding="utf-8"))
    items = sorted(crops.items())
    pages = math.ceil(len(items) / PER)
    out_dir = ROOT / "preview" / "v2" / subject
    out_dir.mkdir(parents=True, exist_ok=True)
    for page in range(pages):
        chunk = items[page*PER:(page+1)*PER]
        nrows = math.ceil(len(chunk)/COLS)
        sheet = Image.new("RGB", (COLS*(TW+PAD)+PAD, 42+nrows*(BAND+LABEL+PAD)+PAD), (24,25,30))
        d = ImageDraw.Draw(sheet)
        d.text((PAD+4, 8), f"{subject} watermark-crop check {page+1}/{pages} (bottom 10% of final file)", font=FB, fill=(235,236,240))
        for i, (name, pct) in enumerate(chunk):
            col, row = i % COLS, i // COLS
            x = PAD + col*(TW+PAD); y = 42 + row*(BAND+LABEL+PAD)
            with Image.open(ROOT / "curated" / subject / name) as img:
                img = img.convert("RGB"); w, h = img.size
                band = img.crop((0, int(h*0.90), w, h))
                band = ImageOps.fit(band, (TW, BAND), Image.Resampling.LANCZOS)
                sheet.paste(band, (x, y))
            d.rectangle([x, y, x+TW, y+BAND], outline=(70,72,80))
            d.text((x+2, y+BAND+1), f"cut {pct:.0f}%  {name[:46]}", font=F, fill=(190,194,204))
        out = out_dir / f"wmcheck-{page+1}.jpg"
        sheet.save(out, quality=90, optimize=True)
        print("wrote", out.relative_to(ROOT), len(chunk))
