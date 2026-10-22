#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# lusiskin skin kit - macOS installer
#
# Installs the two DSH Web GUI skins (Rosy Cream / Ivory Noir) and, when it is
# not present yet, the exact skin-manager build they were verified against.
# Everything is copied into $DSH_HOME/lusiskin-skins first, then registered with
# `dsh plugin add` (pnpm link), so the download folder can be deleted afterwards.
#
# Usage:
#   bash install-macos.sh [--profile desktop|web] [--dsh <path>] [--dry-run]
#                         [--no-verify]
#
# Exit codes: 0 success, 1 failure, 2 usage.
# ---------------------------------------------------------------------------
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
PROFILE="desktop"
DSH_BIN=""
DRY_RUN=0
NO_VERIFY=0

KIT_PACKAGES="dsh-client-ui-skin-rosy-cream dsh-client-ui-skin-ivory-noir"
MANAGER_PACKAGE="@smalltailqwq/dsh-client-ui-skin-deep-whale-manager"
MANAGER_DIR_NAME="dsh-client-ui-skin-deep-whale-manager"
VERIFIED_DSH_VERSION="0.2.1-rc.2"

say() { printf '%s\n' "$*"; }
note() { printf '[提示] %s\n' "$*"; }
fail() { printf '\n[失败] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法: bash install-macos.sh [选项]

选项:
  --profile <name>  安装到哪个 DSH profile（默认 desktop；浏览器 Web 版用 web）
  --dsh <path>      指定 dsh 可执行文件（默认自动查找官方桌面版自带的 dsh）
  --dry-run         只打印将要执行的操作，不改动任何文件
  --no-verify       安装后不跑静态校验
  -h, --help        显示本帮助
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      [ $# -ge 2 ] || fail "--profile 需要一个值"
      PROFILE="$2"
      shift 2
      ;;
    --dsh)
      [ $# -ge 2 ] || fail "--dsh 需要一个值"
      DSH_BIN="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-verify)
      NO_VERIFY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "未知参数: $1"
      ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || fail "这个脚本是给 macOS 用的。Windows 上请直接运行: dsh plugin --profile desktop add <皮肤目录>"

# --- locate dsh ------------------------------------------------------------
if [ -n "$DSH_BIN" ]; then
  [ -x "$DSH_BIN" ] || fail "--dsh 指定的文件不可执行: $DSH_BIN"
else
  APP_DSH="$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
  SYSTEM_DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
  if [ -x "$SYSTEM_DSH" ]; then
    DSH_BIN="$SYSTEM_DSH"
  elif [ -x "$APP_DSH" ]; then
    DSH_BIN="$APP_DSH"
  elif command -v dsh >/dev/null 2>&1; then
    DSH_BIN=$(command -v dsh)
  elif [ -x "/usr/local/bin/dsh" ]; then
    DSH_BIN="/usr/local/bin/dsh"
  else
    fail "找不到 dsh 命令。请先安装官方 DeepSeek Harness 桌面版，并在菜单栏 DeepSeek Harness -> Manage dsh Command… 里安装命令；或用 --dsh 指定完整路径。"
  fi
fi
say "使用 dsh: $DSH_BIN"

DSH_VERSION=$("$DSH_BIN" --version 2>/dev/null | head -n 1 | tr -d '\r' || true)
say "DSH 版本: ${DSH_VERSION:-未知}"

case "$DSH_VERSION" in
  "$VERIFIED_DSH_VERSION")
    ;;
  0.2.*)
    note "皮肤包声明适配 $VERIFIED_DSH_VERSION；当前为 $DSH_VERSION，同属 0.2.x。若管理器提示未适配，点皮肤卡片的切换并确认即可。"
    ;;
  "")
    note "未能读取 DSH 版本（可能命令不在 PATH）。安装仍可继续，之后在皮肤管理页确认。"
    ;;
  *)
    note "当前 DSH 为 $DSH_VERSION，皮肤包声明适配 $VERIFIED_DSH_VERSION；管理器可能提示未适配，点切换并确认即可。若 DSH 升到 0.3 以上，请重新构建皮肤包。"
    ;;
esac

DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
DEST="$DSH_HOME_DIR/lusiskin-skins"

if [ ! -d "$PROFILE_DIR" ]; then
  note "profile '$PROFILE' 还不存在：建议先启动一次 DSH 桌面版再安装（安装命令也会创建它）。"
fi

# --- verify kit integrity --------------------------------------------------
if [ -f "$HERE/SHA256SUMS" ]; then
  if command -v shasum >/dev/null 2>&1; then
    ( cd "$HERE" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ) || fail "安装包完整性校验失败（SHA256SUMS 不匹配）。请重新传输安装包。"
    say "安装包完整性校验通过"
  elif command -v sha256sum >/dev/null 2>&1; then
    ( cd "$HERE" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) || fail "安装包完整性校验失败（SHA256SUMS 不匹配）。请重新传输安装包。"
    say "安装包完整性校验通过"
  else
    note "系统没有 shasum/sha256sum，跳过完整性校验。"
  fi
