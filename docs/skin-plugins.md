# DSH 皮肤插件：雾粉奶油光 / 象牙黑金

两套可安装的 DeepSeek Harness Web GUI 皮肤插件。结构、素材路由、`skin.json` 契约与已装的
`@smalltailqwq/dsh-client-ui-skin-maid-atelier` / `orca-link` 一致，可被
`@smalltailqwq/dsh-client-ui-skin-deep-whale-manager`（设置 → 皮肤管理）发现、互斥切换，
并接入它的 v2 自定义设置协议。

| | 赵露思套 | 三上悠亚套 |
|---|---|---|
| 显示名 | 雾粉奶油光 · Rosy Cream | 象牙黑金 · Ivory Noir |
| 包名 | `dsh-client-ui-skin-rosy-cream` | `dsh-client-ui-skin-ivory-noir` |
| `skin.json` id | `rosy-cream` | `ivory-noir` |
| 作用域属性 | `data-dsh-rosy-cream` | `data-dsh-ivory-noir` |
| loader 行 id | `ui-skin-rosy-cream` | `ui-skin-ivory-noir` |
| 强调色 | `#c9858c` 樱粉 | `#8f2436` 酒红 |
| 主视觉位 | 体左侧（照片卡在右下） | 体右侧（照片卡在左下） |
| 排序 | 30 | 31 |

当前状态：两个包都已安装进 `desktop` profile，皮肤管理器已发现 4 套皮肤，**雾粉奶油光已激活**。

## 1. 包结构（与现有皮肤同构）

```
packages/dsh-client-ui-skin-rosy-cream/
├─ package.json          dsh.bundle.patch + dsh.client(platform=web, inject=layout) + ./client + ./skin.json
├─ cordis.patch.yml      insert 行：id=ui-skin-rosy-cream, name=<包名>
├─ skin.json             管理器发现的元数据（id/name/package/wiring/bodyAttr/preview/desktopIcon/accent/order）
├─ skin.build.json       指纹（与管理器 computeSkinFingerprint 算法逐字节一致）
├─ lib/index.js          Host 半：/skin-assets/rosy-cream/<sha256>.(webp|png) 白名单路由
├─ lib/client.js         浏览器半：ModuleLoader bundle，负责 CSS/DOM/观察器/favicon/设置协议
├─ assets/runtime/       14 个内容寻址素材 + manifest.json 白名单
├─ assets/icons/*.ico    Windows 快捷方式图标（manager 桌面图标同步用）
├─ assets/plugin-icon.webp  插件清单图标（同脸系）
├─ preview/light.webp, dark.webp  皮肤预览卡
├─ locale/zh.json, en.json  插件清单标题/描述
├─ LICENSE               MIT（代码）+ 素材仅限个人本地使用
└─ README.md
```

素材文件名是**内容 sha256**；`assets/runtime/manifest.json` 是 Host 路由的唯一白名单，客户端只能拿
`/skin-assets/<id>/<64位hex>.<webp|png>` 的图。素材不内嵌进 JS，也不访问任何远程 URL。

## 2. 构建

唯一配置源：`spec/skins-package.json`（元数据、两套亮/暗 token、强调色、圆角、默认设置）。
模板：`skin-src/index.js.tmpl`、`skin-src/client.js.tmpl`。

```powershell
python scripts/build_skin_packages.py --check
node scripts/verify_skin_plugins.mjs packages\dsh-client-ui-skin-rosy-cream packages\dsh-client-ui-skin-ivory-noir
```

`verify_skin_plugins.mjs` 是独立静态校验器（60 KB，零依赖，可直接指向 profile `node_modules` 里的安装副本）：
逐项校验 package/skin.json/patch/素材哈希/路由/客户端语法/ModuleLoader id/locale/指纹，PASS/WARN/FAIL
汇总，失败退出码 1；对已装参考皮肤 maid-atelier / orca-link 同样通过。

它做这些事：

