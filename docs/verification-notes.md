# Verification notes - DSH skin plugins `rosy-cream` / `ivory-noir`

Independent verification of the two new DSH Web GUI skin packages
(`dsh-client-ui-skin-rosy-cream`, `dsh-client-ui-skin-ivory-noir`) against the
installed skin-manager contract on this machine.

| | |
|---|---|
| Verified at | 2026-10-21 22:10 +08:00 (Asia/Shanghai) |
| DSH | desktop profile `desktop`, version `0.2.1-rc.2` |
| Web GUI | `http://127.0.0.1:54047` |
| Workspace packages | `C:\Users\Shinji\Desktop\lusiskin\packages\dsh-client-ui-skin-rosy-cream`, `...\dsh-client-ui-skin-ivory-noir` |
| Installed copies | `C:\Users\Shinji\.dsh\profiles\desktop\node_modules\dsh-client-ui-skin-rosy-cream` / `...-ivory-noir` (directory symlinks to the workspace packages) |
| Manager analysed | `...\node_modules\@smalltailqwq\dsh-client-ui-skin-deep-whale-manager\lib\index.js` (0.1.7) + `src\protocol.ts` |
| Reference skins | `@smalltailqwq/dsh-client-ui-skin-maid-atelier`, `@smalltailqwq/dsh-client-ui-skin-orca-link` |
| Deliverable A | [scripts/verify_skin_plugins.mjs](../scripts/verify_skin_plugins.mjs) (Node 24 ESM, no dependencies) |
| Mode | read-only: nothing was installed, uninstalled, activated or deactivated; no profile file was edited |

## 0. Live state actually observed (read this first)

The switch that this verification expected to see (`official`) was **not** the
state on disk at 22:01-22:10. Both patch layers recorded `rosy-cream` as the
enabled skin, and the host-side asset route confirmed it:

| Observation | Value |
|---|---|
| `~/.dsh/profiles/desktop/cordis.patch.yml` managed block | `ui-skin-maid-atelier: disabled: true`, `ui-skin-orca-link: disabled: true`, `ui-skin-rosy-cream: disabled: false`, `ui-skin-ivory-noir: disabled: true` |
| `~/.dsh/cordis.patch.yml` managed block | identical content |
| Patch mtimes | both `2026-10-21 22:01:57` |
| `GET /skin-assets/rosy-cream/06155c...webp` | 200 `image/webp`, 6158 bytes |
| `GET /skin-assets/ivory-noir/0319e8...webp` | 404 |
| `GET /api/dsh/skins` | 200, 4 skins, `rosy-cream` enabled per patch state |

So at verification time the **active skin was `rosy-cream`**, not `official`.
Any final report that claims "switched back to official" must be re-checked
with §5.1 before it is published. (The managed block is the authority; the
running page is not.)

## 1. Deliverable A - static package verifier

`node scripts/verify_skin_plugins.mjs [package-dir ...]`

- No argv: auto-scans `packages/*/` (workspace pre-install mode).
- With argv: validates the given directories, e.g. the installed profile
  `node_modules` directories (post-install mode; directory symlinks work).
- `--help` prints usage. Exit code `0` = no FAIL, `1` = at least one FAIL,
  `2` = usage / no package found. PASS/WARN/FAIL/NOTE lines are grouped per
  package, then a summary.
- Read-only by construction: `fs` reads plus one `node --check` child process
  for `lib/client.js`; no install, no network, no profile writes.

### 1.1 Self-test results (all three invocation modes)

| Run | Command | Result |
|---|---|---|
| Workspace packages (auto-scan) | `node scripts/verify_skin_plugins.mjs` | exit 0 - 2 packages, **122 PASS, 0 WARN, 0 FAIL** (61 PASS each) |
| Installed symlinked packages (argv) | `node scripts/verify_skin_plugins.mjs "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-client-ui-skin-rosy-cream" "...\dsh-client-ui-skin-ivory-noir"` | exit 0 - **122 PASS, 0 WARN, 0 FAIL** |
| Reference skins (argv, tuning check) | `node scripts/verify_skin_plugins.mjs "...\@smalltailqwq\dsh-client-ui-skin-maid-atelier" "...\@smalltailqwq\dsh-client-ui-skin-orca-link"` | exit 0 - **122 PASS, 0 WARN, 0 FAIL** |

The reference-skin run is the important tuning check: the validator was tuned
for legitimate reference differences instead of flagging them - `package.json#icon`
may be SVG (orca-link), `lib/client.js` may use the literal
`skin-assets/<id>/` route (maid/orca) or a `skin-assets/${SKIN_ID}/` constant
bound to `CONFIG.id` (the new skins), `document.title` may be saved+restored
(maid/orca) or never touched (the new skins), and XML namespace literals
(`http://www.w3.org/2000/svg`) are benign while real remote URLs are WARNed.

