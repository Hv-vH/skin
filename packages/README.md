# packages/

本目录由 `scripts/build_skin_packages.py` 生成，**不要手改**；改 `spec/skins-package.json` 或
`skin-src/*.tmpl` 后重新生成。

| 目录 | 皮肤 | 状态 |
|---|---|---|
| `dsh-client-ui-skin-rosy-cream/` | 赵露思套「雾粉奶油光 · Rosy Cream」 | 已装进 desktop profile，当前激活 |
| `dsh-client-ui-skin-ivory-noir/` | 三上悠亚套「象牙黑金 · Ivory Noir」 | 已装进 desktop profile |

每个包与已装皮肤 `@smalltailqwq/dsh-client-ui-skin-maid-atelier` 同构：`skin.json` + `cordis.patch.yml`
+ `lib/index.js`（素材路由）+ `lib/client.js`（ModuleLoader bundle）+ `assets/runtime/<sha256>.*` + 预览/图标/locale。

安装、切换、自定义设置、验证证据与卸载步骤见 [../docs/skin-plugins.md](../docs/skin-plugins.md)。
