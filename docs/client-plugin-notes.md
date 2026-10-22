# Skin client-plugin contract — notes + audit for rosy-cream / ivory-noir

Target: DSH 0.2.1-rc.2, desktop profile, Web GUI. Audience: the Lead authoring the bundles.
§0 is the verdict; §1–§9 give the contract with file:line evidence; §10 is the minimal skeleton.

Abbreviations (all `lib/client.js` unless noted):
- **ROSY / IVORY** = `C:\Users\Shinji\Desktop\lusiskin\packages\dsh-client-ui-skin-rosy-cream|ivory-noir\lib\client.js` (both 777 lines, byte-identical except loader `id` line 15 and `CONFIG` line 21 — `Compare-Object`).
- **MAID** = `C:\Users\Shinji\.dsh\profiles\desktop\node_modules\@smalltailqwq\dsh-client-ui-skin-maid-atelier\lib\client.js`; **ORCA** = `...orca-link\lib\client.js`; **MANAGER** = `...dsh-client-ui-skin-deep-whale-manager\lib\client.js` / `src\protocol.ts`.
- **MODS** = `C:\Users\Shinji\AppData\Local\Programs\DeepSeek Harness\resources\app\dsh\node_modules\@deepseek-ai\dsh-client-modules`; **LAYOUT/THEME/RENDERER/CONV** = sibling `@deepseek-ai\dsh-client-ui-*` packages; **RUNNER** = `@deepseek-ai\dsh-cordis-client-runner\lib\client.js`; **FE** = `@deepseek-ai\dsh-web-frontend\dist\assets\index-CN7NIWNw.js` (minified, cite by symbol).
- "host" = the running 0.2.1-rc.2 install; "bundle" = a skin's `lib/client.js`.

## 0. Audit verdict (rosy-cream / ivory-noir)

Checked against the reference skins and the 0.2.1-rc.2 host sources. Positive: loader/manifest shape, `inject:["slots"]`, slot key/props contract, `ctx.effect` teardown coverage, body-attr save/restore, CSS scoping + dark scoping, portal token scoping, asset route/hash manifest, v2 protocol events/settings types, package/skin.json/patch/profile wiring, UTF-8 locales. Defects/risks, ordered:

