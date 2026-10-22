# DSH 皮肤素材包 · 赵露思 / 三上悠亚

为 DeepSeek Harness Web GUI 做的两套写真主题素材，尺寸与格式**按本机已装皮肤逆推**。

**已出成品皮肤插件并装进 `desktop` profile**：`dsh-client-ui-skin-rosy-cream`（雾粉奶油光）与
`dsh-client-ui-skin-ivory-noir`（象牙黑金），可在「设置 → 皮肤管理」里与 maid-atelier / orca-link 互斥切换，
当前激活的是雾粉奶油光。包结构、构建、安装/切换/卸载、可调设置与验证证据见
[docs/skin-plugins.md](docs/skin-plugins.md)。

**当前是 v2（2026-10-21 重筛）**：上一轮的 curated/skipped 取舍不作数——把两套合计 336 张候选全部重新看了一遍，按自己的审美重选，并把底部带文字水印的图统一切除干净。上一轮结果整体归档在 `_v1/`。

## 这轮（v2）做了什么

- **重筛**：138 张赵露思 + 198 张三上悠亚候选全部重看，不看 v1 的 curated/glam/rejected 名单。新精选 **62 / 65 张**，槽位用图也全部重挑。
- **切水印**：42 张精选图的底部有转载文字/logo（搜狐号、微博、知乎、モデルプレス、bilibili、视觉中国、madame FIGARO、GRAPHIS 等），从源图底部切除 **6%–14%**，文件名带 `__wmcut`；切除前后有 42 组对照图。
- **修旧 bug**：`spec/selection-*.json` 里的 `focus` 之前根本没生效（渲染函数一直吃 slot 默认值）；深色预览卡也一直误用浅色背景。两处都已修好，现在每张图的取景锚点是真的。
- 采集台账 / 去重 / 拼版 / 校验脚本沿用，重挑只动筛选与取景。

## 现在有什么

| | 赵露思套「雾粉奶油光」 | 三上悠亚套「象牙黑金」 |
|---|---|---|
| 精选图 `curated/` | 62 张 | 65 张 |
| 其中切过底部水印 | 24 张 | 18 张 |
| 成品槽位 `skin-assets/` | 17 个文件 | 17 个文件 |
| 主强调色 | `#c9858c` 樱粉 | `#8f2436` 酒红 |
| 主视觉 | 粉纱礼服竖幅 | 黑裙坐姿竖幅 |

两套槽位全部通过 `scripts/verify_assets.py`：像素尺寸精确、格式正确、体积在上限内。

## 目录

```
lusiskin/
├─ skin-assets/<lusi|yua>/      17 个槽位成品（v2，可直接用）
├─ curated/<lusi|yua>/          v2 精选原图（62 / 65，含 __wmcut 已切水印版）
├─ preview/<lusi|yua>/          槽位总览 slot-overview、v2 精选拼版 sheet-curated-*、原始候选拼版 sheet-raw-*
├─ preview/v2/                  水印切除前后对照 watermark-before-after-*、v1↔v2 槽位对比 compare-v1-v2-*、底部水印核查 wmcheck-*
├─ packages/                    两个皮肤插件成品（dsh-client-ui-skin-rosy-cream / ivory-noir，已安装）
├─ skin-src/                    皮肤插件模板：lib/client.js.tmpl、lib/index.js.tmpl
├─ docs/                        皮肤插件说明 skin-plugins.md
├─ spec/                        槽位规格 slots.json、配色 palette-*.json、v2 选图 picks-v2.json + selection-*.json、设计与规格文档、出包配置 skins-package.json
├─ sources/                     采集台账 sources.csv、候选目录 catalog-v2.json、manifest-curated-*、manifest-slots-*
├─ scripts/                     采集 / 去重 / 拼版 / 加工 / 校验 / v2 筛选脚本、出包脚本 build_skin_packages.py
├─ _v1/                         上一轮结果归档：旧 curated/glam/rejected、旧 skin-assets、旧 spec
├─ raw/                         采集缓冲（重跑时用）
├─ inbound/                     你手动存的图丢这里
└─ ref/bp.jpg                   你给的参考图（只作风格参照）
```

