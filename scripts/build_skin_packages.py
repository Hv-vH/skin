#!/usr/bin/env python3
"""Build the two DSH skin plugin packages from the v2 asset pack.

The package shape mirrors the installed reference skins
(@smalltailqwq/dsh-client-ui-skin-maid-atelier / orca-link):
  package.json + cordis.patch.yml + skin.json + locale + preview
  lib/index.js   host half: serves assets/runtime/<sha256>.<ext> under /skin-assets/<id>
  lib/client.js  browser half: ModuleLoader bundle that applies the skin
  assets/runtime hashed artwork + manifest.json allowlist
  assets/icons/<id>.ico  Windows shortcut icon
  assets/plugin-icon.webp  plugin inventory icon

Usage:
  python scripts/build_skin_packages.py            # build both skins
  python scripts/build_skin_packages.py --check    # build + validate (no install)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ROOT / "packages"
ASSET_ROOT = ROOT / "skin-assets"
SPEC = ROOT / "spec" / "skins-package.json"
SRC = ROOT / "skin-src"

# logical slot key -> source file under skin-assets/<subject>/
RUNTIME_SLOTS = {
    "bgChatLight": "bg-chat-light.webp",
    "bgChatDark": "bg-chat-dark.webp",
    "ambient": "bg-ambient-blur.webp",
    "hero": "hero-portrait.webp",
    "sidebar": "sidebar-character.webp",
    "card": "card-photo.webp",
    "ribbonWide": "ribbon-wide.webp",
    "ribbonStrip": "ribbon-strip.webp",
    "wordmarkLight": "wordmark-light.png",
    "wordmarkDark": "wordmark-dark.png",
    "avatar512": "avatar-512.webp",
    "avatar192": "avatar-192.webp",
    "favicon128": "favicon-128.png",
    "favicon32": "favicon-32.png",
}

ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
BODY_ATTR_RE = re.compile(r"^data-[a-z0-9_.:-]+$")
PACKAGE_RE = re.compile(r"^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$")
WIRING_RE = re.compile(r"^[a-zA-Z0-9@/_.:-]+$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

LICENSE_TEXT = """MIT License

Copyright (c) 2026 Shinji

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---------------------------------------------------------------------------
ARTWORK NOTICE

The character photography shipped under assets/runtime, assets/icons,
preview and assets/plugin-icon.webp is collected from public portraits,
event and magazine photographs and is included for PRIVATE, LOCAL USE ONLY.
It is NOT covered by the MIT grant above: do not redistribute, publish or
sell the image files. Portrait subjects are real people; no synthetic
imagery, no defacement. If you share the code, replace the artwork with
material you have rights to.
"""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_text(path: Path, text: str) -> None:
    """Always LF, UTF-8, no BOM (fingerprints and cross-platform builds rely on it)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def write_json(path: Path, value) -> None:
    write_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def manifest_json(files: list[str]) -> str:
    return "[\n" + ",\n".join(f'\t"{name}"' for name in files) + "\n]"


def hash_skin_assets(digest: "hashlib._Hash", skin_root: Path) -> None:
    """Mirror the skin manager's computeSkinFingerprint asset fold."""
    manifest_rel = "assets/runtime/manifest.json"
    manifest_path = skin_root / manifest_rel
    if not manifest_path.exists():
        return
    text = manifest_path.read_text(encoding="utf-8").replace("\r\n", "\n")
    files = json.loads(text)
    if not isinstance(files, list) or any(
        not isinstance(name, str) or not re.fullmatch(r"[a-f0-9]{64}\.(webp|png)", name) for name in files
    ):
        raise SystemExit(f"{skin_root.name}: invalid assets/runtime/manifest.json")
    digest.update(manifest_rel.encode("utf-8"))
    digest.update(b"\0")
    digest.update(str(len(text.encode("utf-8"))).encode("utf-8"))
    digest.update(b"\0")
    digest.update(text.encode("utf-8"))
    for name in sorted(set(files)):
        rel = f"assets/runtime/{name}"
        data = (skin_root / rel).read_bytes()
        if sha256_bytes(data) != name.split(".")[0]:
            raise SystemExit(f"{skin_root.name}: artwork hash mismatch for {name}")
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(data)).encode("utf-8"))
        digest.update(b"\0")
        digest.update(data)