| # | Sev | Finding | Where | Fix |
|---|-----|---------|-------|-----|
| F1 | **med** | `.skin-sidebar-character` is `position:absolute; z-index:0` inside the sidebar root. Sidebar nav rows are in-flow siblings, and positioned z-index:0 paints **after** in-flow content, so the photo overlays nav text (0.42 opacity). MAID prevents this by lifting every non-chrome child: `[class*=sidebarCol]>div>:not([data-skin-chrome=sidebar-mascot],...){position:relative;z-index:2}` (CSS in MAID line 114 block, verified by substring). | ROSY 366–380 | add the same `>div>:not(.skin-sidebar-character){position:relative;z-index:2}` rule |
| F2 | **med** | Favicon replacement is not reference-counted. MAID/ORCA wrap `mountPageIcons` in a per-document `{users, restore}` installation (MAID 2181–2203, ORCA 2344–2424) because HMR/double activation otherwise treats the first activation's links as host links. ROSY overwrites unconditionally and `restore()` does not guard `node.isConnected` (544). | ROSY/IVORY 538–575 | copy the counted-install pattern |
| F3 | low | Artwork default is positive-selector (`[data-skin-artwork="on"]`, 336–346). If the manager unloads while the skin stays enabled it calls `apply(null)` (MANAGER 584, 599), attributes disappear and the portrait/card stay hidden. MAID uses `html:not([data-dsh-whale-maid-art=hidden])` (MAID 125). | ROSY/IVORY 75–97, 336–360 | use `:not([data-skin-artwork="off"])` selectors or re-assert defaults in `apply(null)` |
| F4 | low | Dead token `--dsw-alias-border-l1-darkmode-thin` in both CONFIGs. It exists nowhere in the running host: scan of 6,986 `app/dsh/**/*.{js,css}` files found 0 hits; the host defines only `--dsw-alias-border-l2-darkmode-thin` (`FE` CSS `index-BxpfOGf3.css`). Silently inert. | ROSY/IVORY 21 | delete or map to the l2 variant |
| F5 | low | `conversation.hero.brand.mark` occupant ignores owner props. The host renders the slot with `{size:34, className:fish}` (CONV 17766–17769) and the component drops both, so the host class is not applied. | ROSY/IVORY 673–680 | `({size, className}) => h("img",{className,width:size,height:size,...})` |
| F6 | low | No panel-page / foreign-root projection. MAID tracks official panel state (10–43) and detects a non-official root layout (2769–2772) to stop relying on the stage; the new bundles keep the full-bleed `body::before`, token overrides and phase observer on Settings/plugin panels and cannot detect a foreign root. | ROSY/IVORY 229–263, 690–770 | verify panel pages visually; add a `data-skin-panel-page` projection like MAID 10–43 if needed |
| F7 | low | No collapsed-sidebar handling: the portrait stays mounted in the ~52 px rail (media query only keys off viewport width, 523–533). The sidebar exposes `[data-sidebar-collapsed="true"]` (sidebar CSS, `html:has(...)` usage in LAYOUT). | ROSY/IVORY 363–383 | hide under `:has([data-sidebar-collapsed="true"])` |
| F8 | low | Body-attribute ownership is single-writer save/restore (704, 738–741). Two overlapping activations (HMR eviction + re-mount, or a future skin switch that does not serialize) can leave `data-dsh-…` on `<body>` or strip the other instance's scope. MAID uses a lease keyed by `(body,attribute)` (2632–2674). | ROSY/IVORY 696–704, 728–746 | reuse the lease pattern |
| F9 | info | `dsh.client.inject:["@deepseek-ai/dsh-client-ui-layout"]` is inherited from MAID/ORCA but unused: the factory only `require`s `react` and the runtime inject is `["slots"]`. Harmless module-graph edge; the layout service is never read (MAID reads `ctx.layout` and needs it, ROSY does not). | ROSY/IVORY `package.json` 20–22 | optional: drop; do **not** add conversation — `slots.inject` already waits for the declaration (RENDERER 1353–1367) |
| F10 | info | Style is created in `apply` (699–703), after module materialization, so the loader's `claimStyles` does not tag it (MODS lib/client.js 617–629); removal still works because it carries `data-plugin` (removeStyles 309–314). `releaseClaimedStyles` (576–582, 754) is a no-op today but mirrors MAID 2261–2285 — keep it. | ROSY/IVORY 576–582 | none |
| F11 | info | Dead config/CSS: `clipAngle` (184, declared never read), `CONFIG.accentHover`, `avatar512`, `trimMask`, `scrimMax`, `--skin-radius-bubble` (195). No runtime effect. | ROSY/IVORY 21, 184–195 | optional cleanup |
| F12 | info | `data-phase` can also be `"settling"` (CONV: `const phase = settling ? "settling" : hero ? "hero" : "active"`); `readPhase` maps everything not `active` to `hero` (651–654). That keeps the portrait during the hero→active transition — acceptable, just intentional. | ROSY/IVORY 651–654 | none |

Host-manifest consistency (both skins, verified): loader id == `package.json.name`; `skin.json.package` == package name; `id`/`bodyAttr` match CONFIG and CSS scope; `accent` matches CONFIG (`#c9858c` / `#8f2436`); `wiring.id` == the patch row id and the profile managed row id; `dshCompatibility:"0.2.1rc2"` as in MAID; `desktopIcon`/`icon`/preview files exist; locale JSON parses as UTF-8; asset refs = runtime manifest = files on disk = 14/14 in both packages (all 64-hex `.webp|.png`).

## 1. Bundle + `dsh.client` contract