## 槽位（两套通用，尺寸已实测对齐）

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `bg-chat-light.webp` / `bg-chat-dark.webp` | 1720×1080 | 对话区背景（浅/深） |
| `bg-ambient-blur.webp` | 1586×992 | 强模糊衬底，长文本底下不抢字 |
| `hero-portrait.webp` | 1152×2048 | 着陆页主视觉竖幅 |
| `sidebar-character.webp` | 627×1254 | 侧栏人物竖条 |
| `card-photo.webp` | 820×750 | 照片卡/插画位 |
| `ribbon-wide.webp` / `ribbon-strip.webp` | 1800×588 / 2172×320 | 顶部与输入框装饰带 |
| `wordmark-light.png` / `wordmark-dark.png` | 360×76 | 标题栏字标（透明底） |
| `avatar-512/192.webp`、`favicon-128/32.png`、`desktop-icon.ico` | 同链 | 插件图标、标签页、Windows 快捷方式 |
| `preview-light/dark.webp` | 1920×1035 | 皮肤管理预览卡 |

细节见 [spec/asset-spec.md](spec/asset-spec.md)，其中记录了从已装皮肤 `maid-atelier` 与 `orca-link` 实测到的原始尺寸依据。

## v2 槽位用图

赵露思套：

| 槽位 | 用图 | 说明 |
|---|---|---|
| `bg-chat-light` | 银灰礼服侧身（2880×1800） | 人物偏右、左侧帘幕柔光大面积留白 |
| `bg-chat-dark` | 舞台侧光黑裙（5000×3335） | 暗场 + 单侧冷光，压暗后仍保留轮廓 |
| `bg-ambient-blur` | 花丛逆光（2775×4162） | 模糊 22px 只留粉绿光斑 |
| `hero-portrait` | 粉纱礼服（2392×3586） | 主题色本身就是樱粉 |
| `sidebar-character` | 白纱露肩回眸（2000×3000） | 脸在黄金位置，身形完整 |
| `card-photo` | 影棚青绿半身（2000×2666，切底 7%） | 近景脸部 + 干净纯色背景 |
| `ribbon-wide` | 粉纱褶皱（2392×3586，blur 8） | 只取纱的纹理 |
| `ribbon-strip` | 亮片裙细节（2775×4160，blur 18） | 极窄条只做亮片色带 |
| 图标全链 | 干净正脸（1680×1920） | 头像/标签页/桌面图标同一张脸 |

三上悠亚套：

| 槽位 | 用图 | 说明 |
|---|---|---|
| `bg-chat-light` | 白纱礼服（2508×1672） | 象牙白低细节柔光 |
| `bg-chat-dark` | 红花特写（1920×1080） | 酒红 + 暗部，直接呼应 accent |
| `bg-ambient-blur` | 白纱礼服（2508×1672） | 只取象牙色调，模糊 22px |
| `hero-portrait` | 黑裙坐姿（1930×2576，切底 7%） | 黑裙压住画面，与象牙底对比强 |
| `sidebar-character` | 白色毛绒上衣（2400×2912，切底 7%） | 脸与上身完整，背景干净 |
| `card-photo` | 白纱伏卧（2112×2112） | 近方形构图 |
| `ribbon-wide` | 白纱礼服横图（2508×1672，blur 8） | 横向留白多，只取纱的柔光 |
| `ribbon-strip` | 粉纱特写（2731×4096，blur 18） | 极窄条只做柔粉色带 |
| 图标全链 | 正脸特写（3600×4796，切底 7%） | 同脸系图标 |

## 水印切除规则

- **判定**：源图底部出现半透明文字或站点 logo（搜狐号@…、微博@…、知乎@…、モデルプレス、bilibili、视觉中国、madame FIGARO、GRAPHIS…）。
- **处理**：按水印高度切掉画面底部 6%–14%，不重绘、不涂抹、不多切；文件名加 `__wmcut`。42 组切除前后对照在 `preview/v2/watermark-before-after-<subject>-*.jpg`。
- **记录**：每张的切幅写在 `sources/manifest-curated-<subject>.csv` 的 `watermark_crop_pct`；槽位用图对应关系写在 `sources/manifest-slots-<subject>.csv`。
- **复核**：`preview/v2/wmcheck-*.jpg` 是切除后文件底部 10% 的特写抽查。

## 怎么用

**换某一张图**：改 `spec/selection-<subject>.json` 里对应槽位的 `source`（相对路径）与 `focus`（裁切锚点 0–1），然后

