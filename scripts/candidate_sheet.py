#!/usr/bin/env python
"""Large contain-thumbnail sheet of slot candidates."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
ROOT = Path(__file__).resolve().parent.parent
F = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 17)
FB = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 24)
catalog = json.loads((ROOT/"sources"/"catalog-v2.json").read_text(encoding="utf-8"))
cands = {
 "lusi": [9,61,60,13,124,130,67,111,133,21,1,10],
 "yua":  [62,2,11,89,91,191,128,20,8,51,34,30],
}
COLS,ROWS,TW,TH,PAD = 4,3,440,620,8
for subject, slots in cands.items():
    by = {e["slot"]: e for e in catalog[subject]}
    sheet = Image.new("RGB",(COLS*(TW+PAD)+PAD, ROWS*(TH+30+PAD)+PAD+40),(24,25,30))
    d = ImageDraw.Draw(sheet)
    d.text((PAD+4,8),f"{subject} slot candidates",font=FB,fill=(235,236,240))
    for i,s in enumerate(slots):
        e=by[s]; col,row=i%COLS,i//COLS
        x=PAD+col*(TW+PAD); y=40+PAD+row*(TH+30+PAD)
        with Image.open(ROOT/e["path"]) as im:
            im=ImageOps.exif_transpose(im).convert("RGB")
            th=ImageOps.contain(im,(TW,TH),Image.Resampling.LANCZOS)
            cw,ch=th.size
            px=x+(TW-cw)//2; py=y+(TH-ch)//2
            sheet.paste(th,(px,py))
            d.rectangle([x,y,x+TW,y+TH],outline=(70,72,80))
        d.text((x+2,y+TH+2),f"#{s}  {e['w']}x{e['h']}",font=F,fill=(190,194,204))
    out=ROOT/"preview"/"v2"/subject/f"candidates.jpg"
    sheet.save(out,quality=88,optimize=True)
    print("wrote",out.relative_to(ROOT))