### 1.2 Negative self-tests (validator actually catches breakage)

Two deliberately corrupted copies of the packages were made in `%TEMP%`
(deleted afterwards; the real packages were never touched):

| Injected fault | Detected as |
|---|---|
| `exports` missing `./client` | FAIL exports keys |
| `dsh.bundle.patch` pointing at a missing file | FAIL dsh.bundle.patch |
| `skin.id = "Rosy Cream!"`, bad `dshCompatibility`, missing `order` | FAIL skin.id / dshCompatibility / order |
| manifest entry not a sha256 name; one asset byte-corrupted; stray `.txt` file | FAIL manifest entries / asset sha256 / directory coverage / unknown extensions |
| absolute Windows path in `lib/index.js` | FAIL no absolute paths |
| one manifest name removed from `lib/index.js` literal | FAIL embedded manifest |
| `lib/client.js` `__ModuleLoader__.load` id changed | FAIL ModuleLoader id |
| `fetch("https://evil.example/x.png")` + unconditional `document.title = "Rosy"` | WARN remote URLs / remote fetch / document.title |
| `cordis.patch.yml` row with `disabled: true` + duplicate row id | FAIL row not disabled, WARN duplicate row ids |
| syntax error in `lib/client.js` | FAIL lib/client.js syntax (`node --check`) |
| `desktopIcon` file removed | FAIL skin.desktopIcon |
| `locale/en.json` with empty `meta.title`/`description` | FAIL locale/en.json |
| changed files with stale `skin.build.json` fingerprint | FAIL skin.build.json fingerprint |

Corrupted run result: exit `1`, `15 FAIL` + `5 WARN` (first scenario) and
exit `1` with the expected FAIL/WARN rows (second scenario).

### 1.3 What the validator covers

- **package.json**: name, version, ESM `type`, exports keys (`.`, `./client`,
  `./skin.json`, `./locale/*.json`, `./package.json`) and target existence,
  `dsh.bundle.patch` existence/containment, `dsh.client.platform === "web"`,
  `dsh.client.inject`, peer range admission of `0.2.1-rc.2` (simple
  `>=x <y`/`^`/`~`/`||` comparator parser; unsupported syntax is a clear WARN,
  never a silent pass), package icon (inside package, <= 262144 bytes,
  PNG/WebP magic or SVG vector), `main`, npm `files` coverage.
- **cordis.patch.yml**: YAML shape (top-level sequence, no tab indentation),
  single `- insert:` row with `id === skin.json#wiring.id` and
  `name === package.json#name`, no `disabled: true` on that row, duplicate row
  ids (WARN), unexpected extra rows (WARN).
- **skin.json**: `id` regex, non-empty `name`, exact `package`, `wiring.id`
  regex, `bodyAttr` regex, `dshCompatibility` regex (+ mapping to the running
  `0.2.1-rc.2`), accent hex, finite `order`, `preview.light/dark` existing
  package-relative images, `desktopIcon` existing package-relative `.ico` with
  ICO magic `00 00 01 00`.
- **assets/runtime**: manifest is an array of `^[a-f0-9]{64}\.(webp|png)$`,
  names unique, every name's first 64 hex chars equal `sha256(file bytes)`,
  every file in the directory listed exactly once, unknown extensions
  rejected, image signature matches extension, count + total bytes reported.
- **lib/index.js**: literal `installSkinAssets(ctx, "<skin id>"`, the
  `manifest_default` literal equals `assets/runtime/manifest.json` (order
  included), content-addressed filename guard regex present, no absolute
  drive-letter/`file://` paths, `apply` export, runtime-directory URL.
- **lib/client.js**: `node --check` syntax pass (EPERM would be reported as a
  skipped WARN with reason, never a silent pass), `__ModuleLoader__.load({ id })`
  equals the package name, `factory(require)` shape, no remote http(s)
  assets/fetch (w3.org namespace URIs tolerated), `skin-assets/<id>/` route
  (literal or `SKIN_ID` bound to `CONFIG.id`), `document.title` save+restore
  hygiene, referenced asset hashes all present in the manifest, integration
  signals (bodyAttr / `ctx.effect` / MutationObserver).
- **locale/en.json + zh.json**: `meta.title` and `meta.description` non-empty.
- **skin.build.json** (optional): metadata shape (`schema: 1`, 64-hex
  fingerprint, `owner/repo`, safe repo path) and **byte-exact recomputation of
  the manager's `computeSkinFingerprint`** (LF-normalised
  `path\0byteLength\0content` for `lib/client.js`, `lib/index.js`,
  `cordis.patch.yml`, `skin.json`, then `assets/runtime/manifest.json` and
  every listed asset sorted by name). Both new packages match
  (`7eb543e1...` / `b1296946...`); both reference skins also recompute to their
  shipped fingerprints, which confirms the algorithm replication.

