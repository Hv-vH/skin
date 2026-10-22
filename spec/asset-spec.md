# DSH 皮肤素材规格（实测逆推）

本文的尺寸不是猜的，是把本机已装的两套皮肤拆开量出来的。素材按这套规格加工，才能直接塞进 DSH 皮肤包。

## 1. 结论先看

- DSH 皮肤包的图片资源放在 `assets/runtime/`，文件名是**内容 sha256 前 64 位**加扩展名（如 `98cf9484….webp`），由皮肤自己的 `lib/index.js` 注册 `/skin-assets/<skinId>` 路由对外提供，同源、`immutable` 长缓存，不依赖任何远程 URL。
- 图片是**纯展示层**：皮肤通过 `body[data-dsh-*]` 作用域覆盖 DSH 的设计 token，再把图挂到若干 `data-skin-chrome` 载体上。
- 因此素材只要满足下表的**像素尺寸与体积**，就能无缝替换。

## 2. 实测依据

`@smalltailqwq/dsh-client-ui-skin-maid-atelier@0.1.9` 的运行时素材：

| 实测尺寸 | 张数 | 判断用途 |
|---|---|---|
| 1586×992 | 2 | 对话区背景（亮/暗） |
| 1122×2019、1077×2048、1394×2649 | 3 | 竖版主视觉/立绘 |
| 627×1254 | 2 | 侧栏人物条（1:2） |
| 820×750 级（819×751、620×553） | 2 | 照片卡 |
| 1800×588、2172×320、1400×308、1185×240 | 4 | 装饰带/缎带 |
| 386×321、230×320、268×121、386×30 | 4 | 小饰件 |
| 360×76、240×76 | 3 | 文字标 |
| 512×512、192×192、32×32 | 4 | 应用图标/favicon |
| 1920×1035、1920×1034 | 2 | 皮肤管理预览卡 |

`@smalltailqwq/dsh-client-ui-skin-orca-link` 的运行时素材：

| 实测尺寸 | 张数 | 判断用途 |
|---|---|---|
| 1672×941 | 4 | 整幅背景变体 |
| 1888×2360 | 1 | 竖版主视觉 |
| 819×751 | 1 | 照片卡 |
| 2483×1333 / 2484×1333 | 2 | 预览卡（PNG） |

取两套的并集与公约，得到本项目的槽位表（见 `spec/slots.json`）。

## 3. 槽位表

| 槽位 | 输出尺寸 | 格式 | 体积上限 | 载体/用途 |
|---|---|---|---|---|
| `bg-chat-light.webp` | 1720×1080 | WebP q86 | 350KB | 对话区浅色背景 |
| `bg-chat-dark.webp` | 1720×1080 | WebP q86 | 350KB | 对话区深色背景 |
| `bg-ambient-blur.webp` | 1586×992 | WebP q82 | 180KB | 强模糊衬底，保证长文本可读 |
| `hero-portrait.webp` | 1152×2048 | WebP q88 | 700KB | 着陆页主视觉 |
| `sidebar-character.webp` | 627×1254 | WebP q88 | 400KB | 侧栏人物条 |
| `card-photo.webp` | 820×750 | WebP q86 | 300KB | 照片卡 / 错误页插画位 |
| `ribbon-wide.webp` | 1800×588 | WebP q84 | 260KB | 顶部装饰带 |
| `ribbon-strip.webp` | 2172×320 | WebP q84 | 120KB | 极窄装饰条 |
| `wordmark.png` | 360×76 | PNG alpha | 60KB | 标题栏文字标 |
| `avatar-512.webp` | 512×512 | WebP q88 | 120KB | 插件图标 |
| `avatar-192.webp` | 192×192 | WebP q88 | 40KB | 插件图标小尺寸 |
| `favicon-32/128.png` | 32/128 | PNG | 12/40KB | 标签页图标 |
| `desktop-icon.ico` | 256（多尺寸） | ICO | 220KB | Windows 快捷方式图标 |
| `preview-light/dark.png` | 1920×1035 | PNG | 520KB | 皮肤管理预览卡 |

## 4. 图片加工规则