def compute_fingerprint(skin_root: Path) -> str:
    digest = hashlib.sha256()
    for rel in ("lib/client.js", "lib/index.js", "cordis.patch.yml", "skin.json"):
        text = (skin_root / rel).read_text(encoding="utf-8").replace("\r\n", "\n")
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(text.encode("utf-8"))).encode("utf-8"))
        digest.update(b"\0")
        digest.update(text.encode("utf-8"))
    hash_skin_assets(digest, skin_root)
    return digest.hexdigest()


def validate_config(skin: dict) -> None:
    problems: list[str] = []
    for key, pattern in (("id", ID_RE), ("package", PACKAGE_RE), ("bodyAttr", BODY_ATTR_RE)):
        value = skin.get(key)
        if not isinstance(value, str) or not pattern.match(value):
            problems.append(f"{key}={value!r} does not match {pattern.pattern}")
    wiring = skin.get("wiringId") or f"ui-skin-{skin.get('id')}"
    if not WIRING_RE.match(wiring):
        problems.append(f"wiringId={wiring!r} is not a valid loader row id")
    if not HEX_RE.match(str(skin.get("accent", ""))):
        problems.append("accent must be #rrggbb")
    for mode in ("light", "dark"):
        theme = skin.get("theme", {}).get(mode)
        if not isinstance(theme, dict) or not isinstance(theme.get("tokens"), dict) or not theme["tokens"]:
            problems.append(f"theme.{mode}.tokens missing")
        else:
            for token, value in theme["tokens"].items():
                if not token.startswith("--") or not isinstance(value, str):
                    problems.append(f"theme.{mode}.tokens has invalid entry {token!r}")
    for name in ("name", "nameEn", "tagline", "taglineEn", "description", "descriptionEn"):
        if not isinstance(skin.get(name), str) or not skin[name].strip():
            problems.append(f"{name} missing")
    if not isinstance(skin.get("order"), (int, float)):
        problems.append("order must be a number")
    if not isinstance(skin.get("defaults", {}).get("dim"), (int, float)):
        problems.append("defaults.dim must be a number")
    if skin.get("heroSide") not in ("left", "right"):
        problems.append("heroSide must be left/right")
    if problems:
        raise SystemExit(f"{skin.get('package', '?')}: config invalid:\n  - " + "\n  - ".join(problems))


