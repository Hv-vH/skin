#!/usr/bin/env python
"""Bottom-strip review sheets: crop the bottom band of shortlisted images
so text watermarks/credits are readable, and label them by contact-sheet slot."""
from __future__ import annotations
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FONT = Path(r"C:\Windows\Fonts\msyh.ttc")

shortlist = {
    "lusi": [1,2,4,5,6,8,9,10,11,13,14,16,18,19,20,21,22,27,30,32,36,38,41,45,46,57,58,59,60,61,
             63,67,69,70,72,77,80,82,83,86,90,91,92,93,94,100,101,106,109,110,111,112,113,115,116,
             117,118,119,122,124,128,130,131,133,134,135],
    "yua": [2,3,4,8,11,16,20,26,30,32,34,44,46,49,51,54,55,59,62,67,
            68,70,71,79,81,82,89,90,91,95,96,99,106,107,111,120,121,123,124,126,
            128,133,134,137,146,147,148,154,155,156,157,158,160,161,165,167,168,172,175,177,
            181,183,184,186,187,188,189,191,193],
}

catalog = json.loads((ROOT / "sources" / "catalog-v2.json").read_text(encoding="utf-8"))
font = ImageFont.truetype(str(FONT), 18)
bold = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 26)

COLS, ROWS, TILE_W, PAD, LABEL = 3, 4, 600, 8, 24
PER = COLS * ROWS

for subject, slots in shortlist.items():
    by_slot = {e["slot"]: e for e in catalog[subject]}
    items = [by_slot[s] for s in slots]
    pages = math.ceil(len(items) / PER)
    out_dir = ROOT / "preview" / "v2" / subject
    out_dir.mkdir(parents=True, exist_ok=True)
    for page in range(pages):
        chunk = items[page*PER:(page+1)*PER]
        rows = math.ceil(len(chunk)/COLS)
        sheet_w = COLS*(TILE_W+PAD)+PAD
        max_strip = 260
        sheet_h = 46 + rows*(max_strip+LABEL+PAD)+PAD
        sheet = Image.new("RGB", (sheet_w, sheet_h), (24,25,30))
        draw = ImageDraw.Draw(sheet)
        draw.text((PAD+4, 10), f"{subject} bottom-watermark check {page+1}/{pages}", font=bold, fill=(235,236,240))
        for i, e in enumerate(chunk):
            col, row = i % COLS, i // COLS
            x = PAD + col*(TILE_W+PAD)
            y = 46 + row*(max_strip+LABEL+PAD)
            path = ROOT / e["path"]
            try:
                with Image.open(path) as img:
                    img = ImageOps.exif_transpose(img).convert("RGB")
                    w, h = img.size
                    band = img.crop((0, int(h*0.78), w, h))
                    scale = TILE_W / band.width
                    band = band.resize((TILE_W, max(1, round(band.height*scale))), Image.Resampling.LANCZOS)
                    if band.height > max_strip:
                        band = ImageOps.fit(band, (TILE_W, max_strip), Image.Resampling.LANCZOS)
                    sheet.paste(band, (x, y))
            except Exception as err:
                draw.text((x+4, y+4), f"ERR {err}", font=font, fill=(255,120,120))
            draw.rectangle([x, y, x+TILE_W, y+max_strip], outline=(70,72,80))
            tag = e["tier"].replace("rejected/","")
            draw.text((x+2, y+max_strip+2), f"#{e['slot']} {e['w']}x{e['h']} [{tag}] {e['name'].split('_')[1] if '_' in e['name'] else ''}", font=font, fill=(190,194,204))
        out = out_dir / f"bottom-{page+1}.jpg"
        sheet.save(out, quality=88, optimize=True)
        print("wrote", out.relative_to(ROOT), len(chunk))