### 1.4 Pre-install vs post-install usage

```powershell
cd C:\Users\Shinji\Desktop\lusiskin

# before install: workspace packages (auto-scan)
node scripts/verify_skin_plugins.mjs

# after install: the same checks against the profile copies (symlinks are fine)
node scripts/verify_skin_plugins.mjs `
  "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-client-ui-skin-rosy-cream" `
  "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-client-ui-skin-ivory-noir"
```

Run the pre-install pass before packaging/installing and the post-install pass
after `dsh plugin --profile desktop add <dir>`; identical PASS counts mean the
installed tree is the tree that was built and fingerprinted.

## 2. Live skin-manager route - catalog and activation

The manager registers an exact host route
(`node_modules\@smalltailqwq\dsh-client-ui-skin-deep-whale-manager\lib\index.js`):

```js
const SKIN_MANAGER_ROUTE = "/api/dsh/skins";   // line ~1465
// URL: http://127.0.0.1:54047/api/dsh/skins
```

All requests are same-origin only (`sameOrigin`, ~2168): a browser request with
`Sec-Fetch-Site: cross-site` is rejected `403`. Local tools may omit `Origin`,
but sending it is the documented, explicit form.

### 2.1 GET catalog

```powershell
$base = "http://127.0.0.1:54047"
$h = @{ Origin = $base; "Sec-Fetch-Site" = "same-origin" }
$r = Invoke-WebRequest "$base/api/dsh/skins" -Headers $h -UseBasicParsing
$r.StatusCode          # 200
$r.Content | ConvertFrom-Json
```