1. 从 `skin-assets/<subject>/` 读 17 个槽位成品，按内容 sha256 改名写入 `assets/runtime/` 并生成 manifest；
2. 复制桌面图标、预览图、插件图标，生成 `skin.json` / `package.json` / `cordis.patch.yml` / locale / LICENSE / README；
3. 把 `lib/index.js`（Host 路由）与 `lib/client.js`（浏览器半，注入该皮肤的 CONFIG）写出来；
4. 最后按管理器同款算法算 `skin.build.json` 指纹（LF 归一化、`path\0byteLength\0content` 折叠、素材按名排序后再折叠）；
5. `--check` 会复算每个素材哈希与最终指纹。

改皮肤：改配置 → 重建 → 重装。**替换已安装包后需要重启 DSH 才会加载新的 JS 模块代**（新增安装可以走 HMR）。

## 3. 安装 / 切换 / 卸载

当前 profile 里已经装好（`plugin_manager install_bundle`，本地目录以 `link:` 方式写入 `package.json`）。
手工安装等价命令：

```powershell
# 在任意工作目录
dsh plugin --profile desktop add C:\Users\Shinji\Desktop\lusiskin\packages\dsh-client-ui-skin-rosy-cream
dsh plugin --profile desktop add C:\Users\Shinji\Desktop\lusiskin\packages\dsh-client-ui-skin-ivory-noir
```

切换有两种方式：

- GUI：设置 → 皮肤管理 → 点对应皮肤卡片。
- 本地接口（管理器自己注册的同源路由）：

```powershell
$h = @{ 'Content-Type' = 'application/json' }
Invoke-WebRequest http://127.0.0.1:54047/api/dsh/skins -Method POST -Headers $h -Body '{"target":"rosy-cream"}' -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:54047/api/dsh/skins -Method POST -Headers $h -Body '{"target":"official"}' -UseBasicParsing
```

管理器把互斥状态写进 `~/.dsh/profiles/desktop/cordis.patch.yml` 与 `~/.dsh/cordis.patch.yml` 的
`# --- dsh-skin managed ---` 区段（同一秒级原子写两处）；区段外 YAML 不动。皮肤之间互斥：同一时刻只有一套
`ui-skin-*` 行 `disabled: false`。

卸载顺序（避免留下指向不存在插件的行）：

1. 切回 `official`；
2. `plugin_manager remove_bundle` 移除包；
3. 再 POST 一次 `{"target":"official"}`——管理器按“当前已装皮肤目录”重建 managed 区段，自动清掉已卸载皮肤的行。

## 4. 皮肤自定义设置（皮肤管理页内）

浏览器半内联了管理器的 v2 协议（事件 `dsh:skin-customization-register-v2` 等），无需依赖管理器包：

| key | 类型 | 默认 | 作用 |
|---|---|---|---|
| `artwork` | boolean | true | 显示/隐藏人物立绘、照片卡、侧栏人物与 hero 头像标 |
| `accent` | color | 各自强调色 | 按钮、描边、选中态强调色 |
| `dim` | range 0–80 % | 18 / 26 | 背景压暗，长对话可拉到 20–40% |
| `wordmark` | boolean | true | 标题栏字标 |
| `sfwMode` | visibility-schedule | 关闭 | “不那么二次元模式”：按本机时间隐藏人物立绘 |

设置值由管理器按 `skinId` 存进浏览器 `localStorage`，不写 DSH 配置、不发模型请求。`apply(state)` 为
`null` 时恢复本皮肤拥有的全部 DOM/CSS 状态（幂等），管理器切换/卸载时调用。

## 5. 浏览器半做了什么（lib/client.js）

- 设置 `body[data-dsh-rosy-cream]`（对应 `bodyAttr`），只在该作用域内覆盖 DSH alias token；
- 亮/暗两套 token（`data-ds-dark-theme` 自动切换），包括背景层、边框、文本、品牌色、侧栏底色、阴影；
- 对话列 `[class*="centerCol"]` 背景图 + 可读性渐变；侧栏人物、标题栏字标、顶部/底部装饰带；
- 着陆页（`[data-phase="hero"]`）显示竖幅主视觉 + 照片卡；聊天态自动隐藏；设置/插件等无对话 phase 的
  面板页只保留配色与背景，不挂人物（`data-skin-phase="inactive"`）；
