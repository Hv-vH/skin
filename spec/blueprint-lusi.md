# 赵露思套 · 设计蓝图（雾粉奶油光）

## 1. 概念

以「奶油雾粉」为底的低对比暖调皮肤：白纱与晨光是主视觉，樱粉只用在线条与状态色上，避免整屏发甜。人物出现在三个位置——着陆页竖幅、侧栏竖条、头像——其余区域交给柔焦背景，保证正文长时间可读。

## 2. 色彩

强调色是设计指定（`accentSource: design-override`），并非直接取色；下方聚类是同一批精选图里 K-means 得到的实际色分布，作为辅色依据。

| 角色 | 色值 | 说明 |
|---|---|---|
| 主强调 accent | `#c9858c` | 樱粉，用于按钮、气泡、选中态、装饰线 |
| 主强调 hover | `#b0707a` | accent 压暗 10% |
| 辅助 ink | `#163456` | 从精选图聚类里取到的墨蓝，用于标题与高对比强调 |
| 暖褐 | `#ac8067` | 聚类色，用于次级标签/时间戳 |
| 雾白 | `#dbd8d8` | 聚类色，用于浅色分隔线 |

浅色主题表面：

| token | 值 |
|---|---|
| `--dsw-alias-bg-base` | `transparent`（让背景图透出） |
| `--dsw-alias-bg-layer-1` | `#f4dee0` @ 90% |
| `--dsw-alias-bg-layer-2` | `#ecd2d5` @ 88% |
| `--dsw-alias-bg-layer-3` | `#e5c7ca` @ 90% |
| `--dsw-alias-bg-overlay` | `#f9e0e2` @ 96% |
| `--dsw-alias-label-primary` | `#291819` |
| `--dsw-alias-label-secondary` | `#664e50` |
| `--dsw-alias-border-l1` | `#c9858c` @ 18% |
| `--dsw-alias-border-l2` | `#c9858c` @ 32% |
| `--dsw-alias-border-l3` | `#c9858c` @ 60% |
| `--dsw-specific-sidebar-fill` | `#f4dee0` @ 88% |
| `--dsw-shadow-lv2` | `0 18px 54px #29181926, 0 2px 8px #2918191a` |

深色主题表面：

| token | 值 |
|---|---|
| `--dsw-alias-bg-layer-1` | `#251b1c` @ 92% |
| `--dsw-alias-bg-layer-2` | `#34292a` @ 90% |
| `--dsw-alias-label-primary` | `#f5e6e8` |
| `--dsw-alias-label-secondary` | `#b8a5a7` |
| `--dsw-specific-sidebar-fill` | `#181112` @ 90% |

## 3. 字体与形态

- 标题：系统无衬线（`-apple-system, "Segoe UI", "Microsoft YaHei"`），字重 600，字距 -0.01em。
- 正文：同上，字重 400；行高 1.7。
- 圆角：卡片 16–22px，气泡 16px，输入框 24px（与预览 mock 一致）。
- 边框：一律 1px，透明度低；靠柔和阴影而不是硬边框分层。

## 4. 槽位选图与理由

| 槽位 | 用图 | 理由 |
|---|---|---|
| `bg-chat-light` | 银灰礼服侧身（2880×1800） | 人物偏右，左侧帘幕柔光大面积留白，正文压上去不抢字 |
| `bg-chat-dark` | 舞台侧光黑裙（5000×3335） | 大面积暗场 + 单侧冷光，压暗后仍保留轮廓 |
| `bg-ambient-blur` | 花丛逆光（2775×4162） | 只取粉绿光斑，模糊 22px 后当长文本衬底 |
| `hero-portrait` | 粉纱礼服（2392×3586） | 竖幅、粉纱占满画面，是「雾粉奶油光」本身 |
| `sidebar-character` | 白纱露肩回眸（2000×3000） | 1:2 裁切后脸在黄金位置，身形完整 |
| `card-photo` | 影棚青绿背景半身（2000×2666） | 近景脸部 + 干净纯色背景，适合 820×750 的照片卡 |
| `ribbon-wide` | 粉纱褶皱特写（2392×3586，blur 8） | 只取纱的纹理做装饰带，不见人脸 |
| `ribbon-strip` | 亮片裙细节（2775×4160，blur 18） | 极窄条只做亮片色带 |
| `wordmark-light/dark` | 文字渲染 | 深色字/浅色字各一版，下方樱粉短线 |
| `avatar-512/192`、`favicon-128/32`、`desktop-icon.ico` | 同一张特写 | 保证桌面图标、标签页、插件图标是同一张脸 |
| `preview-light/dark` | mock 合成 | 直接对应皮肤管理卡片的实际裁切比例；深色卡用 `bg-chat-dark` 打底 |

## 5. Carrier 落位

| carrier | 内容 |
|---|---|
| `character-stage` | `bg-chat-light` / `bg-chat-dark` 整层铺底，`sidebar-character` 贴在对话区左下 |
| `sidebar-mascot` | `sidebar-character` 等比缩放到侧栏宽度 |
| `titlebar-brand` | `wordmark-light/dark`，高度 38–46px |
| `top-trim` | `ribbon-wide`，横向拉伸并顶部裁切 |
| `bottom-trim` | `ribbon-strip`，只在输入框上方出现 12–20px |
| `composer-lace` | `ribbon-strip` 旋转或镜像，作为输入框描边装饰 |

## 6. `skin.json` 草案

```json
{
  "id": "rosy-cream",
  "name": "雾粉奶油光",
  "nameEn": "Rosy Cream",
  "author": "your-name",
  "tagline": "雾粉奶油光、樱粉饰线",
  "taglineEn": "Creamy rose light with sakura hairlines",
  "description": "以赵露思写真为素材的浅色暖调皮肤：白纱晨光背景、樱粉强调色、侧栏竖条人物与同脸系图标。",
  "tags": ["portrait", "rose", "cream", "soft", "light"],
  "accent": "#c9858c",
  "bodyAttr": "data-dsh-rosy-cream",
  "dshCompatibility": "0.2.1rc2",
  "package": "dsh-client-ui-skin-rosy-cream",
  "wiring": { "id": "ui-skin-rosy-cream", "bundleWired": false },
  "preview": { "light": "preview/preview-light.webp", "dark": "preview/preview-dark.webp" },
  "desktopIcon": "assets/icons/rosy-cream.ico",
  "order": 30
}
```

## 7. 使用注意

素材为公开写真/活动图，**仅限个人本地使用**，不要二次分发或上架。真人不做合成、不做丑化；若对外分享皮肤包，必须换成你有权使用的素材。