Expected body: `{ "ok": true, "skins": [ ... ], "desktopIcon": { "enabled": true } }`.
Each skin entry (from `catalogEntry`, manager ~1552) carries:
`id`, `name`, optional `nameEn`/`tagline`/`taglineEn`, `package`, `wiringId`,
`bodyAttr`, optional `dshCompatibility`, `order`, and optional `compatibility`
(the host's unmet peer check - absent here). Sorted by `order`, then name.

Observed 2026-10-21 22:10 (4 entries, order 5/10/30/31):

```json
{"ok":true,"skins":[
 {"id":"maid-atelier","name":"深海女仆工坊","package":"@smalltailqwq/dsh-client-ui-skin-maid-atelier","wiringId":"ui-skin-maid-atelier","bodyAttr":"data-dsh-maid-atelier","dshCompatibility":"0.2.1rc2","order":5},
 {"id":"orca-link","name":"虎鲸链路","package":"@smalltailqwq/dsh-client-ui-skin-orca-link","wiringId":"ui-skin-orca-link","bodyAttr":"data-dsh-orca-link","dshCompatibility":"0.2.1rc2","order":10},
 {"id":"rosy-cream","name":"雾粉奶油光","package":"dsh-client-ui-skin-rosy-cream","wiringId":"ui-skin-rosy-cream","bodyAttr":"data-dsh-rosy-cream","dshCompatibility":"0.2.1rc2","order":30},
 {"id":"ivory-noir","name":"象牙黑金","package":"dsh-client-ui-skin-ivory-noir","wiringId":"ui-skin-ivory-noir","bodyAttr":"data-dsh-ivory-noir","dshCompatibility":"0.2.1rc2","order":31}
],"desktopIcon":{"enabled":true}}
```

Important: the catalog reports **installed** skins, not the active one. It is
the right evidence for discovery (`skinManifestPath` -> `catalogEntry`), not for
activation. `GET /` (the app HTML) answers `401` to plain HTTP requests, so do
not probe the page itself without a session.

### 2.2 POST activation

Same route, `Content-Type: application/json`, body at most 16384 bytes.
`makeSkinManagerRoute` (~2204-2333) handles the target form:

```powershell
# activate one installed skin
Invoke-WebRequest "$base/api/dsh/skins" -Method POST -Headers @{
  Origin = $base; "Sec-Fetch-Site" = "same-origin"; "Content-Type" = "application/json"
} -Body '{"target":"rosy-cream"}' -UseBasicParsing
# -> 200 {"ok":true,"target":"rosy-cream"}

# back to the official look
... -Body '{"target":"official"}' -UseBasicParsing
# -> 200 {"ok":true,"target":"official"}
```

Exact semantics (read from `makeSkinManagerRoute`; no POST was issued during
this read-only verification, because it would change activation state):

| Request | Response | Side effect |
|---|---|---|
| `{"target":"<installed id>"}` | `200 {"ok":true,"target":"<id>"}` | `useSkin()` rewrites the managed block in **both** layers (`~/.dsh/profiles/desktop/cordis.patch.yml` and `~/.dsh/cordis.patch.yml`) atomically; the manager UI then calls `window.location.reload()` |
| `{"target":"official"}` | `200 {"ok":true,"target":"official"}` | same, with every `ui-skin-*` row `disabled: true` |
| `{"target":"not-a-skin"}` / `{}` | `400 {"ok":false,"error":"invalid-skin-target"}` | none |
| body not JSON | `400 {"ok":false,"error":"invalid-json"}` | none |
| body > 16384 bytes | `400` (`body-too-large`) | none |
| skin entry has unmet `compatibility`, `acceptRisk` absent | `409 {"ok":false,"error":"incompatible-version","compatibility":{...}}` | none |
| same but `{"target":"...","acceptRisk":true}` | 200 after host grants the exemption and writes it through `pluginManager` | admission + switch |
| cross-site headers | `403 {"ok":false,"error":"cross-site-request-rejected"}` | none |
| GET on a non-POST method other than GET | `405 {"ok":false,"error":"method-not-allowed"}` | none |

Other POST actions on the same route: `{"action":"versions"}`,
`{"action":"local-versions"}`, `{"action":"desktop-icon","enabled":true|false}`.

**Applying a switch:** a bare HTTP POST updates the authoritative patch files
immediately, but the already-open page is only reloaded by the GUI
(`requestSkinSwitch` -> POST -> `window.location.reload()`; manager
`lib/client.js` ~2163-2187). After a scripted POST, reload the page (or rely on
the UI) and verify §3.1/§3.2; do not assume the open page changed.

## 3. Verifying activation without browser control

### 3.1 Authoritative check - both patch layers

Paths and expected managed block (`renderManagedBlock`, manager ~2068-2074;
markers `MANAGED_START`/`MANAGED_END` ~1470-1471):

```
# --- dsh-skin managed (auto-generated; do not edit) ---
- id: ui-skin-maid-atelier
  disabled: true
- id: ui-skin-orca-link
  disabled: true
- id: ui-skin-rosy-cream
  disabled: false            <- the one enabled row (all true for official)
- id: ui-skin-ivory-noir
  disabled: true
# --- end dsh-skin managed ---
```

Read-only PowerShell check:

```powershell
$files = @(
  "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml",
  "$env:USERPROFILE\.dsh\cordis.patch.yml"
)
foreach ($f in $files) {
  $lines = Get-Content $f
  $in = $false; $rows = @(); $enabled = @()
  foreach ($line in $lines) {
    if ($line -match 'dsh-skin managed \(auto-generated') { $in = $true; continue }
    if ($line -match 'end dsh-skin managed') { $in = $false; continue }
    if (-not $in) { continue }
    if ($line -match '^- id:\s*(\S+)') { $rows += $Matches[1] }
    if ($line -match '^\s+disabled:\s*false') { $enabled += $rows[-1] }
  }
  "{0}: rows={1}; enabled={2}" -f $f, ($rows -join ','), ($enabled -join ',')
}
```

Pass criteria:

1. exactly one managed block per file; both files carry the same rows/values
   (home layer has higher priority - `patchTargetsForProfile` ~1508 - and the
   manager writes both, so disagreement is a defect);
2. one row per catalog `wiringId` (4 skins here), no duplicate ids;
3. exactly one `disabled: false` for a skin target, **zero** for `official`;
4. the active skin's row is not `disabled: true`;
5. YAML outside the markers is unchanged and non-skin rows (e.g. `ui-theme`,
   MCP config) survive - the manager preserves them (`stripManagedBlock` /
   `foreignRecords` ~2025-2067).

Observed at 22:10: both files identical, `rosy-cream: false`, all others `true`
=> authoritative active target = `rosy-cream`.

### 3.2 Host-side evidence - `/skin-assets/<id>/<sha256>.<ext>`

Each enabled skin's host half (`lib/index.js`) registers a prefix route with a
strict allowlist and content-addressed names. Active vs disabled is observable
from the outside:

```powershell
$base = "http://127.0.0.1:54047"
$h = @{ Origin = $base; "Sec-Fetch-Site" = "same-origin" }
# active skin, first manifest entry
Invoke-WebRequest "$base/skin-assets/rosy-cream/06155cb49e2224800da0c3542854904e551e6b65dd3b338a97ed3f2a4d2401c3.webp" -Headers $h -UseBasicParsing
# inactive skin -> 404
Invoke-WebRequest "$base/skin-assets/ivory-noir/0319e8d74a4a7b255d62fe64204f14d31d4e35618fe526947b54e0a4192508c9.webp" -Headers $h -UseBasicParsing
```

Observed (rosy-cream active at 22:03-22:10):

| Request | Observed |
|---|---|
| active asset `GET` | `200`, `Content-Type: image/webp`, `Content-Length: 6158`, `Cache-Control: public, max-age=31536000, immutable`, `ETag: "06155c..."`, `X-Content-Type-Options: nosniff` |
| active asset `If-None-Match: "06155c..."` | `304` |
| active asset `HEAD` | `200`, `Content-Length: 6158` |
| disabled skin asset | `404` |
| invalid file name (`deadbeef.webp`) | `404` |
| unknown skin | `404` |

An inactive skin answering `404` on its asset route is positive evidence that
the host plugin rows are mutually exclusive and the disabled skin is not loaded.
After a successful switch, swap the two rows: the newly enabled skin must
answer `200` and the previous one `404`.

### 3.3 `cordis_inspect_query` - client Theme / Slots (requires a connected page)

These are the only sanctioned live views of the browser half. Run them
**before and after** a switch (after reloading the page) and keep both outputs
as evidence.

```text
cordis_inspect_query(platform="client", provider="Theme", method="listTokens",
  input={})
cordis_inspect_query(platform="client", provider="Slots", method="listSubTree",
  input={"root": "conversation.hero.brand.mark"})
```

- `Theme.listTokens` returns the current theme token registry/token names and
  their light/dark override requirements. After activating a skin, the skin's
  alias-token expectations should be reflected there; after `official`, the
  stock set. Treat it as registry/requirement evidence - the **computed** CSS
  values are only visible in the DOM (see §3.4).
- `Slots.listSubTree` with `root="conversation.hero.brand.mark"` returns the
  exact live Slot with its catalog and occupants. Both skins register into that
  slot (`lib/client.js` ~758-769) with id `<skin-id>-hero-brand`, so the
  expected occupant is `rosy-cream-hero-brand` (or `ivory-noir-hero-brand`)
  while that skin is active, and no skin occupant after `official`. The slot
  literal itself was confirmed statically in the running DSH 0.2.1-rc.2
  `resources\app.asar` (7 occurrences), so the registration target is valid.

**Attempted in this session:** both client queries timed out after 10 s
(`Client inspect query ... timed out ... Open or reconnect the Harness page`).
The Client inspector needs a page that is open and connected; at verification
time no page responded. To complete this evidence, open/reload
`http://127.0.0.1:54047`, then re-run the two queries around a switch; capture
the raw JSON. Until then, token/slot activation remains **unverified live**,
with slot-name validity confirmed statically only.

### 3.4 What is NOT verifiable without browser control (report as unverified)

| Area | Why not verifiable here |
|---|---|
| Pixels, colours actually rendered, gradients, blur/opacity | no browser control, no screenshot channel, page answers `401` to raw HTTP |
| Typography, wrapping, wordmark rendering | same |
| Hero portrait / photo-card / sidebar figure placement and z-order | same; CSS selectors also depend on host class-module hashes |
| Dark-mode visual behaviour (`data-ds-dark-theme` branch, lines 207-221, 381-383, 442-447) | needs a rendered dark page |
| Responsive breakpoints (1100 px / 880 px, lines 518-533) | needs viewport control |
| Favicon visibly replaced/restored | only observable in a browser tab |
| Desktop/Start-menu shortcut icon visual (manager desktop-icon sync) | Windows shell state, not part of the package contract checked here |
| Customization panel interactions, `localStorage` persistence, v2 settings UI | needs the settings UI and a browser |
| Live `body[data-dsh-<id>]` presence, slot occupant | only inferable from patch+route here; inspector timed out |

## 4. Profile patch checks and rollback

### 4.1 What the manager writes

`switchPatch`/`useSkin` (~2076-2120) rewrite both live user layers with the same
managed block:

- `~/.dsh/profiles/desktop/cordis.patch.yml` (profile layer)
- `~/.dsh/cordis.patch.yml` (home layer, higher priority)

Each write is atomic (`atomicWrite`: temp file + fsync + rename), so a watcher
or a crash never sees a half-written file; the two-layer write rolls back both
files if the second fails. On startup the manager re-checks mutual exclusion
(`ensureSafeInitialState` ~2158): if two or more skins would be enabled it
falls back to `official` before serving the UI. Rows outside the markers are
preserved, and non-skin rows that DSH appended inside the block are moved in
front of it (`stripManagedBlock`/`foreignRecords`).

### 4.2 Rollback to the official look

```powershell
$base = "http://127.0.0.1:54047"
Invoke-WebRequest "$base/api/dsh/skins" -Method POST -Headers @{
  Origin = $base; "Sec-Fetch-Site" = "same-origin"; "Content-Type" = "application/json"
} -Body '{"target":"official"}' -UseBasicParsing
# expected: 200 {"ok":true,"target":"official"}
```

Then verify with §3.1 (all four rows `disabled: true` in **both** files) and
§3.2 (previously active skin route now `404`), and reload the page so the
browser half unloads. If the manager route is unavailable, the supported
recovery is: remove/replace only the content between the
`# --- dsh-skin managed ...` markers (never rows outside them), then restart
DSH; the manager regenerates the block from the discovered skins on the next
successful switch/startup. Uninstall order from the manager README:
switch `official` -> `plugin_manager remove_bundle` -> POST `official` again
(so the managed block drops rows for packages that no longer exist).

## 5. Independent code review - the two `lib/client.js` bundles

Both generated bundles are 778 lines and **identical except** line 15
(`__ModuleLoader__.load` id) and line 21 (`CONFIG` payload); the line numbers
below apply to both. Reviewed against
`@smalltailqwq/...-manager\src\protocol.ts`, the host's
`cordis-plugin-development/references/ui-plugin.md`, and the installed
reference skins.

**Blocking defects: none found.** The concerns below are risk notes, ordered by
severity, plus the positive checks that were verified statically.

| # | Severity | Finding | Evidence (client.js lines) |
|---|---|---|---|
| 1 | MEDIUM (accepted contract risk) | DOM carriers are CSS-module hash prefixes and data attributes: `[class*="centerCol"]`, `[class*="sidebarCol"]`, `[class*="titlebar"]`, `[data-phase]`, `[data-conversation-scroll]`, `[data-composer-card]`. Same fragile contract as maid-atelier/orca-link, but a host markup rename silently degrades decoration. | selectors 644-650; CSS 242-263, 363-407, 450-462; mounting 655-667 |
| 2 | MEDIUM (visual, unverified) | `readPhase()` falls back to the first `[data-phase]` in the document and returns `"hero"` when it finds none (or a non-`active` value); on panel/settings pages this can keep hero artwork mounted instead of hiding it. Reference maid tracks `ctx.layout.panelInfo.activePanelId` instead. Needs browser/visual check. | 651-654, 707-714 |
| 3 | LOW | `package.json#dsh.client.inject` declares `@deepseek-ai/dsh-client-ui-layout`, but the bundle exports `inject = ["slots"]` and only uses `ctx.slots`; `layout` is never used. Harmless (mirrors the reference package layout; `slots` is a baseline client service as used by the manager itself). | package.json 24-27; client.js 683, 695 |
| 4 | LOW (performance) | One body-wide `MutationObserver` (`childList/subtree/attributes`, attribute filter) drives a rAF-throttled `sync()` that runs several `querySelector` calls per frame; during token streaming this fires up to once per animation frame. No leak (observer/rAF cleaned up), acceptable at current scale. | 709-726, cleanup 729-731 |
| 5 | LOW (no-op) | `releaseClaimedStyles()` is invoked only from the dispose cleanup, so it cannot "hand back" styles while mounted; it only strips `data-plugin` from own loader-stamped styles at unmount. Harmless. | 577-581, 754 |
| 6 | LOW (ownership) | `installPageIcons()` replaces **all** `link[rel~="icon"]`/apple-touch-icon nodes and restores them from comment anchors. If host/another plugin manages the favicon concurrently, restore can interleave. Reference skins also own title/favicon; restore is wired correctly. | 538-575, effect 756 |
| 7 | INFO | Dead/unused code: `const root = document` (74), `ART.avatar512` is never used (`CONFIG.assets.avatar512` ships in the manifest but no CSS/ART reference it), `SKIN_OWNER` alias. Cosmetic only. | 24-47, 74, 434-437 |
| 8 | INFO | Settings labels are hard-coded Chinese with `labelEn`; this is exactly what the v2 manager protocol supports (it picks by UI language), so it is correct, though it does not use the Client locale service for dynamic language switches. | 103-153 |
| 9 | INFO | `apply()` early-returns if `document.body === null`; in the DSH boot graph the client module applies after DOM ready, same assumption as reference skins. | 691-693 |

Positive verifications for both bundles:

- **Loader shape**: `window.__ModuleLoader__.load({ id: <package name>, factory(require) })`,
  `exports.apply` + `exports.inject = ["slots"]` (14-19, 683, 773-776) - matches
  the host reference (`ui-plugin.md`: factory id equals package name; React
  comes from the browser module table, hence `require("react")` at 671).
- **Effect-owned cleanup is complete**: 5 `ctx.effect` registrations. The main
  effect saves/restores `data-dsh-<id>`, `data-skin-phase` and removes
  `data-skin-artwork`/`data-skin-wordmark`, removes the style tag and all
  mounted nodes, disconnects the observer, cancels rAF, and removes the
  `--skin-accent-user`/`--skin-dim` inline properties (696-747). Favicon
  restore (756), customization unregister + `apply(null)` (749-752), and slot
  disposer (758-769) are all effect-owned.
- **No global document.title override**; **no remote URLs or `fetch`** - artwork
  is same-origin via `new URL(\`skin-assets/${SKIN_ID}/${file}\`, document.baseURI)`
  (32), and every referenced hash is in the package manifest.
- **v2 customization protocol inlined correctly**: event names
  `dsh:skin-customization-register-v2/unregister-v2/ready-v2`, ready handshake,
  `{token, definition}`, disposer calls `definition.apply(null)` - semantically
  identical to `manager/src/protocol.ts` (`exposeSkinCustomization`); settings
  types (`boolean`, `color`, `range`, `visibility-schedule`) satisfy the
  protocol TS unions; `apply(state|null)` is idempotent (57-155).
- **Manager compatibility**: the manager detects the active skin via
  `document.body.hasAttribute(skin.bodyAttr)` (manager `lib/client.js` ~2282),
  which these bundles set; `dshCompatibility` = `0.2.1rc2` matches the running
  version; `wiring.id` rows are `ui-skin-*` and are not disabled in the bundle
  patch.
- **Slot registration**: `ctx.slots.inject("conversation.hero.brand.mark", () =>
  ctx.slots.register({ name, id: "<id>-hero-brand" }, HeroBrandMark))` matches
  the API usage of the manager and other installed plugins (`dsh-purge`,
  `dshmarket`), and the slot key exists in the running DSH app.asar.

## 6. Evidence checklist for the Lead's final report

| # | Claim | Evidence to cite | Expected | Observed | Status |
|---|---|---|---|---|---|
| 1 | Packages implement the manager skin contract | `node scripts/verify_skin_plugins.mjs` | 122 PASS / 0 FAIL | 122 PASS / 0 FAIL | verified |
| 2 | Installed copies match the built packages | same script with the two `node_modules` dirs | 122 PASS / 0 FAIL | 122 PASS / 0 FAIL | verified |
| 3 | Validator is not vacuous | two corrupted `%TEMP%` copies | FAIL + exit 1 | 15 FAIL/5 WARN + exit 1; targeted 6 FAIL/WARN | verified |
| 4 | Validator does not flag legitimate reference skins | maid-atelier + orca-link run | 122 PASS / 0 FAIL | 122 PASS / 0 FAIL | verified |
| 5 | Manager discovers both new skins | `GET /api/dsh/skins` (Origin header) | 4 entries incl. `rosy-cream`/`ivory-noir` | exactly that, order 30/31 | verified |
| 6 | Catalog metadata is complete/correct | same JSON: id/package/wiringId/bodyAttr/dshCompatibility/order | as designed | `rosy-cream`/`ivory-noir`, `data-dsh-*`, `0.2.1rc2`, 30/31 | verified |
| 7 | Mutual exclusion + activation host-side | asset routes active 200 / inactive 404 | one active only | rosy 200, ivory/maid/orca 404 | verified (rosy was active) |
| 8 | Asset route headers/immutability | active asset GET/HEAD/conditional GET | 200 + immutable + ETag, 304, HEAD 200 | exactly that | verified |
| 9 | Fingerprints match the manager algorithm | validator `skin.build.json fingerprint` + reference runs | match | both new + both reference skins match | verified |
| 10 | Patch layers agree on the active target | §3.1 PowerShell check | identical blocks, one `false` | both layers: rosy `false`, others `true` | verified |
| 11 | Previews / desktop icons / locales exist and are valid | validator checks | PASS | PASS | verified |
| 12 | Client tokens change on activation | `cordis_inspect_query` Theme.listTokens before/after | skin token expectations present | query timed out (no connected page) | **unverified** |
| 13 | Slot occupant is the active skin | `cordis_inspect_query` Slots.listSubTree `conversation.hero.brand.mark` | `rosy-cream-hero-brand` occupant | query timed out; slot name statically confirmed in app.asar | **unverified** |
| 14 | Presentation pixels/typography/dark mode | browser/visual inspection | designed visuals | no browser control, page 401 to raw HTTP | **unverified** |
| 15 | POST activation path works live | POST `{"target":...}` | 200 `{ok:true,target}` + patch rewrite | not exercised (read-only mandate; live POST blocked by tool policy); semantics read from `makeSkinManagerRoute` | **not exercised** |
| 16 | Rollback to official | POST `official` then §3.1/§3.2 | all rows true, asset 404 | recipe documented; not exercised here | **not exercised** |

## 7. Limitations / open items for the final report

1. **Active target mismatch**: verification-time evidence (§0) shows
   `rosy-cream` enabled, not `official`; re-run §3.1/§3.2 immediately before
   publishing any "switched back to official" claim.
2. **Client inspector unavailable**: Theme/Slots queries timed out twice -
   no connected client page. Re-run them with the page open/reloaded; without
   them, token/slot activation stays unverified (static validation covers the
   slot name and registration code, not the live occupant).
3. **No pixel evidence**: there is no browser control, DevTools, CDP or
   screenshot path in this environment; the page itself returns `401` to plain
   HTTP. Visual acceptance needs the user's eyes (settings -> skins, light and
   dark, hero + chat states, narrow window).