```powershell
python scripts/process_assets.py --subject lusi
python scripts/verify_assets.py --subject lusi
```

**改筛选/重挑**：先改 `spec/picks-v2.json`（`curated` 是拼版序号，`watermark_crop` 是要切的底边比例），再

```powershell
python scripts/build_curated_v2.py     # 重建 curated/（会清掉旧文件，注意）
python scripts/make_selection_v2.py    # 按槽位表重写 selection-*.json
python scripts/process_assets.py --subject lusi
```

**重新采集**（需要走代理；会重建 curated/glam/rejected）：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:NODE_USE_ENV_PROXY="1"
node scripts/fetch_images.mjs --subject=lusi --engines=bing --pages=2 --max-per-query=40
python scripts/dedupe.py --subject lusi --tier raw
python scripts/contact_sheet.py --subject lusi --tier raw --cols 4 --cell 300 --per-sheet 20
# 看图后把序号写进 spec/picks-lusi.json，再
python scripts/apply_picks.py --subject lusi
```

**重新出包（改完选图/配色后）**：

```powershell
python scripts/build_skin_packages.py --check
# 已装包是 link 到 packages/ 的；替换 JS 后需重启 DSH 才加载新模块代
```

模板与配置在 `skin-src/`、`spec/skins-package.json`；安装、切换、卸载与可调设置见
[docs/skin-plugins.md](docs/skin-plugins.md)。

## 和上一轮（v1）的区别

- 两套 17 个槽位里，`bg-chat-dark`、`hero-portrait`、`card-photo`、`ribbon-wide`、`ribbon-strip` 都换了图或取景；横向对比见 `preview/v2/compare-v1-v2-<subject>.jpg`。
- v1 的旧产物（旧 skin-assets、旧 curated/glam/rejected、旧 selection/palette/picks）在 `_v1/`，随时可回滚。
- 旧精选里那些"杂志封面/大字标题/底部 logo"的图，这轮大多重新纳入候选，改走切底水印的方案留下来。

## 采集链路（实测出来的）

- **主源**：Bing 图片搜索。必须带 `form=IRFLTR` + `Referer: https://cn.bing.com/images` + `mkt=zh-CN`，否则返回空页；分页用 `first`。
- **备用**：DuckDuckGo 图片 API 走本机代理 `127.0.0.1:7897`，单次 100 条带原始尺寸。但连续请求会被判定 botnet（202/403）。
- **代理**：Clash 系在 7897，Node 24 用 `NODE_USE_ENV_PROXY=1` 即可让 `fetch` 走代理。
- **下载**：统一用 Node `fetch`；`curl` 与 `.NET` 在本机被沙箱凭证限制，不可用。
- **去重**：sha256 + 64 位 dHash（汉明距离 ≤6）。

**为什么没有 Google / Instagram / Pixiv**：三个都实测过——Google 对无 JS 客户端一律返回 enablejs 空壳（桌面/移动 UA 都一样），无头 Chrome 被沙箱策略拒绝启动；Instagram 是登录墙；Pixiv 返回 Cloudflare 503。想补这三处的图，只能浏览器手动存图丢进 `inbound/`，管线会一样处理。

## 素材边界

- 排除：裸露、性行为、AV 截图与封面、透视走光、身体局部特写、AI 换脸、疑似未成年。
- 采集前按 `scripts/blocklist.txt` 拦掉成人聚合站，采集后逐张人工过目（198 张三上悠亚素材里只混进 2 张误抓的男性照片，已剔除）。
- 三上悠亚套的泳装/内衣素材之所以少，正是因为上述拦截：过滤掉成人站后，剩下能用的就是露肩、吊带、紧身造型与制服向。这是过滤的代价，不是漏采。

## 许可与使用

素材来自公开写真、活动与杂志图，**仅限个人本地使用**，请勿二次分发或上架。真人不做合成、不做丑化。若要把皮肤分享给别人，必须换成你有权使用的素材——两套皮肤的代码与配色方案本身可以复用，图不行。

每张精选图的来源 URL 在 `sources/manifest-curated-<subject>.csv`，每个成品槽位对应哪张精选图在 `sources/manifest-slots-<subject>.csv`，完整采集记录（含引擎、关键词、真实分辨率）在 `sources/sources.csv`。
