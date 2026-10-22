#!/usr/bin/env python
"""Proof sheets: (a) watermark cut before/after pairs, (b) v1 vs v2 slot comparison."""
from __future__ import annotations
import csv, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
F = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 17)
FB = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 25)
cat = json.loads((ROOT / "sources" / "catalog-v2.json").read_text(encoding="utf-8"))

# ---------- (a) watermark before/after ----------
COLS, ROWS, TW, BH, PAD = 3, 4, 500, 90, 10
PER = COLS * ROWS
for subject in ("lusi", "yua"):
    rows = [r for r in csv.DictReader((ROOT / "sources" / f"manifest-curated-{subject}.csv").open(encoding="utf-8-sig"))
            if float(r["watermark_crop_pct"]) > 0]
    by_name = {e["name"]: e for e in cat[subject]}
    pages = math.ceil(len(rows) / PER)
    for page in range(pages):
        chunk = rows[page*PER:(page+1)*PER]
        nrows = math.ceil(len(chunk)/COLS)
        tile_h = BH*2 + 46
        sheet = Image.new("RGB", (COLS*(TW+PAD)+PAD, 42+nrows*(tile_h+PAD)+PAD), (24,25,30))
        d = ImageDraw.Draw(sheet)
        d.text((PAD+4, 8), f"{subject} watermark cut before/after {page+1}/{pages}", font=FB, fill=(235,236,240))
        for i, r in enumerate(chunk):
            col, row = i % COLS, i // COLS
            x = PAD + col*(TW+PAD); y = 42 + row*(tile_h+PAD)
            orig_entry = by_name.get(r["original_file"])
            if orig_entry is None:
                import re as _re
                m = _re.search(r"_([0-9a-f]{8})(?:__wmcut)?\.", r["file"])
                sha8 = m.group(1) if m else ""
                orig_entry = next(e for e in cat[subject] if sha8 and sha8 in e["name"])
            orig = ROOT / orig_entry["path"]
            final = ROOT / "curated" / subject / r["file"]
            with Image.open(orig) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                w, h = im.size
                band = im.crop((0, int(h*0.86), w, h)).resize((TW, BH), Image.Resampling.LANCZOS)
            with Image.open(final) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                w, h = im.size
                band2 = im.crop((0, int(h*0.86), w, h)).resize((TW, BH), Image.Resampling.LANCZOS)
            sheet.paste(band, (x, y+22)); sheet.paste(band2, (x, y+22+BH))
            d.rectangle([x, y+22, x+TW, y+22+BH], outline=(90,90,100))
            d.rectangle([x, y+22+BH, x+TW, y+22+BH*2], outline=(90,180,120))
            d.text((x+2, y+1), f"before  {orig_entry['name']}  {r['width']}x{r['height']}", font=F, fill=(210,214,224))
            d.text((x+2, y+22+2), "before", font=F, fill=(230,150,150))
            d.text((x+2, y+22+BH+2), f"after  cut {float(r['watermark_crop_pct']):.0f}% -> {r['file']}", font=F, fill=(160,220,170))
        out = ROOT / "preview" / "v2" / f"watermark-before-after-{subject}-{page+1}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(out, quality=90, optimize=True)
        print("wrote", out.relative_to(ROOT))

# ---------- (b) v1 vs v2 slot comparison ----------
keys = ["bg-chat-light", "bg-chat-dark", "bg-ambient-blur", "hero-portrait",
        "sidebar-character", "card-photo", "ribbon-wide", "ribbon-strip", "avatar-512"]
slots = {s["key"]: s for s in json.loads((ROOT / "spec" / "slots.json").read_text(encoding="utf-8"))["slots"]}
for subject in ("lusi", "yua"):
    CW, CH, PAD2, CAP = 200, 170, 8, 24
    sheet = Image.new("RGB", (len(keys)*(CW+PAD2)+PAD2, 2*(CH+CAP)+PAD2*3+44), (24,25,30))
    d = ImageDraw.Draw(sheet)
    d.text((PAD2+4, 10), f"{subject} v1 (top) vs v2 (bottom)", font=FB, fill=(235,236,240))
    for i, key in enumerate(keys):
        x = PAD2 + i*(CW+PAD2)
        d.text((x+2, 42), key, font=F, fill=(200,204,214))
        for row, folder in enumerate((ROOT/"_v1"/"skin-assets"/subject, ROOT/"skin-assets"/subject)):
            path = folder / slots[key]["file"]
            y = 66 + row*(CH+CAP)
            d.rectangle([x, y, x+CW, y+CH], outline=(80,82,92))
            if path.exists():
                with Image.open(path) as im:
                    im = im.convert("RGB")
                    th = ImageOps.contain(im, (CW-4, CH-4), Image.Resampling.LANCZOS)
                    sheet.paste(th, (x+(CW-th.width)//2, y+(CH-th.height)//2))
            d.text((x+2, y+CH+2), "v1" if row == 0 else "v2", font=F, fill=(200,204,214))
    out = ROOT / "preview" / "v2" / f"compare-v1-v2-{subject}.jpg"
    sheet.save(out, quality=90, optimize=True)
    print("wrote", out.relative_to(ROOT))