4. **POST/rollback not exercised**: the read-only mandate and tool policy
   blocked live activation probes; the request/response matrix in §2.2 comes
   from the installed manager source, which is the code the GUI itself calls.
5. `dshCompatibility` is pinned to `0.2.1rc2`; on a DSH upgrade the manager
   will flag the skins and require an explicit `acceptRisk` exemption (or a
   rebuilt `skin.json`/`package.json` with the new version + new fingerprints).

## 8. Lead follow-up (supersedes the open items above)

Appended after the verifier finished; everything here was observed by the Lead in the live session.

### 8.1 Active target (resolves §0 / §7.1)

The `official` state the Lead mentioned in its hand-off message was transient: the Lead switched
`official -> rosy-cream` at 22:01 while testing teardown. The intentional final state **is `rosy-cream`**;
both patch layers agree (`ui-skin-rosy-cream disabled: false`, all other skins `true`), catalog GET still
returns 4 skins, and `/skin-assets/rosy-cream/<sha>.webp` answers 200 while `ivory-noir` answers 404.
No stale "switched back to official" claim should be published.

### 8.2 Client inspector queries succeeded (resolves §3.3 / §7.2)

With the page connected, `cordis_inspect_query` client `Slots.listSubTree` root
`conversation.hero.brand.mark` returned an active occupant:

