#!/usr/bin/env node
/**
 * DSH Web GUI skin-package verifier (Node 24 ESM, zero dependencies).
 *
 * Static, read-only validation of one or more DSH skin plugin packages. It is
 * meant to be run twice in a skin's life:
 *
 *   before install:  node scripts/verify_skin_plugins.mjs
 *                    (auto-scans <repo>/packages/<package>/)
 *   after install:   node scripts/verify_skin_plugins.mjs \
 *                      "%USERPROFILE%\\.dsh\\profiles\\desktop\\node_modules\\<package>"
 *                    (passing the installed profile directories as argv)
 *
 * Contract sources of truth (read-only, not imported):
 *   @smalltailqwq/dsh-client-ui-skin-deep-whale-manager/lib/index.js
 *     - catalogEntry()                 -> skin.json admission regexes
 *     - evaluateSkinCompatibility()    -> peerDependencies + prerelease semver
 *     - skinManifestPath()             -> how <package>/skin.json is resolved
 *     - computeSkinFingerprint()/hashSkinAssets() -> skin.build.json fingerprint
 *     - makeSkinManagerRoute()/switchPatch()/renderManagedBlock() -> patch rows
 *   @smalltailqwq/dsh-client-ui-skin-maid-atelier / orca-link -> reference shape
 *
 * Exit code: 0 if no FAIL, 1 if any FAIL, 2 on usage / no package found.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants mirrored from the manager / skin contract
// ---------------------------------------------------------------------------
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PKG_SCAN_ROOT = join(REPO_ROOT, "packages");

/** Running DSH version this build targets; manager reads the same value from its host. */
const TARGET_DSH_VERSION = "0.2.1-rc.2";
/** `skin.json#dshCompatibility` spelling of TARGET_DSH_VERSION (manager regex). */
const TARGET_DSH_COMPAT = "0.2.1rc2";

const MAX_PKG_ICON_BYTES = 262144;
const SKIN_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const WIRING_ID_RE = /^[a-zA-Z0-9@/_.:-]+$/;
const BODY_ATTR_RE = /^data-[a-z0-9_.:-]+$/;
const DSH_COMPAT_RE = /^\d+\.\d+\.\d+rc\d+$/;
const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const MANIFEST_ENTRY_RE = /^[a-f0-9]{64}\.(webp|png)$/;
const ASSET_FILE_RE = /^([a-f0-9]{64})\.(webp|png)$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REL_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const FINGERPRINT_INPUTS = ["lib/client.js", "lib/index.js", "cordis.patch.yml", "skin.json"];
const RUNTIME_MANIFEST = "assets/runtime/manifest.json";

const USAGE = `Usage:
  node scripts/verify_skin_plugins.mjs [package-dir ...]
  node scripts/verify_skin_plugins.mjs --help

With no package-dir arguments the script auto-scans ${PKG_SCAN_ROOT}/*.
Each argument may be a workspace package directory or an installed
profile node_modules directory. Validation is read-only.`;

