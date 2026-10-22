# 三上悠亚套 · 设计蓝图（象牙黑金）

## 1. 概念

与赵露思套相反的方向：象牙白做面、墨黑做底、酒红只做一次强调。整体压暗、降饱和，接近胶片冷调；人物以黑裙、逆光和室内暖灯为主，避免婚纱那种过白过甜的调子。

## 2. 色彩

强调色为设计指定（`accentSource: design-override`）；聚类色来自 65 张精选图（v2 重筛），明显偏暖褐（象牙系）加一点钢蓝，正是这套「象牙 + 黑金」的取色依据。

| 角色 | 色值 | 说明 |
|---|---|---|
| 主强调 accent | `#8f2436` | 酒红，按钮/气泡/选中态 |
| accent hover | `#7a1d2d` | accent 压暗 |
| 象牙 | `#d4c0b3` | 聚类色，次级文字与分割线 |
| 暖褐 | `#997d6a` | 聚类色，时间戳、标签 |
| 钢蓝 | `#616e76` | 聚类色，冷调点缀（图标描边等） |
| 墨黑 | `#181112` | 深色底 |

浅色主题：

| token | 值 |
|---|---|
| `--dsw-alias-bg-layer-1` | `#f4dee1` @ 90% |
| `--dsw-alias-bg-layer-2` | `#ecd2d6` @ 88% |
| `--dsw-alias-label-primary` | `#29181b` |
| `--dsw-alias-label-secondary` | `#664e52` |
| `--dsw-alias-border-l1` | `#8f2436` @ 18% |
| `--dsw-alias-border-l3` | `#8f2436` @ 56% |
| `--dsw-specific-sidebar-fill` | `#f4dee1` @ 88% |
| `--dsw-shadow-lv2` | `0 18px 54px #29181b26, 0 2px 8px #29181b1a` |

深色主题（这套的主场）：

| token | 值 |
|---|---|
| `--dsw-alias-bg-base` | `transparent` |
| `--dsw-alias-bg-layer-1` | `#251b1d` @ 92% |
| `--dsw-alias-bg-layer-2` | `#34292b` @ 90% |
| `--dsw-alias-bg-layer-3` | `#3f3234` @ 92% |
| `--dsw-alias-label-primary` | `#f5e6e9` |
| `--dsw-alias-label-secondary` | `#b8a5a8` |
| `--dsw-specific-sidebar-fill` | `#181112` @ 90% |

## 3. 字体与形态

- 与赵露思套同一套字体栈，但标题字重降到 600、字距 0；避免可爱感。
- 圆角比另一套更小：卡片 14px、气泡 12px、输入框 20px，整体更硬朗。
- 装饰线用 1px 酒红，不用渐变。

## 4. 槽位选图与理由

| 槽位 | 用图 | 理由 |
|---|---|---|
| `bg-chat-light` | 白纱礼服（2508×1672） | 象牙白低细节柔光，正文压上去仍然清楚 |
| `bg-chat-dark` | 红花特写（1920×1080） | 大面积酒红 + 暗部，压暗后与 accent 同气 |
| `bg-ambient-blur` | 白纱礼服（2508×1672） | 只取象牙色调，模糊 22px 后当长文本衬底 |
| `hero-portrait` | 黑色露肩坐姿（1930×2576） | 竖幅、黑裙压住画面，与象牙底色对比强烈 |
| `sidebar-character` | 白色毛绒上衣（2400×2912） | 1:2 裁切后脸与上身完整，背景干净 |
| `card-photo` | 白纱伏卧（2112×2112） | 近方形构图，适合 820×750 照片卡 |
| `ribbon-wide` | 白纱礼服横图（2508×1672，blur 8） | 横向、留白多，只取纱的柔光 |
| `ribbon-strip` | 粉纱特写（2731×4096，blur 18） | 极窄条只做柔粉色带 |
| `wordmark-light/dark` | 文字渲染 | 深/浅两版字色，下方酒红短线 |
| 图标全链 | 同一张正脸特写（3600×4796） | 桌面图标、标签页、插件图标保持同一张脸 |
| `preview-light/dark` | mock 合成 | 对应皮肤管理卡片裁切比例 |

## 5. Carrier 落位

与赵露思套一致：`character-stage` 铺底、`sidebar-mascot` 竖条、`titlebar-brand` 字标、`top-trim`/`bottom-trim` 装饰带、`composer-lace` 细线。

## 6. `skin.json` 草案

```json
{
  "id": "ivory-noir",
  "name": "象牙黑金",
  "nameEn": "Ivory Noir",
  "author": "your-name",
  "tagline": "象牙黑金、冷调胶片",
  "taglineEn": "Ivory, black and a film-grain chill",
  "description": "以三上悠亚写真为素材的暗调皮肤：象牙表面、酒红强调、黑裙竖幅主视觉与同脸系图标。",
  "tags": ["portrait", "ivory", "noir", "film", "dark"],
  "accent": "#8f2436",
  "bodyAttr": "data-dsh-ivory-noir",
  "dshCompatibility": "0.2.1rc2",
  "package": "dsh-client-ui-skin-ivory-noir",
  "wiring": { "id": "ui-skin-ivory-noir", "bundleWired": false },
  "preview": { "light": "preview/preview-light.webp", "dark": "preview/preview-dark.webp" },
  "desktopIcon": "assets/icons/ivory-noir.ico",
  "order": 31
}
```

## 7. 素材边界说明

- 采集时前置拦截了成人聚合站（`v2ph.com`、`555665.xyz`、`img.jdlingyu.com` 等），因此**泳装/内衣类可用素材很少**：上一轮 `glam/`（已归档到 `_v1/glam/`）不过 17 张，实际是露肩、吊带、紧身造型与制服向，不是泳装。这是过滤的必然结果，不是漏采。
- 素材仅限个人本地使用，不二次分发；真人不做合成、不做丑化。