- rosy active -> occupant id `rosy-cream-hero-brand`, `active: true`
- switched to ivory -> occupant id `ivory-noir-hero-brand`, `active: true`
- switched to official -> `occupants: []` (clean disposal)

That is live proof that the active skin's client bundle materialized, ran `apply(ctx)`, and disposed
through `ctx.effect` on switch. `Theme.listTokens` only returns token names (no values) on this build,
so it cannot prove token values; the static package checks cover declaration, the slot proves execution.
The favicon/DOM/CSS writes run before the slot registration in `apply`, so their code paths also ran.

### 8.3 Audit findings fixed and packages rebuilt

The Lead applied the verifier's medium finding plus the four low-risk items from the client-architecture
audit, then rebuilt both packages:

- **phase fallback** (`readPhase()`): `active` / `hero` / otherwise `inactive`, so panel/settings pages no
  longer keep the landing hero mounted behind their content;
- **F1 sidebar stacking**: in-flow sidebar children are lifted with `position: relative; z-index: 2`
  (portrait excluded), same rule the reference maid-atelier skin uses, so the character no longer paints
  over navigation rows;
- **F2 favicon installer**: reference-counted per document (WeakMap users counter like MAID/ORCA) and the
  restore path now guards `!node.isConnected`; overlapping HMR activations cannot duplicate/orphan `<link>`s;