// ---------------------------------------------------------------------------
// Small filesystem / parsing helpers
// ---------------------------------------------------------------------------
function loadText(file) {
  try {
    return { ok: true, text: readFileSync(file, "utf8") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadJson(file) {
  const loaded = loadText(file);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  try {
    return { ok: true, value: JSON.parse(loaded.text) };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Resolve a package-relative path and report whether it stayed inside the package. */
function resolvePackagePath(packageDir, value) {
  const raw = String(value);
  const absolute = resolve(packageDir, raw);
  const rel = relative(packageDir, absolute);
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  return { absolute, inside, rel: rel === "" ? "." : rel };
}

function pathEscapesMessage(kind, value) {
  return `${kind} path escapes package root: ${JSON.stringify(value)}`;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

function collectMatches(text, regex) {
  const out = [];
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    out.push({ match, line: lineNumberAt(text, match.index) });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

function tail(text, max = 400) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `...${flat.slice(-max)}` : flat;
}

// ---------------------------------------------------------------------------
// Image / icon magic sniffing
// ---------------------------------------------------------------------------
/** @returns {"png"|"webp"|"svg"|"ico"|"unknown"} */
function imageKind(buffer) {
  if (buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return "png";
  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= ICO_MAGIC.length && buffer.subarray(0, ICO_MAGIC.length).equals(ICO_MAGIC)) return "ico";
  const head = buffer.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Minimal semver (manager uses `semver.satisfies(..., { includePrerelease: true })`)
// Supports: exact, =, >, >=, <, <=, ^, ~, "*", "||", whitespace AND groups.
// Anything outside that grammar is reported as "unsupported" and the caller
// turns it into a WARN instead of silently passing.
// ---------------------------------------------------------------------------
function parseSemver(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text).trim());
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  // Numeric identifiers always have lower precedence than alphanumeric ones.
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemver(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  const leftPre = left.prerelease;
  const rightPre = right.prerelease;
  if (leftPre.length === 0 && rightPre.length === 0) return 0;
  if (leftPre.length === 0) return 1; // release > prerelease
  if (rightPre.length === 0) return -1;
  const length = Math.max(leftPre.length, rightPre.length);
  for (let i = 0; i < length; i += 1) {
    if (i >= leftPre.length) return -1;
    if (i >= rightPre.length) return 1;
    const compared = compareIdentifiers(leftPre[i], rightPre[i]);
    if (compared !== 0) return compared;
  }
  return 0;
}

function bump(version, part) {
  if (part === "major") return { major: version.major + 1, minor: 0, patch: 0, prerelease: [0] };
  if (part === "minor") return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: [0] };
  return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: [0] };
}

/** Expand one comparator into primitive >=/>/</<=/= bounds; null = unsupported syntax. */
function expandComparator(operator, version) {
  switch (operator) {
    case "":
    case "=":
      return [["=", version]];
    case ">":
    case ">=":
    case "<":
    case "<=":
      return [[operator, version]];
    case "^": {
      let upper;
      if (version.major > 0) upper = bump(version, "major");
      else if (version.minor > 0) upper = bump(version, "minor");
      else if (version.patch > 0) upper = bump(version, "patch");
      else upper = { major: 0, minor: 1, patch: 0, prerelease: [0] };
      return [[">=", version], ["<", upper]];
    }
    case "~":
      return [[">=", version], ["<", bump(version, "minor")]];
    default:
      return null;
  }
}

function testComparator(version, operator, bound) {
  const compared = compareSemver(version, bound);
  switch (operator) {
    case "=":
      return compared === 0;
    case ">":
      return compared > 0;
    case ">=":
      return compared >= 0;
    case "<":
      return compared < 0;
    case "<=":
      return compared <= 0;
    default:
      return null;
  }
}

/**
 * @returns {{status: "pass"|"fail"|"unsupported"|"invalid-version", note?: string}}
 */
function satisfiesRange(versionText, rangeText) {
  const version = parseSemver(versionText);
  if (version === null) return { status: "invalid-version", note: `unparseable version ${JSON.stringify(versionText)}` };
  const range = String(rangeText ?? "").trim();
  if (range === "" || range === "*" || range === "latest" || range === "x") return { status: "pass", note: "wildcard" };
  if (["workspace:^", "workspace:~", "workspace:*"].includes(range)) {
    return { status: "pass", note: `${range} resolves to the running version in the manager` };
  }
  if (range.includes("workspace:")) return { status: "unsupported", note: `workspace protocol ${range}` };

  let unsupported = null;
  const groups = range.split("||").map((group) => group.trim()).filter(Boolean);
  for (const group of groups) {
    const parts = group.split(/\s+/).filter(Boolean);
    let groupOk = true;
    let groupUnsupported = null;
    for (const part of parts) {
      const match = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(part);
      if (match === null) {
        groupUnsupported = `token ${JSON.stringify(part)}`;
        break;
      }
      const operator = match[1] ?? "";
      const target = parseSemver(match[2]);
      if (target === null) {
        groupUnsupported = `version ${JSON.stringify(match[2])}`;
        break;
      }
      const comparators = expandComparator(operator, target);
      if (comparators === null) {
        groupUnsupported = `operator ${JSON.stringify(operator)}`;
        break;
      }
      for (const [comparatorOperator, bound] of comparators) {
        if (!testComparator(version, comparatorOperator, bound)) {
          groupOk = false;
          break;
        }
      }
      if (!groupOk) break;
    }
    if (groupUnsupported !== null) {
      unsupported ??= groupUnsupported;
      continue;
    }
    if (groupOk) return { status: "pass" };
  }
  if (unsupported !== null) return { status: "unsupported", note: `range uses unsupported syntax (${unsupported}): ${range}` };
  return { status: "fail", note: `${versionText} is outside ${rangeText}` };
}

// ---------------------------------------------------------------------------
// Manager-compatible fingerprint (computeSkinFingerprint + hashSkinAssets)
// ---------------------------------------------------------------------------
function hashSkinAssets(hash, packageDir) {
  const manifestFile = join(packageDir, RUNTIME_MANIFEST);
  if (!existsSync(manifestFile)) return;
  const text = readFileSync(manifestFile, "utf8").replaceAll("\r\n", "\n");
  const files = JSON.parse(text);
  if (!Array.isArray(files) || files.some((file) => typeof file !== "string" || !MANIFEST_ENTRY_RE.test(file))) {
    throw new Error("Invalid skin artwork manifest");
  }
  hash.update(`${RUNTIME_MANIFEST}\0${Buffer.byteLength(text)}\0`).update(text);
  for (const file of [...new Set(files)].sort()) {
    const input = `assets/runtime/${file}`;
    const bytes = readFileSync(join(packageDir, input));
    if (createHash("sha256").update(bytes).digest("hex") !== file.split(".")[0]) {
      throw new Error(`Artwork content hash mismatch: ${file}`);
    }
    hash.update(`${input}\0${bytes.length}\0`).update(bytes);
  }
}

function computeSkinFingerprint(packageDir) {
  const hash = createHash("sha256");
  for (const input of FINGERPRINT_INPUTS) {
    const normalized = readFileSync(join(packageDir, input), "utf8").replaceAll("\r\n", "\n");
    hash.update(`${input}\0${Buffer.byteLength(normalized)}\0`);
    hash.update(normalized);
  }
  hashSkinAssets(hash, packageDir);
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Lightweight cordis.patch.yml reader (no YAML dependency; mirrors the manager's
// expectations: a top-level sequence with one `- insert:` list of `{id,name}` rows)
// ---------------------------------------------------------------------------
function yamlScalar(text) {
  let value = String(text).trim();
  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function parseInsertPatch(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let currentBlock = null;
  let firstContent = null;
  let tabIndentedLine = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.trim() === "") continue;
    const indent = raw.length - raw.trimStart().length;
    if (!raw.trimStart().startsWith("#") && tabIndentedLine === null && /^[ ]*\t/.test(raw)) {
      tabIndentedLine = index + 1;
    }
    if (raw.trimStart().startsWith("#")) continue;
    const trimmed = raw.trimStart();
    if (firstContent === null) firstContent = { trimmed, indent, line: index + 1 };

    if (currentBlock === null) {
      if (indent === 0 && /^-\s*insert\s*:\s*$/.test(trimmed)) {
        currentBlock = { line: index + 1, indent, rows: [] };
        blocks.push(currentBlock);
      }
      continue;
    }
    // A new top-level sequence item ends the insert block.
    if (indent === 0 && /^-(\s|$)/.test(trimmed)) {
      currentBlock = null;
      // Re-examine this line as a possible new `- insert:` block.
      if (/^-\s*insert\s*:\s*$/.test(trimmed)) {
        currentBlock = { line: index + 1, indent, rows: [] };
        blocks.push(currentBlock);
      }
      continue;
    }
    if (/^-(\s|$)/.test(trimmed)) {
      const row = { line: index + 1, id: undefined, name: undefined, disabled: undefined, invalid: false };
      const idMatch = /^-\s*id\s*:\s*(.*)$/.exec(trimmed);
      if (idMatch === null) row.invalid = true;
      else row.id = yamlScalar(idMatch[1]);
      currentBlock.rows.push(row);
      continue;
    }
    const property = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (property !== null && currentBlock.rows.length > 0) {
      const row = currentBlock.rows[currentBlock.rows.length - 1];
      const value = yamlScalar(property[2]);
      if (property[1] === "id" && row.id === undefined) row.id = value;
      else if (property[1] === "name") row.name = value;
      else if (property[1] === "disabled") row.disabled = value;
    }
  }

  const rows = blocks.flatMap((block) => block.rows);
  return {
    blocks,
    rows,
    firstContent,
    tabIndentedLine,
    topLevelSequence: firstContent !== null && firstContent.indent === 0 && /^-(\s|$)/.test(firstContent.trimmed),
    topLevelInsert: blocks.length > 0 && blocks.every((block) => block.indent === 0),
  };
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------
class Report {
  constructor(packageDir) {
    this.packageDir = packageDir;
    this.rows = [];
    this.pass = 0;
    this.warn = 0;
    this.fail = 0;
    this.note = 0;
  }

  add(level, check, detail) {
    this.rows.push({ level, check, detail });
    if (level === "PASS") this.pass += 1;
    else if (level === "WARN") this.warn += 1;
    else if (level === "FAIL") this.fail += 1;
    else this.note += 1;
    return level;
  }

  ok(check, detail) {
    return this.add("PASS", check, detail);
  }

  warning(check, detail) {
    return this.add("WARN", check, detail);
  }

  failure(check, detail) {
    return this.add("FAIL", check, detail);
  }

  info(check, detail) {
    return this.add("NOTE", check, detail);
  }
}

// ---------------------------------------------------------------------------
// Validation phases
// ---------------------------------------------------------------------------
function checkPackageJson(report, ctx) {
  const { pkg, skin, pkgName } = ctx;
  if (!pkg.ok) {
    report.failure("package.json parses", pkg.error);
    return;
  }
  const manifest = pkg.value;
  ctx.manifest = manifest;
  if (!isPlainObject(manifest)) {
    report.failure("package.json is an object", "top-level JSON value is not an object");
    return;
  }

  if (typeof manifest.name === "string" && manifest.name.trim() !== "") report.ok("package name", manifest.name);
  else report.failure("package name", "package.json#name must be a non-empty string");

  if (typeof manifest.version === "string" && parseSemver(manifest.version) !== null) {
    report.ok("package version", manifest.version);
  } else {
    report.warning("package version", `missing or non-semver version: ${JSON.stringify(manifest.version)}`);
  }

  if (manifest.type === "module") report.ok("module type", 'type: "module"');
  else report.warning("module type", `expected "module" for ESM host entry, got ${JSON.stringify(manifest.type)}`);

  // --- exports map ---
  const requiredExports = [".", "./client", "./skin.json", "./locale/*.json", "./package.json"];
  const exportsMap = manifest.exports;
  if (!isPlainObject(exportsMap)) {
    report.failure("exports map", "package.json#exports is missing or not an object");
  } else {
    const missing = requiredExports.filter((key) => !(key in exportsMap));
    if (missing.length === 0) report.ok("exports keys", requiredExports.join(", "));
    else report.failure("exports keys", `missing export keys: ${missing.join(", ")}`);

    const rootTarget = exportTarget(exportsMap, ".");
    if (rootTarget === "./lib/index.js") report.ok('exports["."] target', "./lib/index.js");
    else report.failure('exports["."] target', `expected "./lib/index.js", got ${JSON.stringify(rootTarget)}`);

    const brokenTargets = [];
    for (const key of [".", "./client", "./skin.json", "./package.json"]) {
      if (!(key in exportsMap)) continue;
      const target = exportTarget(exportsMap, key);
      if (target === null) {
        brokenTargets.push(`${key}: no string target`);
        continue;
      }
      const resolution = resolvePackagePath(ctx.packageDir, target);
      if (!resolution.inside) brokenTargets.push(`${key}: target escapes package`);
      else if (!existsSync(resolution.absolute)) brokenTargets.push(`${key}: ${target} does not exist`);
    }
    if (brokenTargets.length === 0) report.ok("exports targets exist", "all string targets resolve inside the package");
    else report.failure("exports targets exist", brokenTargets.join("; "));

    if (typeof exportsMap["./locale/*.json"] === "string") {
      const localePattern = exportsMap["./locale/*.json"];
      // A glob is not a real file: check the directory it expands inside instead.
      const localeDirValue = localePattern.endsWith("/*.json") ? localePattern.slice(0, -"*.json".length) : dirname(localePattern);
      const localeDir = resolvePackagePath(ctx.packageDir, localeDirValue);
      if (localeDir.inside && existsSync(localeDir.absolute) && statSync(localeDir.absolute).isDirectory()) {
        report.ok("locale export", localePattern);
      } else {
        report.warning("locale export", `${localePattern} expands inside a missing directory`);
      }
    }
  }

  // --- dsh bundle / client sections ---
  const dsh = manifest.dsh;
  if (!isPlainObject(dsh)) {
    report.failure("dsh section", "package.json#dsh is missing");
  } else {
    const bundlePatch = dsh.bundle?.patch;
    if (typeof bundlePatch === "string" && bundlePatch.trim() !== "") {
      const resolution = resolvePackagePath(ctx.packageDir, bundlePatch);
      if (!resolution.inside) report.failure("dsh.bundle.patch", pathEscapesMessage("bundle patch", bundlePatch));
      else if (!existsSync(resolution.absolute)) report.failure("dsh.bundle.patch", `${bundlePatch} does not exist`);
      else {
        ctx.patchPath = resolution.absolute;
        ctx.patchRel = bundlePatch;
        report.ok("dsh.bundle.patch", `${bundlePatch} exists`);
      }
    } else {
      report.failure("dsh.bundle.patch", "package.json#dsh.bundle.patch must be a package-relative path string");
    }

    const platform = dsh.client?.platform;
    if (platform === "web") report.ok("dsh.client.platform", '"web"');
    else report.failure("dsh.client.platform", `expected "web", got ${JSON.stringify(platform)}`);

    const inject = dsh.client?.inject;
    if (inject === undefined) {
      report.warning("dsh.client.inject", "no inject array (reference skins declare the layout client plugin)");
    } else if (Array.isArray(inject) && inject.every((entry) => typeof entry === "string")) {
      report.ok("dsh.client.inject", inject.length === 0 ? "(empty array)" : inject.join(", "));
    } else {
      report.warning("dsh.client.inject", "must be an array of package-name strings");
    }
  }

  // --- peer dependencies (host admission) ---
  const peers = isPlainObject(manifest.peerDependencies) ? manifest.peerDependencies : {};
  const dshPeers = Object.keys(peers).filter((peer) => peer === "@deepseek-ai/dsh" || peer.startsWith("@deepseek-ai/dsh-"));
  if (dshPeers.length === 0) {
    report.warning("peerDependencies @deepseek-ai/dsh", "no @deepseek-ai/dsh peer range; the host admission check cannot be exercised");
  }
  for (const peer of dshPeers) {
    const range = peers[peer];
    if (typeof range !== "string") {
      report.warning(`peerDependencies ${peer}`, `non-string range ${JSON.stringify(range)}`);
      continue;
    }
    const result = satisfiesRange(TARGET_DSH_VERSION, range);
    if (result.status === "pass") report.ok(`peerDependencies ${peer}`, `${range} admits ${TARGET_DSH_VERSION}`);
    else if (result.status === "unsupported") report.warning(`peerDependencies ${peer}`, `unchecked - ${result.note}`);
    else report.failure(`peerDependencies ${peer}`, result.note ?? `${range} does not admit ${TARGET_DSH_VERSION}`);
  }

  // --- package icon (plugin market / desktop listing) ---
  checkPackageIcon(report, ctx);

  // --- main entry + publish file list ---
  if (typeof manifest.main === "string") {
    const resolution = resolvePackagePath(ctx.packageDir, manifest.main);
    if (resolution.inside && existsSync(resolution.absolute)) report.ok("main entry", manifest.main);
    else report.warning("main entry", `${JSON.stringify(manifest.main)} does not resolve to a file`);
  } else {
    report.warning("main entry", 'no "main" field (exports "." still works for ESM)');
  }

  if (Array.isArray(manifest.files)) {
    const files = manifest.files.filter((entry) => typeof entry === "string");
    const important = [
      ["lib/index.js", (entry) => entry === "lib/index.js"],
      ["lib/client.js", (entry) => entry === "lib/client.js"],
      ["skin.json", (entry) => entry === "skin.json"],
      ["cordis.patch.yml", (entry) => entry === "cordis.patch.yml"],
      ["assets/runtime", (entry) => entry === "assets/runtime" || entry.startsWith("assets/runtime/")],
      ["locale/*.json", (entry) => entry === "locale/*.json" || entry.startsWith("locale")],
    ];
    const missing = important.filter(([, predicate]) => !files.some(predicate)).map(([label]) => label);
    if (missing.length === 0) report.ok("files publish list", "declares runtime, client, skin metadata and locale files");
    else report.warning("files publish list", `does not declare: ${missing.join(", ")} (npm pack would omit them)`);
  } else {
    report.warning("files publish list", 'no "files" array; npm pack includes everything (larger, but not broken)');
  }

  // --- package name matches skin.package (cross-file) ---
  if (skin.ok && isPlainObject(skin.value)) {
    if (skin.value.package === manifest.name) report.ok("name matches skin.json#package", manifest.name);
    else {
      report.failure(
        "name matches skin.json#package",
        `package.json#name=${JSON.stringify(manifest.name)} vs skin.json#package=${JSON.stringify(skin.value.package)}`,
      );
    }
  }
}

function exportTarget(exportsMap, key) {
  const value = exportsMap[key];
  if (typeof value === "string") return value;
  if (isPlainObject(value)) {
    for (const condition of ["import", "default", "require", "node"]) {
      if (typeof value[condition] === "string") return value[condition];
    }
  }
  return null;
}

function checkPackageIcon(report, ctx) {
  const manifest = ctx.manifest;
  if (manifest === undefined) return;
  const icon = manifest.icon;
  if (icon === undefined || icon === null || icon === "") {
    report.warning("package icon", "package.json#icon absent (optional for the manager; plugin market uses it)");
    return;
  }
  if (typeof icon !== "string") {
    report.failure("package icon", `icon must be a string, got ${typeof icon}`);
    return;
  }
  const resolution = resolvePackagePath(ctx.packageDir, icon);
  if (!resolution.inside) return void report.failure("package icon", pathEscapesMessage("icon", icon));
  if (!existsSync(resolution.absolute)) return void report.failure("package icon", `${icon} does not exist`);
  const stat = statSync(resolution.absolute);
  if (!stat.isFile()) return void report.failure("package icon", `${icon} is not a regular file`);
  if (stat.size > MAX_PKG_ICON_BYTES) {
    return void report.failure("package icon", `${icon} is ${formatBytes(stat.size)} > ${formatBytes(MAX_PKG_ICON_BYTES)} cap`);
  }
  const kind = imageKind(readFileSync(resolution.absolute).subarray(0, 512));
  if (kind === "png" || kind === "webp") report.ok("package icon", `${icon} (${kind}, ${formatBytes(stat.size)})`);
  else if (kind === "svg") report.ok("package icon", `${icon} (svg vector icon, ${formatBytes(stat.size)})`);
  else report.failure("package icon", `${icon} is neither PNG, WebP nor SVG (magic bytes unrecognised)`);
}

function checkBundlePatch(report, ctx) {
  const patchPath = ctx.patchPath;
  if (patchPath === undefined) {
    report.failure("cordis.patch.yml", "cannot check because package.json#dsh.bundle.patch is missing");
    return;
  }
  const loaded = loadText(patchPath);
  if (!loaded.ok) {
    report.failure("cordis.patch.yml parses", loaded.error);
    return;
  }
  const text = loaded.text;
  const parsed = parseInsertPatch(text);
  ctx.patchText = text;

  // --- YAML shape ---
  if (parsed.tabIndentedLine !== null) {
    report.failure("YAML shape", `tab indentation on line ${parsed.tabIndentedLine} (YAML forbids tabs for indentation)`);
  } else if (!parsed.topLevelSequence) {
    report.warning("YAML shape", "first content line is not a top-level `- ` sequence item");
  } else if (!parsed.topLevelInsert) {
    report.warning("YAML shape", "`- insert:` is not at column 0; the loader expects a top-level sequence item");
  } else {
    report.ok("YAML shape", "top-level sequence with leading `- insert:`");
  }

  // --- insert block / rows ---
  if (parsed.blocks.length === 0) {
    report.failure("insert block", "no top-level `- insert:` block found");
    return;
  }
  if (parsed.blocks.length > 1) report.warning("insert block", `${parsed.blocks.length} insert blocks; expected exactly one`);

  const rows = parsed.rows;
  const emptyRows = rows.filter((row) => row.invalid || typeof row.id !== "string" || row.id === "");
  if (emptyRows.length > 0) {
    report.failure("insert rows", `${emptyRows.length} insert row(s) without a usable id (line ${emptyRows.map((row) => row.line).join(", ")})`);
  } else {
    report.ok("insert rows", `${rows.length} row(s): ${rows.map((row) => row.id).join(", ")}`);
  }

  const wiringId = ctx.skinWiringId;
  const expectedName = ctx.pkgName;
  const ownRow = typeof wiringId === "string" ? rows.find((row) => row.id === wiringId) : undefined;
  if (typeof wiringId !== "string") {
    report.failure("insert row id", "skin.json#wiring.id unavailable, cannot match the bundle patch row");
  } else if (ownRow === undefined) {
    report.failure("insert row id", `no row with id === skin.json#wiring.id (${wiringId})`);
  } else if (ownRow.name !== expectedName) {
    report.failure(
      "insert row name",
      `row ${wiringId} has name ${JSON.stringify(ownRow.name)}, expected package name ${JSON.stringify(expectedName)}`,
    );
  } else {
    report.ok("insert row id/name", `${wiringId} -> ${expectedName}`);
  }

  if (ownRow !== undefined) {
    if (String(ownRow.disabled ?? "").toLowerCase() === "true") {
      report.failure("row not disabled", `bundle patch sets disabled: true on its own ${wiringId} row`);
    } else {
      report.ok("row not disabled", "no disabled: true on the wiring row in the bundle patch");
    }
  }

  // --- duplicate ids across all insert rows ---
  const seen = new Map();
  for (const row of rows) {
    if (typeof row.id !== "string" || row.id === "") continue;
    seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length === 0) report.ok("duplicate row ids", "none");
  else report.warning("duplicate row ids", `duplicated in bundle patch: ${duplicates.join(", ")}`);

  // --- unexpected extra rows ---
  const extraRows = rows.filter((row) => row.id !== wiringId);
  if (extraRows.length > 0) {
    report.warning("bundle patch scope", `inserts ${extraRows.length} extra row(s) besides this skin: ${extraRows.map((row) => row.id).join(", ")}`);
  }
}

function checkSkinJson(report, ctx) {
  const loaded = ctx.skin;
  if (!loaded.ok) {
    report.failure("skin.json parses", loaded.error);
    return;
  }
  const skin = loaded.value;
  if (!isPlainObject(skin)) {
    report.failure("skin.json is an object", "top-level JSON value is not an object");
    return;
  }
  ctx.skinValue = skin;

  // --- id ---
  if (typeof skin.id === "string" && SKIN_ID_RE.test(skin.id)) report.ok("skin.id regex", skin.id);
  else report.failure("skin.id regex", `must match ${SKIN_ID_RE} (got ${JSON.stringify(skin.id)})`);

  // --- display name ---
  if (typeof skin.name === "string" && skin.name.trim() !== "") report.ok("skin.name", "non-empty");
  else report.failure("skin.name", "must be a non-empty string");

  // --- package exact ---
  if (skin.package === ctx.pkgName) report.ok("skin.package exact", ctx.pkgName);
  else report.failure("skin.package exact", `expected ${JSON.stringify(ctx.pkgName)}, got ${JSON.stringify(skin.package)}`);

  // --- wiring.id ---
  const wiringId = skin.wiring?.id;
  ctx.skinWiringId = wiringId;
  if (typeof wiringId === "string" && WIRING_ID_RE.test(wiringId)) report.ok("skin.wiring.id regex", wiringId);
  else report.failure("skin.wiring.id regex", `must match ${WIRING_ID_RE} (got ${JSON.stringify(wiringId)})`);

  // --- bodyAttr ---
  if (typeof skin.bodyAttr === "string" && BODY_ATTR_RE.test(skin.bodyAttr)) report.ok("skin.bodyAttr regex", skin.bodyAttr);
  else report.failure("skin.bodyAttr regex", `must match ${BODY_ATTR_RE} (got ${JSON.stringify(skin.bodyAttr)})`);

  // --- dshCompatibility ---
  if (typeof skin.dshCompatibility === "string" && DSH_COMPAT_RE.test(skin.dshCompatibility)) {
    report.ok("skin.dshCompatibility regex", skin.dshCompatibility);
    if (skin.dshCompatibility === TARGET_DSH_COMPAT) report.ok("skin.dshCompatibility runtime", `declares the running ${TARGET_DSH_VERSION}`);
    else report.warning("skin.dshCompatibility runtime", `declares ${skin.dshCompatibility}, running version maps to ${TARGET_DSH_COMPAT}`);
  } else {
    report.failure("skin.dshCompatibility regex", `must match ${DSH_COMPAT_RE} (got ${JSON.stringify(skin.dshCompatibility)})`);
  }

  // --- accent ---
  if (typeof skin.accent === "string" && ACCENT_RE.test(skin.accent)) report.ok("skin.accent", skin.accent);
  else report.failure("skin.accent", `must be #rrggbb (got ${JSON.stringify(skin.accent)})`);

  // --- order ---
  if (typeof skin.order === "number" && Number.isFinite(skin.order)) report.ok("skin.order", String(skin.order));
  else report.failure("skin.order", `must be a finite number (got ${JSON.stringify(skin.order)})`);

  // --- preview images ---
  checkSkinRelativeFile(report, ctx, "preview.light", skin.preview?.light, /\.(webp|png)$/i);
  checkSkinRelativeFile(report, ctx, "preview.dark", skin.preview?.dark, /\.(webp|png)$/i);

  // --- desktop icon ---
  checkDesktopIcon(report, ctx, skin.desktopIcon);

  // --- optional metadata notes ---
  const optionalStrings = ["nameEn", "tagline", "taglineEn", "description", "author"];
  const missingOptional = optionalStrings.filter((key) => typeof skin[key] !== "string" || skin[key].trim() === "");
  if (missingOptional.length > 0) report.info("skin.json optional metadata", `missing: ${missingOptional.join(", ")}`);
  else report.ok("skin.json optional metadata", "nameEn/tagline/description/author present");
}

function checkSkinRelativeFile(report, ctx, label, value, extensionRe) {
  if (typeof value !== "string" || value.trim() === "") {
    report.failure(label, "must be a non-empty package-relative path string");
    return;
  }
  const resolution = resolvePackagePath(ctx.packageDir, value);
  if (!resolution.inside) return void report.failure(label, pathEscapesMessage(label, value));
  if (!existsSync(resolution.absolute)) return void report.failure(label, `${value} does not exist`);
  const stat = statSync(resolution.absolute);
  if (!stat.isFile()) return void report.failure(label, `${value} is not a regular file`);
  if (!extensionRe.test(value)) return void report.warning(label, `${value} is not a .webp/.png preview image`);
  report.ok(label, `${value} (${formatBytes(stat.size)})`);
}

function checkDesktopIcon(report, ctx, value) {
  if (typeof value !== "string" || value.trim() === "") {
    report.warning("skin.desktopIcon", "no desktopIcon declared (manager falls back to the official shortcut icon)");
    return;
  }
  if (!/\.ico$/i.test(value)) {
    report.warning("skin.desktopIcon", `${value} does not end in .ico (Windows shortcuts expect an ICO)`);
  }
  const resolution = resolvePackagePath(ctx.packageDir, value);
  if (!resolution.inside) return void report.failure("skin.desktopIcon", pathEscapesMessage("desktopIcon", value));
  if (!existsSync(resolution.absolute)) return void report.failure("skin.desktopIcon", `${value} does not exist`);
  const stat = statSync(resolution.absolute);
  if (!stat.isFile()) return void report.failure("skin.desktopIcon", `${value} is not a regular file`);
  const magic = readFileSync(resolution.absolute).subarray(0, ICO_MAGIC.length);
  if (magic.equals(ICO_MAGIC)) report.ok("skin.desktopIcon ICO magic", `${value} (00 00 01 00, ${formatBytes(stat.size)})`);
  else report.failure("skin.desktopIcon ICO magic", `${value} does not start with 00 00 01 00`);
}

function checkRuntimeAssets(report, ctx) {
  const runtimeDir = join(ctx.packageDir, "assets/runtime");
  if (!existsSync(runtimeDir) || !statSync(runtimeDir).isDirectory()) {
    report.failure("assets/runtime directory", `missing ${runtimeDir}`);
    return;
  }
  const manifestFile = join(runtimeDir, "manifest.json");
  let manifest;
  if (!existsSync(manifestFile)) {
    report.failure("runtime manifest.json", "missing assets/runtime/manifest.json");
    return;
  }
  try {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8").replaceAll("\r\n", "\n"));
  } catch (error) {
    report.failure("runtime manifest.json parses", error instanceof Error ? error.message : String(error));
    return;
  }
  if (!Array.isArray(manifest)) {
    report.failure("runtime manifest.json shape", "manifest.json must be a JSON array of file names");
    return;
  }
  ctx.runtimeManifest = manifest;

  const invalidEntries = manifest.filter((entry) => typeof entry !== "string" || !MANIFEST_ENTRY_RE.test(entry));
  if (invalidEntries.length === 0) {
    report.ok("manifest entries regex", `${manifest.length} entries match ^[a-f0-9]{64}\\.(webp|png)$`);
  } else {
    report.failure(
      "manifest entries regex",
      `${invalidEntries.length} invalid entr(y/ies): ${invalidEntries.map((entry) => JSON.stringify(entry)).join(", ")}`,
    );
  }

  const duplicates = manifest.filter((entry, index) => manifest.indexOf(entry) !== index);
  const uniqueDuplicates = [...new Set(duplicates)];
  if (uniqueDuplicates.length === 0) report.ok("manifest entries unique", "each file listed once");
  else report.failure("manifest entries unique", `duplicated entries: ${uniqueDuplicates.join(", ")}`);

  // --- each manifest entry: exists + sha256(content) === name prefix ---
  const hashMismatches = [];
  const missing = [];
  let totalBytes = 0;
  let magicMismatches = [];
  for (const entry of uniqueEntries(manifest.filter((value) => typeof value === "string"))) {
    const match = ASSET_FILE_RE.exec(entry);
    if (match === null) continue;
    const file = join(runtimeDir, entry);
    if (!existsSync(file)) {
      missing.push(entry);
      continue;
    }
    const bytes = readFileSync(file);
    totalBytes += bytes.length;
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== match[1]) hashMismatches.push(`${entry} (content sha256 ${digest.slice(0, 12)}... != name)`);
    const kind = imageKind(bytes.subarray(0, 512));
    const expectedKind = match[2] === "webp" ? "webp" : "png";
    if (kind !== expectedKind) magicMismatches.push(`${entry} is ${kind} bytes but .${match[2]}`);
  }
  if (missing.length === 0) report.ok("manifest files exist", `all ${uniqueEntries(manifest.filter((value) => typeof value === "string")).length} files present`);
  else report.failure("manifest files exist", `missing: ${missing.join(", ")}`);
  if (hashMismatches.length === 0) report.ok("asset sha256", "name prefix === sha256(content) for every asset");
  else report.failure("asset sha256", hashMismatches.join("; "));

  // --- every file in the directory is listed exactly once; reject unknown extensions ---
  const dirFiles = readdirSync(runtimeDir, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isFile: entry.isFile() }))
    .filter((entry) => entry.name !== "manifest.json");
  const listed = new Set(uniqueEntries(manifest.filter((value) => typeof value === "string")));
  const unlisted = dirFiles.filter((entry) => !listed.has(entry.name) || !entry.isFile).map((entry) => entry.name);
  const unknownExtension = dirFiles.filter((entry) => entry.isFile && !MANIFEST_ENTRY_RE.test(entry.name)).map((entry) => entry.name);
  if (unlisted.length === 0) report.ok("directory listing coverage", "every runtime file is listed exactly once");
  else report.failure("directory listing coverage", `unlisted/extra files: ${unlisted.join(", ")}`);
  if (unknownExtension.length === 0) report.ok("asset extensions", "only content-addressed .webp/.png files");
  else report.failure("asset extensions", `unknown extensions: ${unknownExtension.join(", ")}`);

  if (magicMismatches.length === 0) report.ok("asset magic bytes", "file signature matches extension");
  else report.warning("asset magic bytes", magicMismatches.join("; "));

  report.ok("runtime asset summary", `${uniqueEntries(manifest.filter((value) => typeof value === "string")).length} assets, ${formatBytes(totalBytes)} total`);
}

function uniqueEntries(values) {
  return [...new Set(values)];
}

function checkHostEntry(report, ctx) {
  const file = join(ctx.packageDir, "lib/index.js");
  if (!existsSync(file)) {
    report.failure("lib/index.js exists", "missing lib/index.js (host half)");
    return;
  }
  const loaded = loadText(file);
  if (!loaded.ok) {
    report.failure("lib/index.js reads", loaded.error);
    return;
  }
  const text = loaded.text;
  ctx.indexText = text;

  const skinId = ctx.skinValue?.id;
  if (typeof skinId === "string") {
    const needle = `installSkinAssets(ctx, "${skinId}"`;
    if (text.includes(needle)) report.ok("installSkinAssets id", needle);
    else report.failure("installSkinAssets id", `expected literal \`${needle}\` in lib/index.js`);
  } else {
    report.failure("installSkinAssets id", "skin.json#id unavailable, cannot verify the host asset route");
  }

  // --- manifest literal embedded in the host entry ---
  const manifestLiteral = /\b(?:var|const|let)\s+manifest_default\s*=\s*(\[[\s\S]*?\]);/.exec(text);
  if (manifestLiteral === null) {
    report.failure("embedded manifest", "no `manifest_default = [...]` literal in lib/index.js");
  } else if (!Array.isArray(ctx.runtimeManifest)) {
    report.warning("embedded manifest", "manifest.json unavailable, cannot compare the embedded allowlist");
  } else {
    let embedded = null;
    try {
      embedded = JSON.parse(manifestLiteral[1]);
    } catch (error) {
      report.failure("embedded manifest", `manifest literal is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (Array.isArray(embedded)) {
      const actual = ctx.runtimeManifest.filter((entry) => typeof entry === "string");
      const sameOrder = embedded.length === actual.length && embedded.every((entry, index) => entry === actual[index]);
      const sameSet = embedded.length === actual.length && new Set(embedded).size === new Set(actual).size &&
        embedded.every((entry) => actual.includes(entry));
      if (sameOrder) report.ok("embedded manifest", `${embedded.length} names match assets/runtime/manifest.json in order`);
      else if (sameSet) report.warning("embedded manifest", "same asset set but different order than manifest.json");
      else {
        const missing = actual.filter((entry) => !embedded.includes(entry));
        const extra = embedded.filter((entry) => !actual.includes(entry));
        report.failure(
          "embedded manifest",
          `differs from manifest.json (missing ${missing.length}, extra ${extra.length})${missing.length ? `; missing: ${missing.slice(0, 3).join(", ")}` : ""}`,
        );
      }
    }
  }

  // --- content-addressed filename guard ---
  if (text.includes("^[a-f0-9]{64}\\.(png|webp)$")) report.ok("asset-name guard", "legacy path regex /^[a-f0-9]{64}\\.(png|webp)$/ in lib/index.js");
  else report.failure("asset-name guard", "lib/index.js does not guard file names with /^[a-f0-9]{64}\\.(png|webp)$/");

  // --- no absolute filesystem paths in shipped code ---
  const absolutePaths = [
    ...collectMatches(text, /(?:^|[^A-Za-z0-9_])([A-Za-z]:[\\/][^\s"'`;)]*)/gm),
    ...collectMatches(text, /\bfile:\/\/\/[^\s"'`;)]*/g),
  ];
  if (absolutePaths.length === 0) report.ok("no absolute paths", "lib/index.js contains no drive-letter or file:// paths");
  else {
    const detail = absolutePaths.slice(0, 5).map(({ match, line }) => `line ${line}: ${tail(match[0], 80)}`).join("; ");
    report.failure("no absolute paths", detail);
  }

  if (/\bexport\s*\{[^}]*\bapply\b[^}]*\}/.test(text)) report.ok("apply export", "lib/index.js exports apply");
  else report.warning("apply export", "no `export { apply }` found in lib/index.js");

  if (text.includes("../assets/runtime/")) report.ok("runtime directory URL", "resolves new URL(\"../assets/runtime/\", import.meta.url)");
  else report.warning("runtime directory URL", "lib/index.js does not reference ../assets/runtime/");
}

function checkClientEntry(report, ctx) {
  const file = join(ctx.packageDir, "lib/client.js");
  if (!existsSync(file)) {
    report.failure("lib/client.js exists", "missing lib/client.js (browser half)");
    return;
  }

  // --- syntax check through the same Node binary (browser JS is parseable ES) ---
  let checkSkipped = false;
  try {
    execFileSync(process.execPath, ["--check", file], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
    });
    report.ok("lib/client.js syntax", "node --check passed");
  } catch (error) {
    const code = error?.code;
    if (code === "EPERM" || code === "EACCES") {
      checkSkipped = true;
      report.warning("lib/client.js syntax", `skipped: spawning node --check was blocked (${code})`);
    } else {
      const stderr = error?.stderr ?? error?.message ?? String(error);
      report.failure("lib/client.js syntax", `node --check failed: ${tail(stderr, 500)}`);
    }
  }
  if (checkSkipped) ctx.clientSyntaxSkipped = true;

  const loaded = loadText(file);
  if (!loaded.ok) {
    report.failure("lib/client.js reads", loaded.error);
    return;
  }
  const text = loaded.text;
  ctx.clientText = text;

  // --- ModuleLoader factory id === package name ---
  const loaderMatch = /__ModuleLoader__\s*\.\s*load\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["']([^"']+)["']/.exec(text);
  if (loaderMatch === null) {
    report.failure("ModuleLoader id", "no window.__ModuleLoader__.load({ id: ... }) factory found");
  } else if (loaderMatch[1] === ctx.pkgName) {
    report.ok("ModuleLoader id", `${loaderMatch[1]} === package name`);
  } else {
    report.failure("ModuleLoader id", `factory id ${JSON.stringify(loaderMatch[1])} !== package name ${JSON.stringify(ctx.pkgName)}`);
  }
  if (/\bfactory\s*:\s*\(/.test(text)) report.ok("ModuleLoader factory", "factory(require) present");
  else report.warning("ModuleLoader factory", "no factory(require) arrow found");

  // --- remote URLs / fetches (presentation bundle must stay same-origin) ---
  const urls = collectMatches(text, /https?:\/\/[^\s"'`)\]}>]+/g);
  const benign = urls.filter(({ match }) => /^https?:\/\/www\.w3\.org\//.test(match[0]));
  const suspicious = urls.filter(({ match }) => !/^https?:\/\/www\.w3\.org\//.test(match[0]));
  if (urls.length === 0) report.ok("no remote URLs", "no http(s) literals in lib/client.js");
  else if (suspicious.length === 0) report.ok("no remote URLs", `only ${benign.length} XML namespace URI(s) (www.w3.org), no remote assets`);
  else {
    const detail = suspicious.slice(0, 5).map(({ match, line }) => `line ${line}: ${tail(match[0], 90)}`).join("; ");
    report.warning("no remote URLs", detail);
  }
  const fetchCalls = collectMatches(text, /\bfetch\s*\(/g);
  if (fetchCalls.length === 0) report.ok("no remote fetch", "no fetch() calls in lib/client.js");
  else report.warning("no remote fetch", `${fetchCalls.length} fetch() call(s) at line(s) ${fetchCalls.slice(0, 5).map(({ line }) => line).join(", ")}`);

  // --- /skin-assets/<id>/ route use ---
  const skinId = ctx.skinValue?.id;
  const assetRoute = checkAssetRouteUsage(text, skinId);
  if (assetRoute.status === "ok") report.ok("skin-assets route", assetRoute.detail);
  else if (assetRoute.status === "warn") report.warning("skin-assets route", assetRoute.detail);
  else report.failure("skin-assets route", assetRoute.detail);

  // --- document.title override hygiene ---
  const titleLines = collectMatches(text, /\bdocument\.title\b/g);
  if (titleLines.length === 0) {
    report.ok("document.title", "does not override document.title");
  } else {
    const savesOriginal = /(?:const|let|var)\s+\w+\s*=\s*document\.title\b/.test(text);
    const restores = /\bdocument\.title\s*=\s*(?:original|saved|previous)\w*\b/i.test(text);
    if (savesOriginal && restores) {
      report.ok("document.title", `saves and restores the host title (${titleLines.length} reference(s))`);
    } else {
      report.warning(
        "document.title",
        `touches document.title at line(s) ${titleLines.slice(0, 4).map(({ line }) => line).join(", ")} without an evident save+restore pair`,
      );
    }
  }

  // --- local DOM carrier / cleanup signals ---
  const bodyAttr = ctx.skinValue?.bodyAttr;
  const carrierSignals = [];
  if (typeof bodyAttr === "string" && text.includes(bodyAttr)) carrierSignals.push(`bodyAttr ${bodyAttr}`);
  const bodyAttrVar = /\bBODY_ATTR\b/.test(text) || /\bbodyAttr\b/.test(text);
  if (bodyAttrVar) carrierSignals.push("BODY_ATTR constant");
  if (/ctx\.effect\s*\(/.test(text)) carrierSignals.push(`${collectMatches(text, /ctx\.effect\s*\(/g).length} ctx.effect registrations`);
  if (/\bMutationObserver\b/.test(text)) carrierSignals.push(`${collectMatches(text, /new MutationObserver\s*\(/g).length} MutationObserver(s)`);
  if (carrierSignals.length > 0) report.ok("client integration signals", carrierSignals.join(", "));
  else report.warning("client integration signals", "no bodyAttr / ctx.effect / MutationObserver signals found");

  // --- referenced asset names must exist in this package's manifest ---
  const referenced = uniqueEntries((text.match(/\b[a-f0-9]{64}\.(?:webp|png)\b/g) ?? []));
  if (!Array.isArray(ctx.runtimeManifest)) {
    report.warning("client asset references", "manifest.json unavailable, cannot verify referenced hashes");
  } else {
    const listed = new Set(ctx.runtimeManifest.filter((entry) => typeof entry === "string"));
    const missing = referenced.filter((entry) => !listed.has(entry));
    if (missing.length === 0) report.ok("client asset references", `${referenced.length} referenced asset hash(es) all listed in manifest.json`);
    else report.failure("client asset references", `referenced but not in manifest.json: ${missing.join(", ")}`);
  }
}

function checkAssetRouteUsage(text, skinId) {
  if (typeof skinId !== "string") return { status: "fail", detail: "skin.json#id unavailable" };
  if (text.includes(`/skin-assets/${skinId}/`) || text.includes(`skin-assets/${skinId}/`)) {
    return { status: "ok", detail: `literal skin-assets/${skinId}/ route` };
  }
  const variable = /skin-assets\/\$\{([A-Za-z_$][\w$]*)\}\//.exec(text);
  if (variable !== null) {
    const name = variable[1];
    const boundToSkinId =
      new RegExp(`(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=\\s*(?:CONFIG\\.id|["']${escapeRegExp(skinId)}["'])`).test(text) &&
      (text.includes(`"id":"${skinId}"`) || text.includes(`"id": "${skinId}"`));
    if (boundToSkinId) return { status: "ok", detail: `route built from ${name} (= CONFIG.id "${skinId}")` };
    return { status: "warn", detail: `skin-assets route uses variable ${name} but its binding to "${skinId}" is not evident` };
  }
  return { status: "fail", detail: `lib/client.js does not reference skin-assets/${skinId}/` };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkLocaleFiles(report, ctx) {
  let allOk = true;
  for (const code of ["en", "zh"]) {
    const file = join(ctx.packageDir, "locale", `${code}.json`);
    if (!existsSync(file)) {
      allOk = false;
      report.failure(`locale/${code}.json`, "file is missing");
      continue;
    }
    const loaded = loadJson(file);
    if (!loaded.ok) {
      allOk = false;
      report.failure(`locale/${code}.json parses`, loaded.error);
      continue;
    }
    const meta = loaded.value?.meta;
    const problems = [];
    if (!isPlainObject(meta)) problems.push("meta object missing");
    else {
      if (typeof meta.title !== "string" || meta.title.trim() === "") problems.push("meta.title missing/empty");
      if (typeof meta.description !== "string" || meta.description.trim() === "") problems.push("meta.description missing/empty");
    }
    if (problems.length === 0) report.ok(`locale/${code}.json`, "meta.title + meta.description present");
    else {
      allOk = false;
      report.failure(`locale/${code}.json`, problems.join("; "));
    }
  }
  if (allOk) report.ok("locale files", "en + zh metadata complete");
}

function checkSkinBuild(report, ctx) {
  const file = join(ctx.packageDir, "skin.build.json");
  if (!existsSync(file)) {
    report.info("skin.build.json", "absent (optional; manager then falls back to git or the install source)");
    return;
  }
  const loaded = loadJson(file);
  if (!loaded.ok) {
    report.failure("skin.build.json parses", loaded.error);
    return;
  }
  const meta = loaded.value;
  if (!isPlainObject(meta)) {
    report.failure("skin.build.json shape", "top-level JSON value is not an object");
    return;
  }
  const problems = [];
  if (meta.schema !== 1) problems.push(`schema must be 1 (got ${JSON.stringify(meta.schema)})`);
  if (typeof meta.fingerprint !== "string" || !SHA256_HEX_RE.test(meta.fingerprint)) {
    problems.push("fingerprint must be 64 lowercase hex chars");
  }
  if (typeof meta.repository !== "string" || !REPO_SLUG_RE.test(meta.repository)) {
    problems.push(`repository must look like owner/repo (got ${JSON.stringify(meta.repository)})`);
  }
  if (typeof meta.path !== "string" || !SAFE_REL_PATH_RE.test(meta.path) || meta.path === "") {
    problems.push(`path must be a safe repo-relative path (got ${JSON.stringify(meta.path)})`);
  }
  if (meta.sourceCommit !== undefined && (typeof meta.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(meta.sourceCommit))) {
    problems.push("sourceCommit must be a 40-char lowercase git hash when present");
  }
  if (problems.length > 0) {
    report.failure("skin.build.json metadata", problems.join("; "));
  } else {
    report.ok("skin.build.json metadata", `schema 1, repository ${meta.repository}, path ${meta.path}`);
  }

  if (typeof meta.fingerprint !== "string" || !SHA256_HEX_RE.test(meta.fingerprint)) return;
  try {
    const computed = computeSkinFingerprint(ctx.packageDir);
    if (computed === meta.fingerprint) {
      report.ok("skin.build.json fingerprint", `matches manager computeSkinFingerprint (${computed.slice(0, 12)}...)`);
    } else {
      report.failure(
        "skin.build.json fingerprint",
        `mismatch: computed ${computed.slice(0, 16)}..., skin.build.json ${meta.fingerprint.slice(0, 16)}...`,
      );
    }
  } catch (error) {
    report.failure("skin.build.json fingerprint", `cannot recompute: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Package driver
// ---------------------------------------------------------------------------
function verifyPackage(packageDir) {
  const report = new Report(packageDir);
  const ctx = { packageDir, pkgName: basename(packageDir) };

  // Load the two metadata files up front so cross-file checks can reference both.
  const pkg = loadJson(join(packageDir, "package.json"));
  if (pkg.ok && isPlainObject(pkg.value) && typeof pkg.value.name === "string" && pkg.value.name.trim() !== "") {
    ctx.pkgName = pkg.value.name;
  }
  const skin = loadJson(join(packageDir, "skin.json"));
  ctx.pkg = pkg;
  ctx.skin = skin;
  // Expose skin.json values early: the bundle-patch phase needs wiring.id and
  // the client phase needs bodyAttr/id, and those checks run before checkSkinJson.
  if (skin.ok && isPlainObject(skin.value)) {
    ctx.skinValue = skin.value;
    if (typeof skin.value.wiring?.id === "string") ctx.skinWiringId = skin.value.wiring.id;
  }

  checkPackageJson(report, ctx);
  checkBundlePatch(report, ctx);
  checkSkinJson(report, ctx);
  checkRuntimeAssets(report, ctx);
  checkHostEntry(report, ctx);
  checkClientEntry(report, ctx);
  checkLocaleFiles(report, ctx);
  checkSkinBuild(report, ctx);

  // Package-level one-line identity summary.
  const id = typeof ctx.skinValue?.id === "string" ? ctx.skinValue.id : "<unknown id>";
  const order = typeof ctx.skinValue?.order === "number" ? ctx.skinValue.order : "?";
  report.info("package identity", `id=${id}, package=${ctx.pkgName}, order=${order}, dsh target=${TARGET_DSH_VERSION}`);

  return report;
}

function printReport(report) {
  console.log("");
  console.log(`=== ${report.packageDir} ===`);
  const width = Math.max(...report.rows.map((row) => row.check.length), 0);
  for (const row of report.rows) {
    const check = row.check.padEnd(width, " ");
    const detail = row.detail === undefined ? "" : `  - ${row.detail}`;
    console.log(`${row.level.padEnd(4)}  ${check}${detail}`);
  }
}

function summarize(reports) {
  const totals = reports.reduce(
    (sum, report) => ({
      pass: sum.pass + report.pass,
      warn: sum.warn + report.warn,
      fail: sum.fail + report.fail,
      note: sum.note + report.note,
    }),
    { pass: 0, warn: 0, fail: 0, note: 0 },
  );

  console.log("");
  console.log("=".repeat(78));
  console.log("SUMMARY");
  console.log(`  packages checked : ${reports.length}`);
  console.log(`  PASS             : ${totals.pass}`);
  console.log(`  WARN             : ${totals.warn}`);
  console.log(`  FAIL             : ${totals.fail}`);
  console.log(`  NOTE             : ${totals.note}`);
  console.log("");
  for (const report of reports) {
    const state = report.fail > 0 ? "FAIL" : "PASS";
    console.log(
      `  ${state.padEnd(4)}  ${report.packageDir}` +
        `  (PASS ${report.pass}, WARN ${report.warn}, FAIL ${report.fail})`,
    );
  }
  console.log("");
  console.log(`  RESULT: ${totals.fail === 0 ? "PASS" : "FAIL"}${totals.fail === 0 ? "" : ` - ${totals.fail} failing check(s)`}`);
  console.log("=".repeat(78));
  return totals;
}

function discoverPackages(scanRoot) {
  if (!existsSync(scanRoot)) return [];
  const found = [];
  for (const entry of readdirSync(scanRoot, { withFileTypes: true })) {
    const candidate = join(scanRoot, entry.name);
    let isDirectory = entry.isDirectory();
    if (!isDirectory && entry.isSymbolicLink()) {
      try {
        isDirectory = statSync(candidate).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (!isDirectory) continue;
    if (existsSync(join(candidate, "package.json")) || existsSync(join(candidate, "skin.json"))) found.push(candidate);
  }
  return found.sort();
}

function resolveArgument(argument) {
  const absolute = isAbsolute(argument) ? resolve(argument) : resolve(process.cwd(), argument);
  if (existsSync(absolute)) return absolute;
  const fromRepoRoot = resolve(REPO_ROOT, argument);
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  return absolute;
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const unknownFlags = argv.filter((argument) => argument.startsWith("-"));
  if (unknownFlags.length > 0) {
    console.error(`Unknown option(s): ${unknownFlags.join(", ")}\n`);
    console.error(USAGE);
    return 2;
  }

  const args = argv.filter((argument) => !argument.startsWith("-"));
  const packageDirs = args.length > 0 ? args.map(resolveArgument) : discoverPackages(PKG_SCAN_ROOT);
  if (packageDirs.length === 0) {
    console.error(
      args.length > 0
        ? `No package directories given: ${args.join(", ")}`
        : `No packages found under ${PKG_SCAN_ROOT}/* (build the packages first, or pass package dirs as argv).`,
    );
    return 2;
  }

  console.log("DSH skin plugin verifier");
  console.log(`  target DSH version : ${TARGET_DSH_VERSION} (dshCompatibility ${TARGET_DSH_COMPAT})`);
  console.log(`  repo root          : ${REPO_ROOT}`);
  console.log(`  mode               : ${args.length > 0 ? "argv package dirs" : "auto-scan packages/*"}`);
  console.log(`  validation         : read-only static checks (no install, no network)`);

  const reports = packageDirs.map(verifyPackage);
  for (const report of reports) printReport(report);
  const totals = summarize(reports);
  return totals.fail === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