- Browser artifact: `window.__ModuleLoader__.load({ id, factory })`, `factory(require) -> exports`; the loader materializes lazily, then the Cordis Loader creates the plugin from the returned exports (ROSY 14–19, 773–775; MAID 1–6, 3359–3361; MODS README "Lazy-CJS model"). `id` **must** equal the package name — the host composes the boot row as `graphRow(packageName, rev, meta)` from the resolved manifest package name (`MODS lib/index.js` 903, 737–745; README 38), and `<id>/client` aliases the bare id (MODS 90–101).
- `inject` on the exported object = **Cordis client services**; the fiber parks until each service exists: ROSY `["slots"]` (683); MAID `["layout"]` (2947); LAYOUT `["slots","theme","locale","shortcuts"]` (589–594); THEME `["slots","locale","remote","configForms"]` (2009–2014). `ctx.slots` is provided by RENDERER (`super(ctx,"slots")` 1305–1352; `ctx.provide` is how THEME provides `theme`, 2029).
- `package.json.dsh.client` = **module graph**, not services: `platform:"web"` is required (string), `inject`/`external` are optional string arrays (package-row ordering / non-baseline requires), `immediately` optional boolean (`MODS lib/index.js` 62–76). Both new packages declare `platform:"web"` + layout inject only (`package.json` 19–24).
- `immediately` is **not needed for skins**. It only marks a row for `prefetchImmediateTier()` (`FE`: `manifest.plugins.filter(e => e.immediately).map(e => modules.prefetch(...))`) — an early download, not ordering or activation; the graph emits the field only when true (`MODS lib/index.js` 402–410) and every row is still booted. MAID/ORCA omit it; ROSY/IVORY omit it — correct.
- Static style ownership: the loader tags untagged `<style>`s created during factory materialization with `data-plugin=<pkg>` and deletes every `style[data-plugin=<pkg>]` on eviction (`MODS lib/client.js` 309–314, 617–629). Bundle CSS should therefore carry `data-plugin` + a unique `data-plugin-css`, as ROSY does (699–703) and MAID does at factory time (116–133).
- The factory must be side-effect-light: reference bundles build strings/nodes in the factory closure and touch DOM only in `apply` (ui-plugin.md "keep factories free of side effects").

## 2. Body scope, CSS injection, teardown (the ROSY pattern is sound)

`ctx.effect(callback,label)` registers cleanup; the canonical skin pattern in ROSY 690–747:
1. save `originalAttribute`/`originalPhase`, create `<style data-plugin data-plugin-css>`, append to head;
2. `body.setAttribute(BODY_ATTR,"")` plus skin-owned data attrs (704–707);
3. rAF-coalesced `sync()` mounts carriers + projects phase (708–719);
4. `MutationObserver` on body: `childList+subtree+attributes` filter `["data-phase","data-slot","data-ds-dark-theme"]` (720–726);
5. cleanup: cancel rAF, disconnect, `style.remove()`, remove every carrier, restore saved attrs, remove skin-owned attrs/inline props (728–746).

MAID proves the same lifecycle at much larger scope: `ctx.effect` wrappers (2952–2969), one big disposer that deletes `body.dataset.dshMaidAtelier`, restores prior projected attrs and inline props, disconnects observers, removes nodes, restores title (2992–3033), then `body.dataset.dshMaidAtelier=""` is written inside the effect (3061), so the disposer retracts it. Follow that shape; prefer restoring only values you still own (attribute projector `MANAGER src/protocol.ts` 190–222; leases MAID 2632–2674).

## 3. Dark theme

`data-ds-dark-theme` is host-owned and authoritative: LAYOUT's `ThemePresenter` sets it from `snapshot.active.colorScheme` (`DARK_ATTRIBUTE` 505; apply 548–568; dispose 574–584), and built-in themes carry **no** token maps (`THEME` 1522–1530), so the attribute is the only stable signal. Use it in CSS: `body[data-dsh-x][data-ds-dark-theme]{…}` (ROSY 207–211, 218–221, 381–383, 442–447). Only observe the attribute if JS behavior needs it (MAID 3308/3345 toggles the palace art; ROSY includes it in the filter at 725 though CSS alone suffices — harmless). `ctx.theme.getTheme().active.colorScheme` (THEME 1693–1695, 1848–1860) is the JS alternative but needs `inject:["theme"]` — overkill for CSS-only skins. Recommendation for these skins: keep CSS-attribute scoping; do not add a theme service dependency.

## 4. Asset URLs

`new URL(\`skin-assets/${SKIN_ID}/${file}\`, document.baseURI).href` — ROSY 32; MAID 47–49 ("resolve against the host base, including reverse-proxy mounts"); ORCA 236. The host half registers the prefix route and serves only allow-listed 64-hex `.png|.webp` with `immutable` cache + ETag + 304 (ROSY/IVORY `lib/index.js` 4–50, route id 73). Do **not** import/base64 images into `client.js`: the loader serves prebuilt JS and uses mtime/size revisions (`MODS README` 76–78), image imports have no MIME/asset pipeline, and inlining bloats every reload. Verified for both new skins: 14 CONFIG refs == runtime manifest == files on disk, immutable names, assets hash-addressed by the generator.

## 5. DOM carriers