- **F3 artwork selectors**: positive `[data-skin-artwork="on"]` replaced by
  `[data-skin-phase="hero"]:not([data-skin-artwork="off"])`, so a manager unload that strips the attribute
  falls back to "artwork visible" instead of hiding it permanently;
- **F4 dead token**: `--dsw-alias-border-l1-darkmode-thin` removed (host only defines the l2 variant;
  `--dsw-alias-border-l2-darkmode-thin` kept);
- **F5 hero-brand occupant**: consumes the owner `size` / `className` props instead of ignoring them.

Final fingerprints after the rebuild: rosy-cream `23c29aa0...`, ivory-noir `98db3149...`; both recompute
byte-exact against the installed manager's `computeSkinFingerprint`, and `verify_skin_plugins.mjs` is
122 PASS / 0 FAIL again on the rebuilt workspace packages and the installed symlinked copies. The running
page may keep the previous client generation until DSH restarts; a restart loads the fixed bundle (linked
packages, new module generation). Not acted on (documented-only, low risk): body-attribute lease sharing,
collapsed-rail hiding of the sidebar portrait, and monitoring `ctx.layout.panelInfo` instead of DOM phase.

### 8.4 Extra live checks not in §3

- asset route revalidation: `HEAD` -> 200 with `Content-Type`, `Content-Length`, `ETag`;
  `If-None-Match` -> 304; invalid filename -> 404 (matches reference skins' contract)
- manager desktop-icon sync ran for the active skin:
  `~/.dsh/skin-manager/desktop-icons/rosy-cream-*.ico` exists and
  `desktop-icon.json` records desktop + Start-menu shortcut rewrites (feature was already enabled)
- `list_bundles` shows both bundles `enabled: true, installed: true, removable: true` with their rows
  `ui-skin-rosy-cream` / `ui-skin-ivory-noir`

Remaining unverified is unchanged: pixels, typography, dark-mode rendering and narrow-width layout need
the user's eyes; there is no screenshot/CDP path in this environment.