def build_skin(skin: dict, base: dict, client_template: str, index_template: str) -> dict:
    validate_config(skin)
    subject = skin["subject"]
    source_dir = ASSET_ROOT / subject
    if not source_dir.is_dir():
        raise SystemExit(f"missing asset directory: {source_dir}")

    package = skin["package"]
    skin_id = skin["id"]
    pkg_root = PACKAGES / package
    if pkg_root.exists():
        resolved = pkg_root.resolve()
        if resolved.parent != PACKAGES.resolve() or resolved == ROOT.resolve():
            raise SystemExit(f"refusing to remove unexpected path: {resolved}")
        shutil.rmtree(resolved)
    pkg_root.mkdir(parents=True)

    # --- artwork: content-addressed runtime files + allowlist -----------------
    runtime_dir = pkg_root / "assets" / "runtime"
    runtime_dir.mkdir(parents=True)
    asset_map: dict[str, str] = {}
    manifest: list[str] = []
    for key, source_name in RUNTIME_SLOTS.items():
        source = source_dir / source_name
        if not source.exists():
            raise SystemExit(f"missing asset: {source}")
        data = source.read_bytes()
        digest = sha256_bytes(data)
        extension = source.suffix.lower().lstrip(".")
        if extension not in ("webp", "png"):
            raise SystemExit(f"unsupported runtime asset type: {source}")
        hashed = f"{digest}.{extension}"
        (runtime_dir / hashed).write_bytes(data)
        asset_map[key] = hashed
        manifest.append(hashed)
    manifest = sorted(set(manifest))
    write_text(runtime_dir / "manifest.json", manifest_json(manifest) + "\n")

    # --- icons / preview / plugin icon ---------------------------------------
    icon_source = source_dir / "desktop-icon.ico"
    if not icon_source.exists():
        raise SystemExit(f"missing desktop icon: {icon_source}")
    icon_rel = f"assets/icons/{skin_id}.ico"
    (pkg_root / "assets" / "icons").mkdir(parents=True)
    (pkg_root / icon_rel).write_bytes(icon_source.read_bytes())

    plugin_icon_rel = "assets/plugin-icon.webp"
    (pkg_root / "assets" / "plugin-icon.webp").write_bytes((source_dir / "avatar-512.webp").read_bytes())

    preview_light = source_dir / "preview-light.webp"
    preview_dark = source_dir / "preview-dark.webp"
    for source, name in ((preview_light, "light.webp"), (preview_dark, "dark.webp")):
        if not source.exists():
            raise SystemExit(f"missing preview: {source}")
        (pkg_root / "preview").mkdir(parents=True, exist_ok=True)
        (pkg_root / "preview" / name).write_bytes(source.read_bytes())

    # --- skin.json -----------------------------------------------------------
    skin_manifest = {
        "id": skin_id,
        "name": skin["name"],
        "nameEn": skin["nameEn"],
        "author": skin.get("author", base["author"]),
        "tagline": skin["tagline"],
        "taglineEn": skin["taglineEn"],
        "description": skin["description"],
        "descriptionEn": skin["descriptionEn"],
        "tags": skin.get("tags", []),
        "accent": skin["accent"],
        "bodyAttr": skin["bodyAttr"],
        "dshCompatibility": base["dshCompatibility"],
        "package": package,
        "wiring": {"id": skin.get("wiringId", f"ui-skin-{skin_id}"), "bundleWired": False},
        "preview": {"light": "preview/light.webp", "dark": "preview/dark.webp"},
        "desktopIcon": icon_rel,
        "order": skin["order"],
    }
    write_json(pkg_root / "skin.json", skin_manifest)

    # --- package.json --------------------------------------------------------
    package_manifest = {
        "name": package,
        "description": skin["descriptionEn"],
        "icon": plugin_icon_rel,
        "version": "1.0.0",
        "type": "module",
        "main": "lib/index.js",
        "exports": {
            ".": "./lib/index.js",
            "./client": "./lib/client.js",
            "./skin.json": "./skin.json",
            "./locale/*.json": "./locale/*.json",
            "./package.json": "./package.json",
        },
        "dsh": {
            "bundle": {"patch": "./cordis.patch.yml"},
            "client": {"inject": ["@deepseek-ai/dsh-client-ui-layout"], "platform": "web"},
        },
        "author": skin.get("author", base["author"]),
        "license": "MIT",
        "files": [
            "lib/index.js",
            "lib/client.js",
            "cordis.patch.yml",
            "skin.json",
            "skin.build.json",
            "preview",
            "assets/icons/*.ico",
            "LICENSE",
            "README.md",
            "assets/runtime",
            "locale/*.json",
            "assets/plugin-icon.webp",
        ],
        "peerDependencies": {
            "@deepseek-ai/cordis": base["cordisPeer"],
            "@deepseek-ai/dsh": base["dshPeer"],
        },
        "peerDependenciesMeta": {"@deepseek-ai/dsh": {"optional": True}},
    }
    write_json(pkg_root / "package.json", package_manifest)

    # --- loader patch / locales / license / readme ---------------------------
    write_text(
        pkg_root / "cordis.patch.yml",
        "# " + skin_id + " skin bundle patch: inserts its public dsh.client entry into the web plugin roster.\n"
        "# Mutual exclusion between skins is managed by the skin manager (home/profile patch rows).\n"
        "- insert:\n"
        f"    - id: {skin_manifest['wiring']['id']}\n"
        f"      name: '{package}'\n",
    )

    write_json(
        pkg_root / "locale" / "zh.json",
        {"meta": {"title": f"{skin['name']} · {skin['nameEn']}", "description": skin["description"]}},
    )
    write_json(
        pkg_root / "locale" / "en.json",
        {"meta": {"title": f"{skin['nameEn']} · {skin['name']}", "description": skin["descriptionEn"]}},
    )
    write_text(pkg_root / "LICENSE", LICENSE_TEXT)
    write_text(
        pkg_root / "README.md",
        f"# {skin['name']} · {skin['nameEn']}\n\n"
        f"{skin['description']}\n\n"
        f"{skin['descriptionEn']}\n\n"
        "DeepSeek Harness Web GUI skin plugin. Presentation only: it overrides theme tokens inside "
        f"`body[{skin['bodyAttr']}]`, serves its own artwork from `/skin-assets/{skin_id}/<sha256>.<ext>`, "
        "and mounts decorative layers it fully removes on dispose. It registers with "
        "`@smalltailqwq/dsh-client-ui-skin-deep-whale-manager` through `skin.json` and the v2 "
        "customization protocol (artwork toggle, accent color, backdrop dimming, wordmark, discreet-hours schedule).\n\n"
        "## Install\n\n"
        "```sh\n"
        f"dsh plugin --profile desktop add <path-to-this-directory>\n"
        "```\n\n"
        "Then pick the skin under Settings → Skins (皮肤管理).\n\n"
        "## Artwork\n\n"
        "Collected from public portraits/event/magazine photos; private local use only, do not redistribute. "
        "Code is MIT, artwork is not. Portrait subjects are real people and are not modified or defaced.\n",
    )

    # --- lib/index.js --------------------------------------------------------
    host = index_template.replace("__MANIFEST__", manifest_json(manifest)).replace("__SKIN_ID__", skin_id)
    write_text(pkg_root / "lib" / "index.js", host)

    # --- lib/client.js -------------------------------------------------------
    client_config = {
        "package": package,
        "id": skin_id,
        "name": skin["name"],
        "nameEn": skin["nameEn"],
        "bodyAttr": skin["bodyAttr"],
        "accent": skin["accent"],
        "accentHover": skin["accentHover"],
        "heroSide": skin["heroSide"],
        "defaults": skin["defaults"],
        "shape": skin["shape"],
        "theme": skin["theme"],
        "assets": asset_map,
        "caption": skin["nameEn"].upper(),
    }
    client = client_template.replace("__PACKAGE__", json.dumps(package)).replace(
        "/*__SKIN_CONFIG__*/ null", json.dumps(client_config, ensure_ascii=False, separators=(",", ":"))
    )
    write_text(pkg_root / "lib" / "client.js", client)

    # --- skin.build.json (fingerprint must be computed last) -----------------
    fingerprint = compute_fingerprint(pkg_root)
    write_json(
        pkg_root / "skin.build.json",
        {
            "schema": 1,
            "fingerprint": fingerprint,
            "repository": base["repository"],
            "path": f"packages/{package}",
        },
    )

    total_bytes = sum(path.stat().st_size for path in pkg_root.rglob("*") if path.is_file())
    runtime_bytes = sum((runtime_dir / name).stat().st_size for name in manifest)
    return {
        "package": package,
        "id": skin_id,
        "dir": str(pkg_root),
        "runtime_files": len(manifest),
        "runtime_bytes": runtime_bytes,
        "package_bytes": total_bytes,
        "fingerprint": fingerprint,
        "manifest": manifest,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="run structural checks after building")
    args = parser.parse_args()

    base = json.loads(SPEC.read_text(encoding="utf-8"))
    if base.get("schema") != 1:
        raise SystemExit("unsupported spec schema")
    client_template = (SRC / "client.js.tmpl").read_text(encoding="utf-8")
    index_template = (SRC / "index.js.tmpl").read_text(encoding="utf-8")

    results = []
    for skin in base["skins"]:
        result = build_skin(skin, base, client_template, index_template)
        results.append(result)
        print(
            f"built {result['package']}: {result['runtime_files']} runtime assets "
            f"({result['runtime_bytes'] / 1024:.0f} KiB), package {result['package_bytes'] / 1024:.0f} KiB, "
            f"fingerprint {result['fingerprint'][:16]}…"
        )

    if args.check:
        ok = True
        for result in results:
            pkg = Path(result["dir"])
            for rel in ("lib/index.js", "lib/client.js", "skin.json", "package.json", "cordis.patch.yml"):
                if not (pkg / rel).is_file():
                    print(f"FAIL {pkg.name}: missing {rel}")
                    ok = False
            for name in result["manifest"]:
                hashed = name.split(".")[0]
                if sha256_file(pkg / "assets" / "runtime" / name) != hashed:
                    print(f"FAIL {pkg.name}: hash mismatch {name}")
                    ok = False
            if compute_fingerprint(pkg) != result["fingerprint"]:
                print(f"FAIL {pkg.name}: fingerprint changed after build")
                ok = False
            print(f"check {pkg.name}: {'PASS' if ok else 'FAIL'}")
        if not ok:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