Selectors in ROSY/IVORY 644–667: conversation `[class*="centerCol"]`, sidebar `[class*="sidebarCol"]`, titlebar `[class*="titlebar"]`, scroll `[data-conversation-scroll]`, phase `[data-phase]`. They match the host: layout columns come from LAYOUT CSS (`.sidebarCol`, `.centerCol`, `.frame` position:relative, CSS line 73 region), and CONV renders `data-phase` on `ConversationRoot` (`hero|settling|active`, CONV 17599) with `[data-conversation-scroll]` inside it.

The slot mount is legitimate: `conversation.hero.brand.mark` is a `single`/`root` slot declared by CONV's `conversation.content` factory (CONV 19807–19810); live catalog + owner props `{size, className}` are in RUNNER 3117–3144; the host passes `{size:34, className:...fish}` and falls back to the fish logo (CONV 17766–17769), so an occupant replaces the logo on the blank-session hero. Register-option shape: `{name}` is sufficient; `id`/`order` are accepted but unused for `single` (SlotCore's single case only rejects a second entry at the same priority; `entriesOfSlot` dedupes all non-keyed/non-list kinds to one winner), so the extra `id` in ROSY 763 is harmless. There is no shipped occupant today; a future host occupant at priority 0 would make `register` throw inside `slots.inject`, failing activation — acceptable risk, or pass a lower `priority`. Phase read = scrollport's `.closest("[data-phase]")`, fallback first `[data-phase]` (651–654) — same idea as MAID 3284–3287, but MAID also validates the root by checking `querySelector("[data-conversation-scroll]")?.closest("[data-phase]") === root`.

Reference mount functions to copy when extending: `createCharacterStage` (MAID 2726–2745), `ensureChatAreaStage` (2757–2762), `ensureChatAreaChrome` (2773–2778), `createComposerLaceRail`/`ensureComposerLaceRail` (2779–2797), `decorateTitlebarBrand` (2832–2843), `decorateSidebar` (2844–2884), `createSidebarCorners` (2810–2826). The new bundles' `createNodes`/`ensureMounted` (585–667) are a simplified version of the same: stage prepended into centerCol (hero/card/veil, `data-skin-phase` gates visibility), sidebar img prepended into `sidebarCol > div`, wordmark prepended into titlebar, fixed top/bottom trims appended to body. Ownership attributes `data-skin-chrome` + `data-skin-owner` are set on every owned node (588–640) so a future reattach/cleanup can distinguish skin chrome from host nodes (MAID's observer uses exactly that: `isSkinChrome` 3282, filters added/removed nodes 3313). MutationObserver reattach pattern: on every relevant mutation, re-run idempotent `ensure*` helpers (ROSY 709–719; MAID 3269–3337) rather than mounting once.

## 6. Favicon / document.title

ROSY replaces tab icons: comment anchors capture host `<link rel~="icon">`/`apple-touch-icon`, skin links carry `data-skin-chrome="favicon"`, restore puts host nodes back (538–575). Title is **not** touched by the new skins — correct and simplest; MAID sets `document.title` and restores it on dispose if unchanged (2959, 3032, 3356), ORCA does the same. Missing vs references: (a) no `<link rel="manifest">` replacement (MAID 2213–2253, ORCA 2337–2396) — only matters for installed-PWA/taskbar icons, not tab; (b) no ref-count (F2). Keep the current "favicon only, no title" choice unless the PWA identity matters.

## 7. Inlined customization protocol v2

Wire (MANAGER `src/protocol.ts` 9–24, 143–188): dispatch `CustomEvent` on `window` — `dsh:skin-customization-register-v2` with `{token, definition}`, re-dispatch on `dsh:skin-customization-ready-v2` (load-order/HMR handshake), `unregister-v2` on teardown, then `definition.apply(null)`. `definition = {protocol:2, skinId, title, titleEn?, settings[], apply(state|null)}`; `state = {values, visibility}` where `visibility[key]` is the manager-computed boolean for every `visibility-schedule`. `apply(null)` must release **all** customization-owned state and be idempotent (protocol.ts 149–150; MANAGER runs it on unregister and on its own dispose). Supported types only: `boolean|select|range|color|checkbox-group|visibility-schedule` (94–135); manager validates type membership and key regex `/^[a-zA-Z][a-zA-Z0-9._-]*$/` (MANAGER 608–622), then calls `apply({values,visibility})` (637–652).