fi

# --- manager already installed? -------------------------------------------
MANAGER_ARG=""
if grep -q "$MANAGER_PACKAGE" "$PROFILE_DIR/package.json" 2>/dev/null; then
  say "皮肤管理器已安装，保留现有版本（不覆盖）。"
else
  MANAGER_ARG="$DEST/$MANAGER_DIR_NAME"
fi

# --- copy packages into a stable home --------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  say "[dry-run] 会复制 $HERE/skins -> $DEST/skins"
  [ -n "$MANAGER_ARG" ] && say "[dry-run] 会复制 $HERE/manager/$MANAGER_DIR_NAME -> $MANAGER_ARG"
else
  mkdir -p "$DEST" || fail "无法创建 $DEST"
  rm -rf "$DEST/skins" || fail "无法清理旧目录 $DEST/skins"
  cp -R "$HERE/skins" "$DEST/skins" || fail "复制皮肤包失败"
  if [ -n "$MANAGER_ARG" ]; then
    rm -rf "$DEST/$MANAGER_DIR_NAME"
    cp -R "$HERE/manager/$MANAGER_DIR_NAME" "$MANAGER_DIR_NAME.tmp" 2>/dev/null || true
    rm -rf "$DEST/$MANAGER_DIR_NAME.tmp"
    cp -R "$HERE/manager/$MANAGER_DIR_NAME" "$DEST/" || fail "复制皮肤管理器失败"
  fi
  cp "$HERE/uninstall-macos.sh" "$DEST/uninstall-macos.sh" 2>/dev/null || true
  say "已复制到 $DEST"
fi

# --- register with the profile --------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  say "[dry-run] \"$DSH_BIN\" plugin --profile \"$PROFILE\" add ${MANAGER_ARG:+\\\"$MANAGER_ARG\\\" }\\\"$DEST/skins/dsh-client-ui-skin-rosy-cream\\\" \\\"$DEST/skins/dsh-client-ui-skin-ivory-noir\\\""
  say "（dry-run 结束，没有改动）"
  exit 0
fi

set -- "$DEST/skins/dsh-client-ui-skin-rosy-cream" "$DEST/skins/dsh-client-ui-skin-ivory-noir"
if [ -n "$MANAGER_ARG" ]; then
  set -- "$MANAGER_ARG" "$@"
fi

say "正在注册插件到 profile: $PROFILE"
if ! "$DSH_BIN" plugin --profile "$PROFILE" add "$@"; then
  fail "插件注册失败。常见原因: 1) 用的是独立 npm 版 dsh，不能管理 desktop profile（请用 --dsh 指定桌面版 dsh）；2) 没有网络但管理器尚未安装；3) DSH 未安装完整。"
fi

# --- static verification ---------------------------------------------------
if [ "$NO_VERIFY" -eq 1 ]; then
  note "已按要求跳过静态校验。"
elif [ "$DSH_VERSION" != "$VERIFIED_DSH_VERSION" ]; then
  note "DSH 版本与皮肤包声明版本不同，跳过静态校验（不影响皮肤使用）。"
else
  NODE_BIN=""
  if command -v node >/dev/null 2>&1; then
    NODE_BIN=$(command -v node)
  else
    RUNTIME_DIR=$(cd "$(dirname "$DSH_BIN")/../.." && pwd 2>/dev/null || true)
    if [ -n "$RUNTIME_DIR" ] && [ -x "$RUNTIME_DIR/primary-runtime/dependencies/node/bin/node" ]; then
      NODE_BIN="$RUNTIME_DIR/primary-runtime/dependencies/node/bin/node"
    fi
  fi
  if [ -n "$NODE_BIN" ] && [ -f "$HERE/tools/verify_skin_plugins.mjs" ]; then
    if "$NODE_BIN" "$HERE/tools/verify_skin_plugins.mjs" \
      "$PROFILE_DIR/node_modules/dsh-client-ui-skin-rosy-cream" \
      "$PROFILE_DIR/node_modules/dsh-client-ui-skin-ivory-noir"; then
      say "静态校验通过"
    else
      note "静态校验有部分未通过；皮肤通常仍可使用，详见上面的输出。"
    fi
  else
    note "没找到可用的 node，跳过静态校验。"
  fi
fi

say ""
say "安装完成。下一步："
say "  1. 完全退出 DeepSeek Harness，再重新打开。"
say "  2. 打开 设置 -> 皮肤管理，点「雾粉奶油光 · Rosy Cream」或「象牙黑金 · Ivory Noir」。"
say "  3. 若卡片提示未声明适配当前 DSH 版本，点切换后在确认框里允许即可（只针对这一个皮肤版本）。"
say ""
say "皮肤以链接方式安装在: $DEST"
say "不要删除这个目录（删除会让两套皮肤和管理器一起失效）。"
say "卸载: bash \"$DEST/uninstall-macos.sh\"（或本安装包里的 uninstall-macos.sh）"