- **裁切**：`cover` 式（等比放大后裁切），不拉伸。人物类锚点在面部上方（纵向 0.28–0.35），保证脸不被切；背景/缎带类锚点居中。**每个槽位的 `focus` 写在 `spec/selection-<subject>.json` 里，`process_assets.py` 会真正按它取景**（2026-10-21 修复了 `focus` 被忽略的 bug）。
- **底部文字水印**：来自搜狐号/微博/知乎/モデルプレス/bilibili 等转载水印，统一在进流程前从源图底部切除（6%–14%，按水印高度定），输出文件名带 `__wmcut`，切幅记录在 `sources/manifest-curated-<subject>.csv` 的 `watermark_crop_pct`。不再靠"换一张图"回避水印。
- **背景类**必须加：轻微高斯模糊（1.1px）→ 暗角（0.26–0.42）→ 底部渐变暗角（scrim），否则正文对比度不够。
- **衬底类**（`bg-ambient-blur`）模糊 22px、降饱和至 0.45、压暗至 0.55，作为长文本底层。
- **人物类**不放大：源图短边不足目标 0.62 倍时自动选图会扣分；放大只会让脸变糊。背景类允许 Lanczos 放大 1.5 倍内并轻锐化。
- **调色**：同一套皮肤统一白平衡与饱和度，避免一张冷一张暖。赵露思套偏暖（+0.05 温度），三上悠亚套偏冷（−0.06）。

## 5. 主题挂载点（写皮肤代码时用）

```css
body[data-dsh-<skin>] {
  /* 背景与层级 */
  --dsw-alias-bg-base: transparent;
  --dsw-alias-bg-layer-1: <surface/85%>;
  --dsw-alias-bg-layer-2: <surface2/85%>;
  --dsw-alias-bg-layer-3: <surface3/88%>;
  --dsw-alias-bg-overlay: <surface/96%>;
  /* 文本 */
  --dsw-alias-label-primary: <text>;
  --dsw-alias-label-secondary: <textSoft>;
  --dsw-alias-label-tertiary: <textSoft>;
  /* 品牌色 */
  --dsw-alias-brand-primary: <accent>;
  --dsw-alias-button-primary-fill: <accent>;
  --dsw-alias-state-business-primary: <accent>;
  /* 边框与阴影 */
  --dsw-alias-border-l1: <accent/18%>;
  --dsw-alias-border-l2: <accent/30%>;
  --dsw-alias-border-l3: <accent/64%>;
  --dsw-specific-sidebar-fill: <sidebarFill>;
  --dsw-shadow-lv2: 0 18px 54px <ink/20%>, 0 2px 8px <ink/12%>;
}
```

已装皮肤用过的图片载体（`data-skin-chrome` 值）：

| 载体 | 用途 | 对应槽位 |
|---|---|---|
| `character-stage` | 对话区内的整层背景 + 立绘 | `bg-chat-*`、`sidebar-character` |
| `sidebar-mascot` | 侧栏人物 | `sidebar-character` |
| `titlebar-brand` | 标题栏品牌位 | `wordmark.png` |
| `top-trim` / `bottom-trim` | 顶/底装饰 | `ribbon-wide`、`ribbon-strip` |
| `composer-lace` | 输入框外框装饰 | `ribbon-strip` |

## 6. 交付契约（搬进皮肤包时）

1. 把 `skin-assets/<subject>/*.webp|png` 改名为 `<sha256>.<ext>`（对文件字节做 sha256），放进 `assets/runtime/`。
2. 生成 `assets/runtime/manifest.json`：一个文件名数组，作为服务端白名单。
3. `lib/index.js` 复用已装皮肤同一套模式：只接受 `GET/HEAD`、校验 64 位十六进制文件名、`Cache-Control: public, max-age=31536000, immutable`、支持 `If-None-Match` 返回 304。
4. `skin.json` 里声明 `preview.light/dark`、`desktopIcon`、`accent`、`bodyAttr`、`wiring.id`。

素材包里的 `skin-assets/` 用的是可读文件名，方便你替换与预览；搬包时再哈希改名。
