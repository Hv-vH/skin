#!/usr/bin/env python
"""Turn curated photographs into DSH skin slots, palette and preview mock-ups.

    python scripts/process_assets.py --subject lusi            # full pipeline
    python scripts/process_assets.py --subject lusi --auto     # pick sources heuristically
    python scripts/process_assets.py --subject lusi --palette  # palette only

Selection file: spec/selection-<subject>.json
    {"slots": {"hero-portrait": {"source": "curated/lusi/xxx.jpg", "focus": [0.5, 0.3]}}}

Without a selection file the script ranks candidates by aspect/resolution fit, so
the pipeline can be exercised end to end before final picks are made.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")

SUBJECT_META = {
    "lusi": {
        "name": "赵露思",
        "nameEn": "Zhao Lusi",
        "tagline": "雾粉奶油光、樱粉饰线",
        "layout": "warm",
        "accent": "#c9858c",
        "greeting": "今天也要一起写点东西吗？",
    },
    "yua": {
        "name": "三上悠亚",
        "nameEn": "Yua Mikami",
        "tagline": "象牙黑金、冷调胶片",
        "layout": "cool",
        "accent": "#8f2436",
        "greeting": "准备好了就开始吧。",
    },
}


# ------------------------------------------------------------------ helpers


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:  # noqa: BLE001
        return ImageFont.load_default()


def cover(img: Image.Image, size: tuple[int, int], focus: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    """Scale-and-crop to exactly `size`, anchored at `focus` (0..1 within the overflow)."""
    target_w, target_h = size
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w, new_h = max(target_w, round(src_w * scale)), max(target_h, round(src_h * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = int(round((new_w - target_w) * min(max(focus[0], 0.0), 1.0)))
    top = int(round((new_h - target_h) * min(max(focus[1], 0.0), 1.0)))
    return resized.crop((left, top, left + target_w, top + target_h))


def grade(
    img: Image.Image,
    brightness: float = 1.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    temperature: float = 0.0,
    gamma: float = 1.0,
) -> Image.Image:
    out = ImageEnhance.Brightness(img).enhance(brightness)
    out = ImageEnhance.Contrast(out).enhance(contrast)
    out = ImageEnhance.Color(out).enhance(saturation)
    if temperature:
        arr = np.asarray(out).astype(np.float32)
        arr[..., 0] *= 1.0 + temperature * 0.10
        arr[..., 2] *= 1.0 - temperature * 0.10
        out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    if gamma != 1.0:
        table = [min(255, int(255 * ((i / 255) ** gamma))) for i in range(256)]
        out = out.point(table * 3)
    return out


def vignette(img: Image.Image, strength: float = 0.32, power: float = 2.2) -> Image.Image:
    arr = np.asarray(img).astype(np.float32)
    height, width = arr.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    dx = (xx - width / 2) / (width / 2)
    dy = (yy - height / 2) / (height / 2)
    dist = np.clip(np.sqrt(dx * dx + dy * dy) / math.sqrt(2), 0, 1)
    mask = 1.0 - strength * (dist**power)
    arr *= mask[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def scrim(
    img: Image.Image,
    edge: str = "bottom",
    alpha: float = 0.45,
    start: float = 0.45,
    color: tuple[int, int, int] = (0, 0, 0),
) -> Image.Image:
    """Blend a linear gradient into one edge so overlaid text stays legible."""
    arr = np.asarray(img).astype(np.float32)
    height, width = arr.shape[:2]
    if edge in ("bottom", "top"):
        ramp = np.linspace(0, 1, height)[:, None]
        if edge == "top":
            ramp = ramp[::-1]
        mask = np.clip((ramp - start) / max(1e-6, 1 - start), 0, 1) * alpha
        mask = np.repeat(mask, width, axis=1)
    else:
        ramp = np.linspace(0, 1, width)[None, :]
        if edge == "left":
            ramp = ramp[::-1]
        mask = np.clip((ramp - start) / max(1e-6, 1 - start), 0, 1) * alpha
        mask = np.repeat(mask, height, axis=0)
    tint = np.array(color, dtype=np.float32)
    arr = arr * (1 - mask[..., None]) + tint * mask[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def paste_rounded(base: Image.Image, layer: Image.Image, xy: tuple[int, int], radius: int) -> None:
    mask = rounded_mask(layer.size, radius)
    base.paste(layer, xy, mask)


def glass_panel(base: Image.Image, box: tuple[int, int, int, int], radius: int, fill: tuple[int, ...], blur: int = 18) -> None:
    """Frosted panel: blur what is behind, then tint it."""
    x0, y0, x1, y1 = box
    region = base.crop(box).filter(ImageFilter.GaussianBlur(blur))
    overlay = Image.new("RGBA", (x1 - x0, y1 - y0), fill)
    region = Image.alpha_composite(region.convert("RGBA"), overlay)
    paste_rounded(base, region, (x0, y0), radius)


def add(gray: float) -> int:
    return int(max(0, min(255, round(gray))))


# ------------------------------------------------------------------- colour


def rgb_to_hsv(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    r, g, b = [v / 255 for v in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    diff = mx - mn
    if diff == 0:
        hue = 0.0
    elif mx == r:
        hue = (60 * ((g - b) / diff) + 360) % 360
    elif mx == g:
        hue = 60 * ((b - r) / diff) + 120
    else:
        hue = 60 * ((r - g) / diff) + 240
    sat = 0 if mx == 0 else diff / mx
    return hue, sat, mx


def hsv_to_rgb(hue: float, sat: float, val: float) -> tuple[int, int, int]:
    hue = hue % 360
    chroma = val * sat
    x = chroma * (1 - abs((hue / 60) % 2 - 1))
    m = val - chroma
    if hue < 60:
        r, g, b = chroma, x, 0
    elif hue < 120:
        r, g, b = x, chroma, 0
    elif hue < 180:
        r, g, b = 0, chroma, x
    elif hue < 240:
        r, g, b = 0, x, chroma
    elif hue < 300:
        r, g, b = x, 0, chroma
    else:
        r, g, b = chroma, 0, x
    return tuple(int(round((c + m) * 255)) for c in (r, g, b))


def hex_of(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*[max(0, min(255, int(v))) for v in rgb])


def kmeans(samples: np.ndarray, k: int = 8, iterations: int = 16) -> np.ndarray:
    rng = np.random.default_rng(7)
    centers = samples[rng.choice(len(samples), size=min(k, len(samples)), replace=False)]
    for _ in range(iterations):
        dist = ((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = dist.argmin(axis=1)
        for idx in range(len(centers)):
            group = samples[labels == idx]
            if len(group):
                centers[idx] = group.mean(axis=0)
    return centers


def scheme(hue: float) -> dict:
    """Build light/dark surface ramps from a single accent hue."""
    return {
        "light": {
            "bg": hex_of(hsv_to_rgb(hue, 0.10, 0.975)),
            "layer1": hex_of(hsv_to_rgb(hue, 0.09, 0.955)),
            "layer2": hex_of(hsv_to_rgb(hue, 0.11, 0.925)),
            "border": hex_of(hsv_to_rgb(hue, 0.18, 0.84)),
            "text": hex_of(hsv_to_rgb(hue, 0.42, 0.16)),
            "textSoft": hex_of(hsv_to_rgb(hue, 0.24, 0.40)),
        },
        "dark": {
            "bg": hex_of(hsv_to_rgb(hue, 0.30, 0.095)),
            "layer1": hex_of(hsv_to_rgb(hue, 0.26, 0.145)),
            "layer2": hex_of(hsv_to_rgb(hue, 0.22, 0.205)),
            "border": hex_of(hsv_to_rgb(hue, 0.24, 0.34)),
            "text": hex_of(hsv_to_rgb(hue, 0.06, 0.96)),
            "textSoft": hex_of(hsv_to_rgb(hue, 0.10, 0.72)),
        },
    }


def apply_accent(palette: dict, accent_hex: str) -> dict:
    """Lock the accent to a design decision while keeping the mined clusters as evidence."""
    rgb = tuple(int(accent_hex[i : i + 2], 16) for i in (1, 3, 5))
    hue, _sat, _val = rgb_to_hsv(rgb)
    palette["accent"] = accent_hex
    palette["accentHue"] = round(hue, 1)
    palette["accentSource"] = "design-override"
    palette.update(scheme(hue))
    return palette


def mine_palette(paths: list[Path], k: int = 8) -> dict:
    samples = []
    for path in paths:
        try:
            with Image.open(path) as img:
                small = ImageOps.exif_transpose(img).convert("RGB").resize((140, 140), Image.Resampling.BILINEAR)
        except Exception:  # noqa: BLE001
            continue
        arr = np.asarray(small).reshape(-1, 3).astype(np.float32)
        hsv = np.array([rgb_to_hsv(tuple(int(v) for v in px)) for px in arr[::7]], dtype=np.float32)
        keep = (hsv[:, 2] > 0.14) & (hsv[:, 2] < 0.98)
        samples.append(arr[::7][keep])
    if not samples:
        raise SystemExit("no readable images for palette mining")
    data = np.concatenate(samples)
    if len(data) > 24000:
        data = data[np.random.default_rng(3).choice(len(data), 24000, replace=False)]
    centers = np.clip(kmeans(data, k), 0, 255)

    clusters = []
    for center in centers:
        rgb = tuple(int(round(v)) for v in center)
        hue, sat, val = rgb_to_hsv(rgb)
        clusters.append({"rgb": rgb, "hex": hex_of(rgb), "h": round(hue, 1), "s": round(sat, 3), "v": round(val, 3)})
    clusters.sort(key=lambda c: c["v"])

    accent = max(clusters, key=lambda c: c["s"] * (0.45 + c["v"]) if 0.18 < c["v"] < 0.92 else -1)
    hue = accent["h"]
    return {
        "accent": accent["hex"],
        "accentSource": "mined",
        "accentHue": hue,
        "clusters": [{"hex": c["hex"], "h": c["h"], "s": c["s"], "v": c["v"]} for c in clusters],
        **scheme(hue),
    }


# ---------------------------------------------------------------- selection


def list_images(folder: Path) -> list[dict]:
    out = []
    for path in sorted(folder.iterdir()) if folder.exists() else []:
        if path.suffix.lower() not in EXTS:
            continue
        try:
            with Image.open(path) as img:
                width, height = ImageOps.exif_transpose(img).size
        except Exception:  # noqa: BLE001
            continue
        out.append({"path": path, "w": width, "h": height, "ratio": width / height, "px": width * height})
    return out


def auto_pick(candidates: list[dict], slot: dict) -> dict:
    target_ratio = slot["w"] / slot["h"]
    recipe = slot["recipe"]

    def score(item: dict) -> float:
        ratio_penalty = abs(math.log(item["ratio"] / target_ratio))
        effective = min(item["w"] / slot["w"], item["h"] / slot["h"])
        size_penalty = 0.0 if effective >= 1.0 else (1.0 - effective) * 3.0
        orientation_penalty = 0.0
        if recipe in ("figure",) and item["ratio"] > 1.15:
            orientation_penalty = 1.2
        if recipe in ("background", "ribbon") and item["ratio"] < 1.0:
            orientation_penalty = 0.9
        return ratio_penalty + size_penalty + orientation_penalty

    return min(candidates, key=score)


def build_selection(subject: str, slots: list[dict]) -> dict:
    curated = list_images(ROOT / "curated" / subject)
    pool = curated or list_images(ROOT / "raw" / subject)
    if not pool:
        raise SystemExit(f"no images for {subject} under curated/ or raw/")

    selection = {"subject": subject, "auto": True, "slots": {}}
    used: dict[str, int] = {}
    for slot in slots:
        if slot["recipe"] in ("wordmark", "preview", "icon"):
            continue
        target_ratio = slot["w"] / slot["h"]
        ranked = sorted(pool, key=lambda i: (abs(math.log(i["ratio"] / target_ratio)), -i["px"]))
        # prefer a photo that has not been used yet, so one strong shot does not fill every slot
        best = next((candidate for candidate in ranked if used.get(str(candidate["path"]), 0) == 0), None)
        if best is None:
            best = next((candidate for candidate in ranked if used.get(str(candidate["path"]), 0) < 2), ranked[0])
        used[str(best["path"])] = used.get(str(best["path"]), 0) + 1
        selection["slots"][slot["key"]] = {
            "source": str(best["path"].relative_to(ROOT)).replace("\\", "/"),
            "focus": slot.get("focus", [0.5, 0.5]),
        }

    # the Windows icon reuses the avatar crop
    avatar = selection["slots"].get("avatar-512") or selection["slots"].get("sidebar-character")
    if avatar:
        selection["slots"]["desktop-icon"] = {"source": avatar["source"], "focus": avatar["focus"]}
        selection["slots"]["favicon-32"] = {"source": avatar["source"], "focus": avatar["focus"]}
    return selection


def load_selection(subject: str, slots: list[dict], force_auto: bool, selection_path: str | None = None) -> dict:
    path = ROOT / selection_path if selection_path else ROOT / "spec" / f"selection-{subject}.json"
    if path.exists() and not force_auto:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    selection = build_selection(subject, slots)
    path.write_text(json.dumps(selection, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} (auto selection)")
    return selection


# ----------------------------------------------------------------- recipes


def render_background(src: Image.Image, slot: dict, theme: str, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    if theme == "dark":
        img = grade(img, brightness=0.66, contrast=1.06, saturation=0.92, temperature=-0.06, gamma=1.05)
        img = vignette(img, 0.42)
        img = scrim(img, "bottom", 0.55, 0.30)
    else:
        img = grade(img, brightness=1.04, contrast=0.98, saturation=1.02, temperature=0.05, gamma=0.98)
        img = vignette(img, 0.26)
        img = scrim(img, "bottom", 0.30, 0.45)
    return img


def render_ambient(src: Image.Image, slot: dict, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = img.filter(ImageFilter.GaussianBlur(22))
    img = grade(img, brightness=0.55, contrast=1.05, saturation=0.45, temperature=-0.04)
    return vignette(img, 0.5)


def render_figure(src: Image.Image, slot: dict, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = grade(img, brightness=1.02, contrast=1.04, saturation=1.03, temperature=0.02)
    return vignette(img, 0.18)


def render_card(src: Image.Image, slot: dict, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = grade(img, brightness=1.01, contrast=1.05, saturation=1.02)
    return vignette(img, 0.28)


def render_ribbon(src: Image.Image, slot: dict, extra_blur: float, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = img.filter(ImageFilter.GaussianBlur(1.6 + extra_blur))
    img = grade(img, brightness=0.94, contrast=1.04, saturation=0.96)
    return vignette(img, 0.3)


def render_avatar(src: Image.Image, slot: dict, focus: tuple[float, float]) -> Image.Image:
    img = cover(src, (slot["w"], slot["h"]), focus)
    img = grade(img, brightness=1.02, contrast=1.05, saturation=1.04)
    return img


def render_wordmark(meta: dict, palette: dict, slot: dict) -> Image.Image:
    """Text lockup: name in ink/white per theme, accent rule underneath, transparent ground."""
    width, height = slot["w"], slot["h"]
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.text((4, -4), meta["name"], font=font(FONT_BOLD, 38), fill=255)
    draw.text((6, 44), meta["nameEn"].upper(), font=font(FONT_REGULAR, 15), fill=255)

    accent = tuple(int(palette["accent"][i : i + 2], 16) for i in (1, 3, 5))
    if slot.get("theme") == "dark":
        ink = (245, 242, 240)
    else:
        ink = tuple(int(palette["light"]["text"][i : i + 2], 16) for i in (1, 3, 5))

    canvas.paste(Image.new("RGBA", (width, height), ink + (255,)), (0, 0), mask)
    ImageDraw.Draw(canvas).rectangle([6, 70, 118, 74], fill=accent + (235,))
    return canvas


def render_icon(src: Image.Image, slot: dict, palette: dict, focus: tuple[float, float]) -> Image.Image:
    size = slot["w"]
    img = cover(src, (size, size), focus)
    img = grade(img, brightness=1.02, contrast=1.06, saturation=1.03).convert("RGBA")
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    accent = tuple(int(palette["accent"][i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    ImageDraw.Draw(ring).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), outline=accent, width=max(3, size // 32))
    rounded = Image.new("L", (size, size), 0)
    ImageDraw.Draw(rounded).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base.paste(img, (0, 0), rounded)
    return Image.alpha_composite(base, ring)


def render_preview(
    subject: str,
    meta: dict,
    palette: dict,
    theme: str,
    bg_img: Image.Image,
    hero_img: Image.Image | None,
    avatar_img: Image.Image | None,
    wordmark_img: Image.Image,
    slot: dict,
) -> Image.Image:
    width, height = slot["w"], slot["h"]
    scheme = palette[theme]
    bg = cover(bg_img, (width, height), (0.5, 0.45))
    bg = grade(bg, brightness=1.0 if theme == "light" else 0.92, contrast=1.02, saturation=1.0)
    canvas = bg.convert("RGBA")

    text_color = tuple(int(scheme["text"][i : i + 2], 16) for i in (1, 3, 5))
    soft_color = tuple(int(scheme["textSoft"][i : i + 2], 16) for i in (1, 3, 5))
    accent = tuple(int(palette["accent"][i : i + 2], 16) for i in (1, 3, 5))
    surface = tuple(int(scheme["layer1"][i : i + 2], 16) for i in (1, 3, 5))

    # title bar
    bar = Image.new("RGBA", (width, 52), surface + (228,))
    canvas.alpha_composite(bar, (0, 0))
    canvas.alpha_composite(wordmark_img.resize((216, 46), Image.Resampling.LANCZOS), (20, 4))

    # sidebar
    glass_panel(canvas, (0, 52, 322, height), 0, surface + (214,), blur=24)
    if avatar_img is not None:
        av = avatar_img.resize((64, 64), Image.Resampling.LANCZOS)
        paste_rounded(canvas, av, (28, 84), 32)
    draw = ImageDraw.Draw(canvas)
    draw.text((104, 96), meta["name"], font=font(FONT_BOLD, 24), fill=text_color)
    draw.text((104, 126), meta["nameEn"], font=font(FONT_REGULAR, 15), fill=soft_color)

    draw.rounded_rectangle([24, 176, 298, 218], radius=12, fill=accent + (46,), outline=accent + (120,), width=1)
    draw.text((40, 188), "新对话", font=font(FONT_REGULAR, 16), fill=text_color)
    for i in range(6):
        y = 240 + i * 46
        draw.rounded_rectangle([34, y, 268 - (i % 3) * 28, y + 20], radius=6, fill=soft_color + (70,))
    draw.text((28, height - 58), "皮肤管理 · " + meta["tagline"], font=font(FONT_REGULAR, 14), fill=soft_color)

    # chat column
    glass_panel(canvas, (352, 92, 1438, height - 150), 22, surface + (150,), blur=26)
    draw.text((392, 120), meta["greeting"], font=font(FONT_BOLD, 30), fill=text_color)
    draw.text((392, 162), "DeepSeek Harness · " + meta["tagline"], font=font(FONT_REGULAR, 16), fill=soft_color)

    bubble_fill = tuple(int(scheme["layer2"][i : i + 2], 16) for i in (1, 3, 5)) + (216,)
    draw.rounded_rectangle([392, 216, 1150, 300], radius=16, fill=bubble_fill)
    for i in range(3):
        draw.rounded_rectangle([416, 238 + i * 20, 1120 - i * 90, 252 + i * 20], radius=6, fill=soft_color + (80,))
    draw.rounded_rectangle([720, 330, 1372, 400], radius=16, fill=accent + (150,))
    for i in range(2):
        draw.rounded_rectangle([744, 350 + i * 22, 1300 - i * 60, 362 + i * 22], radius=6, fill=(255, 255, 255, 120))
    draw.rounded_rectangle([392, 430, 1180, 522], radius=16, fill=bubble_fill)
    for i in range(3):
        draw.rounded_rectangle([416, 452 + i * 20, 1130 - i * 110, 466 + i * 20], radius=6, fill=soft_color + (80,))

    # tool-call card, so the column reads like a real transcript
    draw.rounded_rectangle([392, 556, 1180, 664], radius=14, fill=surface + (206,), outline=accent + (70,), width=1)
    draw.ellipse([416, 582, 432, 598], fill=accent + (255,))
    draw.text((448, 578), "读取 · 素材清单", font=font(FONT_REGULAR, 17), fill=text_color)
    for i in range(2):
        draw.rounded_rectangle([448, 612 + i * 18, 1080 - i * 120, 624 + i * 18], radius=5, fill=soft_color + (72,))

    # composer
    draw.rounded_rectangle([392, height - 128, 1398, height - 52], radius=24, fill=surface + (232,), outline=accent + (90,), width=1)
    draw.text((424, height - 106), "给 DeepSeek 发送消息…", font=font(FONT_REGULAR, 18), fill=soft_color)
    draw.ellipse([1338, height - 116, 1382, height - 72], fill=accent + (255,))

    # hero card
    if hero_img is not None:
        card_w, card_h = 402, 690
        x, y = width - card_w - 44, 92
        shadow = Image.new("RGBA", (card_w + 40, card_h + 40), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([20, 24, card_w + 20, card_h + 24], radius=26, fill=(0, 0, 0, 110))
        canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)), (x - 20, y - 20))
        card = cover(hero_img, (card_w, card_h), (0.5, 0.22)).convert("RGBA")
        paste_rounded(canvas, card, (x, y), 26)
        draw.rounded_rectangle([x + 22, y + card_h - 96, x + card_w - 22, y + card_h - 26], radius=14, fill=(0, 0, 0, 110))
        draw.text((x + 40, y + card_h - 84), meta["name"], font=font(FONT_BOLD, 26), fill=(255, 255, 255, 240))
        draw.text((x + 40, y + card_h - 52), meta["tagline"], font=font(FONT_REGULAR, 14), fill=(255, 255, 255, 200))

    return canvas.convert("RGB")


# -------------------------------------------------------------------- main


def save_webp(img: Image.Image, path: Path, quality: int = 86) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--auto", action="store_true", help="ignore the stored selection and re-pick")
    parser.add_argument("--palette", action="store_true", help="only mine the palette")
    parser.add_argument("--quality", type=int, default=86)
    parser.add_argument("--pool", default=None, help="image pool folder, e.g. curated-v2/lusi (default curated/<subject>)")
    parser.add_argument("--selection", default=None, help="selection JSON path, e.g. spec/selection-v2-lusi.json")
    parser.add_argument("--palette-out", default=None, help="palette JSON path (default spec/palette-<subject>.json)")
    args = parser.parse_args()

    subject = args.subject
    meta = SUBJECT_META[subject]
    slot_defs = json.loads((ROOT / "spec" / "slots.json").read_text(encoding="utf-8"))["slots"]
    pool_dir = ROOT / args.pool if args.pool else ROOT / "curated" / subject
    curated = list_images(pool_dir) or list_images(ROOT / "raw" / subject)
    if not curated:
        raise SystemExit(f"no curated images for {subject}")

    palette = mine_palette([item["path"] for item in curated])
    if meta.get("accent"):
        palette = apply_accent(palette, meta["accent"])
    palette_path = ROOT / args.palette_out if args.palette_out else ROOT / "spec" / f"palette-{subject}.json"
    palette_path.write_text(json.dumps({"subject": subject, **palette}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"palette -> {palette_path.name} accent={palette['accent']}")
    if args.palette:
        return 0

    selection = load_selection(subject, slot_defs, args.auto, args.selection)
    out_dir = ROOT / "skin-assets" / subject
    out_dir.mkdir(parents=True, exist_ok=True)

    # render order matters: preview reuses already-rendered slots
    rendered: dict[str, Image.Image] = {}
    for slot in slot_defs:
        recipe = slot["recipe"]
        key = slot["key"]
        target = out_dir / slot["file"]

        if recipe == "wordmark":
            img = render_wordmark(meta, palette, slot)
            img.save(target, "PNG", optimize=True)
            rendered[key] = img
            print(f"  {slot['file']:26s} wordmark")
            continue

        if recipe == "preview":
            if slot["theme"] == "dark":
                bg = rendered.get("bg-chat-dark") or rendered.get("bg-chat-light")
            else:
                bg = rendered.get("bg-chat-light") or rendered.get("bg-chat-dark")
            hero = rendered.get("hero-portrait")
            avatar = rendered.get("avatar-512")
            wordmark = rendered.get(f"wordmark-{slot['theme']}") or rendered.get("wordmark-light")
            if bg is None or wordmark is None:
                print(f"  skip {slot['file']}: missing base slots")
                continue
            img = render_preview(subject, meta, palette, slot["theme"], bg, hero, avatar, wordmark, slot)
            img.save(target, "WEBP", quality=88, method=6)
            print(f"  {slot['file']:26s} preview ({slot['theme']})")
            continue

        pick = selection["slots"].get(key)
        if not pick:
            print(f"  skip {slot['file']}: no source picked")
            continue
        source = ROOT / pick["source"]
        if not source.exists():
            print(f"  skip {slot['file']}: missing {pick['source']}")
            continue
        focus = tuple(pick.get("focus", slot.get("focus", [0.5, 0.5])))
        with Image.open(source) as raw:
            src = ImageOps.exif_transpose(raw).convert("RGB")

        if recipe == "background":
            img = render_background(src, slot, slot["theme"], focus)
            save_webp(img, target, args.quality)
        elif recipe == "ambient":
            img = render_ambient(src, slot, focus)
            save_webp(img, target, 82)
        elif recipe == "figure":
            img = render_figure(src, slot, focus)
            save_webp(img, target, 88)
        elif recipe == "card":
            img = render_card(src, slot, focus)
            save_webp(img, target, 86)
        elif recipe == "ribbon":
            img = render_ribbon(src, slot, float(pick.get("blur", 0)), focus)
            save_webp(img, target, 84)
        elif recipe == "avatar":
            img = render_avatar(src, slot, focus)
            if slot["format"] == "PNG":
                img.save(target, "PNG", optimize=True)
            else:
                save_webp(img, target, 88)
        elif recipe == "icon":
            img = render_icon(src, slot, palette, focus)
            img.save(target, "ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        else:
            raise SystemExit(f"unknown recipe {recipe}")

        if recipe == "avatar":
            rendered[key] = Image.open(target).convert("RGBA") if slot["format"] == "WEBP" else img
        else:
            rendered[key] = Image.open(target).convert("RGB")
        print(f"  {slot['file']:26s} {recipe:10s} <- {pick['source'].split('/')[-1][:46]}")

    print(f"\nskin-assets/{subject}: {len(list(out_dir.iterdir()))} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