- 在 `conversation.hero.brand.mark` 槽注册头像+字标（也作为“客户端半已加载”的可观测证据）；
- 替换 favicon（32/128 + apple-touch-icon），卸载时还原宿主图标；
- 所有 CSS/DOM/observer/favicon 写入都挂在 `ctx.effect` 上；切皮肤时管理器与 Loader 会同步回收。

## 6. 验证证据（2026-10-21，运行中的 0.2.1-rc2）

| 检查 | 结果 |
|---|---|
| 管理器目录发现 | `GET /api/dsh/skins` → 4 套，含 `rosy-cream` / `ivory-noir`，`dshCompatibility=0.2.1rc2` |
| 素材路由 | `/skin-assets/rosy-cream/<sha>.webp` → 200 `image/webp` + immutable；非法名 404 |
| 互斥切换 | 切 `ivory-noir` 后 ivory 路由 200、rosy 路由 404；切回后相反 |
| 客户端半加载 | Client Inspector `conversation.hero.brand.mark` 占用者为 `rosy-cream-hero-brand`（active），切官方后占用者清空 |
| 管理器指纹 | `computeSkinFingerprint` 与 `skin.build.json` 两个包均 `match: true` |
| 桌面图标 | `~/.dsh/skin-manager/desktop-icons/rosy-cream-*.ico` 已同步，桌面+开始菜单快捷方式 IconLocation 指向该 ICO |
| 像素级外观 | **未验证**：无浏览器控制/截图通道，深色模式、字体与裁切需你在设置页切换后目视确认 |

## 7. 已知边界- 皮肤是纯展示层，不注册服务、不发事件、不触达模型请求。
- 侧栏/对话列/标题栏用 DSH 的 `class*="centerCol|sidebarCol|titlebar"` 与 `data-phase`、`data-composer-card` 等稳定前缀/数据属性；
  DSH 若改这些约定，皮肤需要跟着改（与现有 maid/orca 皮肤同一套依赖）。
- `dshCompatibility` 固定为 `0.2.1rc2`；换 DSH 版本后管理器会提示版本不匹配，需要确认放行或更新声明。
- 素材为公开写真/活动图，**仅限个人本地使用**，不要二次分发或上架；真人不做合成、不丑化。
  代码 MIT 可复用，图片不可。

## 8. v1.1 视觉调整（2026-10-21 实机截图反馈）

- **主视觉不再是直角照片块**：改成羽化软焦层——径向 mask 四边渐隐、主题色径向调和（`::after`）、
  降饱和（0.86）并压一点对比，让它像背景照片的一部分而不是贴上去的图。
- **主视觉换边**：赵露思两套的背景人物都在右侧（左侧是空帘幕），主视觉挪到**左**；三上悠亚浅色背景
  人物在中左、深色是居中大特写（两侧是红花），主视觉挪到**右**。照片卡自动落到另一侧。
- **缩放跟随窗口**：主视觉尺寸改成对话列宽度的百分比（`clamp(300px, 38%, 1100px)` × 100% 高）+
  `background-size: cover`，和背景图同一套缩放逻辑，不再用固定 780px 高度；照片卡也改成百分比宽度。
- **中央柔光**：着陆页在标题/工作区/输入框区域叠了一层主题色径向柔光，人物背景上文字也有对比。
- **可读性参数**：两套背景 scrim 提高（亮 0.22 / 暗 0.30–0.36），卡片/输入框/侧栏表面 alpha 上调，
  次级/三级文字加深，输入框强调描边 26% → 34%；设置页/插件页不再挂人物。
- 重建后指纹：rosy-cream `30a433d7…`、ivory-noir `8d53632b…`，静态校验 122 PASS / 0 FAIL。
- 像素级仍需目视确认（本环境无截图通道）；已装包是 link，刷新页面或重启 DSH 后生效。