ROSY/IVORY 52–70 inline the exact wire; 75–97 implement `applyCustomization`; 98–155 declare five settings. All keys/types/defaults are valid; `sfwMode` correctly consumes `state.visibility.sfwMode`; `apply(null)` clears the inline accent/dim vars and both attrs. Recommended set for these skins (keep): `artwork` boolean (hero/card/sidebar/wordmark share it via `data-skin-artwork`), `accent` color (validator already forces `#rrggbb`), `dim` range 0–80 step 2 (feeds `--skin-dim`, used by `.skin-stage__wash`), `wordmark` boolean, `sfwMode` visibility-schedule for the portrait. Optional extras only if needed: a `select` for hero side/crop, a `checkbox-group` for which layers to hide. Avoid custom types and unknown keys; label/labelEn and descriptions are rendered by the manager.

## 8. Stacking, pointer-events, readability, teardown pitfalls

- All decorative layers are `pointer-events:none` + `aria-hidden` (stage 588–590, hero/card, sidebar img, trims 634–640). Keep it — the stage sits inside the chat column.
- `body::before` full-bleed ambient is `position:fixed; z-index:0` (229–241). The app frame is a positioned element (LAYOUT `.frame{position:relative}`), so the frame paints above the pseudo and text is not veiled; still worth one visual check on landing + settings.
- `.skin-stage` is `position:absolute; z-index:0` as the **first** child of centerCol (266–273, 657). It relies on the conversation root painting after it in DOM order, exactly like MAID's stage comment (2746–2756); the host's `.centerCol` and `[data-phase]` roots are positioned (MAID's CSS sets them relative, so its stage ordering is proven). If chat text ever sits under the wash/hero, give the column `isolation:isolate` and lift content (`> :not(.skin-stage){position:relative;z-index:1}`).
- Readability: hero/card only fade in for `[data-skin-phase="hero"]` (336–346) and card hides ≤1100 px, hero dims ≤880 px (511–533) — messages are never covered by the portrait. Sidebar portrait is the one stacking problem (F1). Keep `opacity` low and masks on both figures.
- Portals: token blocks include `dialog,[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-menu-material],[data-radix-popper-content-wrapper]>*` (186, 213–221). Because the dark rule carries one more attribute than the light portal rule, dark wins — correct. Do not scope by child combinator from body only.
- Teardown: disconnect observers, cancel rAF/timeouts, remove style+carriers, restore saved attrs, unregister customization + icons, remove inline props (ROSY 728–746; MAID 2992–3033). Reload/switch order is serialized by the host (MODS README 42: disabling removes the entry and waits for async effects before evicting styles/modules), so don't add async cleanup unless needed.
- Host shell quirks to respect: the desktop titlebar is `html[data-windows-titlebar]` (`[class*="titlebar"]` may not exist on plain web/macOS — wordmark then simply does not mount); settings/panel pages may replace the conversation column (F6); dialogs/radix render in body portals (handled by token scoping); `prefers-reduced-motion` transitions are already disabled (511–517).
- Theme flicker: set the body attribute and append the style synchronously in the same effect tick (ROSY 699–707) so the scoped palette applies before first paint of the mount; never toggle the attribute in a rAF.

## 9. `ctx.theme.overrideTokens` and extra tokens

Yes, a skin client plugin can call it. THEME provides the service (`ctx.provide("theme", theme)`, 2029) and `overrideTokens(source, tokens)` stacks a partial layer of `{token: {light, dark}}`, returns a disposer, re-calling with the same source replaces the layer, and the disposer removes exactly that layer (1820–1847; pair-shaped values are runtime-validated, bare strings throw — 1931–1943). The presenter writes the composed tokens as **inline styles on `<body>`** (548–568) and retracts them on dispose (574–584). Consequences: (a) inline wins over stylesheet token blocks, (b) body inheritance reaches dialogs/portals without extra selectors, (c) it survives light/dark flips automatically.
How to declare: runtime `inject:["theme"]` on the exported plugin object (then `ctx.theme` exists; wrap `ctx.effect(() => ctx.theme.overrideTokens(SKIN_ID, {...}))`). `package.json.dsh.client.inject` is **not** needed for a service — that field is module-graph ordering only. The dynamic Cordis runner additionally pins the layer source to the package id and auto-disposes it (RUNNER 292–318), but installed skins are ordinary Loader rows, so source is the string you pass (use `SKIN_ID`).
Should these skins switch? **No, keep the scoped CSS.** It matches MAID/ORCA, needs no service, covers non-token design variables (`--skin-accent`, `--skin-dim`, radii, artwork vars) in one place, and removes atomically with the style tag. If you later prefer overrideTokens for the alias tokens, move the 14 registry tokens (`--dsw-alias-bg-*`, `--dsw-alias-border-l1/l2`, `--dsw-alias-brand-primary`, `--dsw-alias-label-primary/secondary`, error/idle/success/warn, `--dsw-specific-sidebar-fill`; THEME 1531–1629) into one `overrideTokens` layer and delete their CSS declarations — never keep both (inline would silently win and confuse maintenance). Extra tokens beyond the registry are allowed by `overrideTokens` (any name goes through `validateOverrides`; `exportInspectTokens` reports override-only names dynamically, 1700–1704), but they are still plain CSS variables on body; scoped CSS is the simpler home for skin-private vars like `--skin-*`.

## 10. Skeleton (minimal; ROSY structure, with the audit fixes folded in)

```js
window.__ModuleLoader__.load({
  id: "dsh-client-ui-skin-rosy-cream",           // == package.json name
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");
    const h = React.createElement;
    const ID = "rosy-cream", PKG = "dsh-client-ui-skin-rosy-cream";
    const BODY = "data-dsh-rosy-cream", PHASE = "data-skin-phase", ART_ATTR = "data-skin-artwork";
    const asset = (f) => new URL(`skin-assets/${ID}/${f}`, document.baseURI).href;
    const ART = { hero: asset("<hash>.webp"), card: asset("<hash>.webp"), sidebar: asset("<hash>.webp"),
                  avatar: asset("<hash>.webp"), fav32: asset("<hash>.png") };
    const scope = `body[${BODY}]`;
    const CSS = `
      ${scope}{--skin-accent:var(--skin-accent-user,#c9858c);--skin-dim:.18}
      ${scope}[data-ds-dark-theme]{--skin-accent:#d99aa0}
      ${scope} .skin-stage{position:absolute;inset:0;z-index:0;pointer-events:none;contain:paint}
      ${scope}[data-skin-artwork="on"][data-skin-phase="hero"] .skin-hero{opacity:1}
      ${scope} .skin-sidebar-character{position:absolute;bottom:0;width:100%;pointer-events:none;z-index:0}
      ${scope} [class*="sidebarCol"]>div>:not(.skin-sidebar-character){position:relative;z-index:2}
      ${scope}[data-ds-dark-theme] [class*="centerCol"]{background-image:url("${ART.hero}")}`;
    // v2 wire: same contract as MANAGER src/protocol.ts 166-188 (ready handshake + unregister)
    function exposeSkinCustomization(def) {
      const token = {}, events = { register: "dsh:skin-customization-register-v2",
        unregister: "dsh:skin-customization-unregister-v2", ready: "dsh:skin-customization-ready-v2" };
      const register = () => window.dispatchEvent(new CustomEvent(events.register, { detail: { token, definition: def } }));
      window.addEventListener(events.ready, register); register();
      return () => { window.removeEventListener(events.ready, register);
        window.dispatchEvent(new CustomEvent(events.unregister, { detail: { token, definition: def } })); def.apply(null); };
    }
    function applyCustomization(state) {
      const body = document.body; if (!body) return;
      if (state === null) { body.style.removeProperty("--skin-accent-user"); body.removeAttribute(ART_ATTR); return; }
      if (typeof state.values.accent === "string") body.style.setProperty("--skin-accent-user", state.values.accent);
      body.setAttribute(ART_ATTR, state.values.artwork !== false && state.visibility?.sfwMode !== false ? "on" : "off");
    }
    const definition = { protocol: 2, skinId: ID, title: "雾粉奶油光", titleEn: "Rosy Cream",
      settings: [
        { key: "artwork", type: "boolean", label: "显示人物立绘", labelEn: "Show artwork", defaultValue: true },
        { key: "accent", type: "color", label: "强调色", labelEn: "Accent", defaultValue: "#c9858c" },
        { key: "sfwMode", type: "visibility-schedule", label: "不那么二次元模式", labelEn: "Discreet mode",
          defaultValue: { enabled: false, outside: "visible", ranges: [] } } ],
      apply: applyCustomization };
    function installIcons() { // ref-count per document as in MAID 2181-2203 / ORCA 2344-2424
      const replaced = [], owned = [];
      const restore = () => { for (const n of owned) n.remove();
        for (const { node, anchor } of replaced) { if (anchor.parentNode) anchor.replaceWith(node); else anchor.remove(); } };
      for (const node of document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
        const anchor = document.createComment("skin: host icon"); node.before(anchor); replaced.push({ node, anchor }); node.remove(); }
      const fav = document.createElement("link"); fav.rel = "icon"; fav.type = "image/png"; fav.href = ART.fav32;
      fav.dataset.skinChrome = "favicon"; fav.dataset.skinOwner = PKG; owned.push(fav); document.head.append(fav);
      return restore;
    }
    function createNodes() {
      const stage = document.createElement("div"); stage.className = "skin-stage";
      stage.dataset.skinChrome = "character-stage"; stage.dataset.skinOwner = PKG; stage.setAttribute("aria-hidden", "true");
      const hero = document.createElement("img"); hero.className = "skin-hero"; hero.alt = ""; hero.src = ART.hero;
      stage.append(hero);
      const side = document.createElement("img"); side.className = "skin-sidebar-character"; side.alt = ""; side.src = ART.sidebar;
      return { stage, side };
    }
    const inject = ["slots"];
    function apply(ctx) {
      const body = document.body; if (!body) return;
      const nodes = createNodes();
      ctx.effect(() => {
        const prev = body.getAttribute(BODY);
        const style = document.createElement("style");
        style.dataset.plugin = PKG; style.dataset.pluginCss = `${PKG}/skin.css`; style.textContent = CSS;
        document.head.append(style);
        body.setAttribute(BODY, ""); body.setAttribute("data-skin-artwork", "on");
        let frame = 0;
        const sync = () => { frame = 0;
          const chat = document.querySelector('[class*="centerCol"]'); if (chat && nodes.stage.parentElement !== chat) chat.prepend(nodes.stage);
          const side = document.querySelector('[class*="sidebarCol"]')?.querySelector(":scope > div");
          if (side && nodes.side.parentElement !== side) side.prepend(nodes.side);
          const root = document.querySelector("[data-conversation-scroll]")?.closest("[data-phase]");
          body.setAttribute(PHASE, root?.getAttribute("data-phase") === "active" ? "active" : "hero"); };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
        const mo = new MutationObserver(schedule);
        mo.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase", "data-slot"] });
        sync();
        return () => { if (frame) cancelAnimationFrame(frame); mo.disconnect(); style.remove();
          nodes.stage.remove(); nodes.side.remove();
          if (prev === null) body.removeAttribute(BODY); else body.setAttribute(BODY, prev);
          body.removeAttribute(PHASE); body.removeAttribute("data-skin-artwork"); };
      }, `${ID}: presentation`);
      ctx.effect(() => exposeSkinCustomization(definition), `${ID}: customization`);
      ctx.effect(() => installIcons(), `${ID}: page icons`);
      ctx.effect(() => ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register(
        { name: "conversation.hero.brand.mark" },
        ({ size, className }) => h("img", { className, width: size, height: size, src: ART.avatar, alt: "", "aria-hidden": true }),
      )), `${ID}: hero brand mark`);
    }
    exports.apply = apply; exports.inject = inject; return module.exports;
  },
});
```

## 11. Verification status / limits

- Host-side facts verified: profile `package.json` lists both bundles and links them (`link:C:/Users/Shinji/Desktop/lusiskin/packages/…`); profile `cordis.patch.yml` managed rows are `ui-skin-rosy-cream disabled:false`, `ui-skin-ivory-noir disabled:true`; host inspect `Config.listConfigs{name:"dsh-client-ui-skin-rosy-cream"}` returns the live entry `include:ui-skin-rosy-cream` (status `absent` only means the plugin has no Config schema); `~/.dsh/skin-manager/desktop-icon.json` points at `rosy-cream-*.ico`, i.e. the manager treats rosy-cream as active.
- Not verified here: live rendering and the client slot/theme queries (`Slots.listSubTree`, `Theme.listTokens`, client `Service.listService` all timed out — no page attached to this session), and `http://127.0.0.1:54047/` returns 401 without the shell token. Visual checks still required for §8 (stage stacking, sidebar portrait over nav, landing/settings readability) and for ivory-noir after enabling it (it is currently disabled).
- Any change to the bundles should re-run: `Compare-Object` rosy/ivory (keep the two-line-only diff), asset-vs-manifest check (14/14), token-name check against host CSS, and a reload/switch test (enable → disable → enable) watching for duplicate `<link rel="icon">` and a leftover `data-dsh-*` on `<body>`.
