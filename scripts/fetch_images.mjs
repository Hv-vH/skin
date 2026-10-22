#!/usr/bin/env node
/**
 * DSH skin asset harvester.
 *
 * Usage (proxy is provided through the environment by the caller):
 *   $env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:NODE_USE_ENV_PROXY="1"
 *   node scripts/fetch_images.mjs --subject=lusi --pages=2 --max-per-query=40
 *
 * Sources: DuckDuckGo image API (primary), Bing image search (fallback).
 * Output : raw/<subject>/<seq>_<host>_<sha8>.<ext>
 * Ledger : sources/sources.csv (appended, resumable)
 * Skip   : blocklisted hosts, non-image payloads, undersized images, duplicates
 */

import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Flipped to true once DuckDuckGo answers 403/429, so the rest of the run skips it. */
let ddgDisabled = false;

const SUBJECTS = {
  lusi: {
    label: "赵露思",
    // [query, tier] — glam queries are stored separately for review.
    queries: [
      ["赵露思 写真 高清", "curated"],
      ["赵露思 生图 高清", "curated"],
      ["赵露思 活动 高清", "curated"],
      ["赵露思 红毯 礼服", "curated"],
      ["赵露思 杂志 封面", "curated"],
      ["赵露思 时尚大片", "curated"],
      ["赵露思 街拍 高清", "curated"],
      ["赵露思 手机壁纸", "curated"],
      ["赵露思 泳装", "glam"],
      ["赵露思 吊带 写真", "glam"],
    ],
  },
  yua: {
    label: "三上悠亚",
    queries: [
      ["三上悠亜", "curated"],
      ["三上悠亜 2024", "curated"],
      ["三上悠亜 2025", "curated"],
      ["三上悠亜 イベント 写真", "curated"],
      ["三上悠亜 会見", "curated"],
      ["三上悠亜 受賞", "curated"],
      ["三上悠亜 写真集", "curated"],
      ["三上悠亜 杂志 表紙", "curated"],
      ["三上悠亜 イベント", "curated"],
      ["三上悠亜 私服", "curated"],
      ["三上悠亜 広告 イメージモデル", "curated"],
      ["三上悠亜 photobook", "curated"],
      ["三上悠亜 ワンピース", "curated"],
      ["三上悠亜 ドレス", "curated"],
      ["三上悠亜 ポートレート", "curated"],
      ["三上悠亜 高画質", "curated"],
      ["三上悠亜 水着 高画質", "glam"],
      ["三上悠亜 水着", "glam"],
      ["三上悠亜 ランジェリー", "glam"],
      ["三上悠亜 グラビア", "glam"],
      ["三上悠亚 写真 高清", "glam"],
      ["三上悠亜 ビキニ", "glam"],
    ],
  },
};

const DEFAULTS = {
  pages: 2,
  minSide: 1000,
  minPixels: 1_200_000,
  minBytes: 40 * 1024,
  maxBytes: 24 * 1024 * 1024,
  concurrency: 4,
  searchDelayMs: 3200,
  maxPerQuery: 40,
};

// ---------------------------------------------------------------- utilities

function parseArgs(argv) {
  const out = { ...DEFAULTS, subject: null, engines: ["bing", "ddg"], dry: false, only: null };
  for (const arg of argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    if (k === "subject") out.subject = v;
    else if (k === "only") out.only = v;
    else if (k === "pages") out.pages = Number(v);
    else if (k === "max-per-query") out.maxPerQuery = Number(v);
    else if (k === "min-side") out.minSide = Number(v);
    else if (k === "engines") out.engines = v.split(",");
    else if (k === "dry") out.dry = true;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Read image dimensions from magic bytes. Returns [w,h] or null when unsupported. */
function sniffDims(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
      }
      i += 2 + dv.getUint16(i + 2);
    }
    return null;
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return [dv.getUint32(16), dv.getUint32(20)];
  }
  const riff = Buffer.from(b.slice(0, 4)).toString("latin1");
  if (riff === "RIFF" && Buffer.from(b.slice(8, 12)).toString("latin1") === "WEBP") {
    const chunk = Buffer.from(b.slice(12, 16)).toString("latin1");
    if (chunk === "VP8X") {
      return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    }
    if (chunk === "VP8 ") {
      return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
    }
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
  }
  return null;
}

function extOf(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50) return "png";
  if (Buffer.from(b.slice(0, 4)).toString("latin1") === "RIFF") return "webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  return null;
}

async function loadBlocklist() {
  const file = join(ROOT, "scripts", "blocklist.txt");
  if (!existsSync(file)) return { hosts: [], words: [] };
  const raw = await readFile(file, "utf8");
  const hosts = [];
  const words = [];
  for (const line of raw.split(/\r?\n/)) {
    const v = line.trim();
    if (!v || v.startsWith("#")) continue;
    if (v.startsWith("!")) words.push(v.slice(1).toLowerCase());
    else hosts.push(v.toLowerCase());
  }
  return { hosts, words };
}

function blocked(entry, list) {
  const host = hostOf(entry.url);
  if (list.hosts.some((h) => host === h || host.endsWith("." + h))) return `host:${host}`;
  const text = `${entry.title || ""} ${entry.url}`.toLowerCase();
  const word = list.words.find((w) => text.includes(w));
  return word ? `word:${word}` : null;
}

// ------------------------------------------------------------------ engines

async function ddgSearch(query, pages, delayMs) {
  if (ddgDisabled) return [];
  const landing = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" }, signal: AbortSignal.timeout(25000) },
  );
  const html = await landing.text();
  const vqd = (html.match(/vqd=["']?([\d-]+)["']?/) || [])[1];
  if (!vqd) return [];

  const out = [];
  for (let page = 1; page <= pages; page++) {
    if (page > 1) await sleep(delayMs);
    const url =
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}` +
      `&vqd=${vqd}&f=,,,size:Large&p=${page}&s=${(page - 1) * 100}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://duckduckgo.com/", Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 403 || res.status === 429) {
        ddgDisabled = true;
        console.log("   ddg: rate-limited, disabling for this run");
        break;
      }
      if (!res.ok) break;
      const json = await res.json();
      const results = json?.results || [];
      if (!results.length) break;
      for (const r of results) {
        out.push({
          url: r.image,
          thumb: r.thumbnail,
          width: Number(r.width) || 0,
          height: Number(r.height) || 0,
          title: r.title || "",
          page: r.url || "",
          engine: "ddg",
        });
      }
    } catch {
      break;
    }
  }
  return out;
}

async function bingSearch(query, pages, delayMs) {
  const out = [];
  for (let page = 0; page < pages; page++) {
    if (page > 0) await sleep(delayMs);
    const first = page * 35 + 1;
    const url =
      `https://cn.bing.com/images/search?q=${encodeURIComponent(query)}` +
      `&qft=+filterui:imagesize-wallpaper&mkt=zh-CN&form=IRFLTR&first=${first}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", Referer: "https://cn.bing.com/images" },
        signal: AbortSignal.timeout(25000),
      });
      const html = await res.text();
      const urls = [...html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)].map((m) => m[1]);
      const titles = [...html.matchAll(/t&quot;:&quot;(.*?)&quot;/g)].map((m) => m[1]);
      urls.forEach((u, i) => {
        if (!/^https?:\/\//.test(u)) return;
        out.push({
          url: u.replace(/&amp;/g, "&"),
          width: 0,
          height: 0,
          title: titles[i] || "",
          page: "",
          engine: "bing",
        });
      });
    } catch {
      /* keep going with whatever we already collected */
    }
  }
  return out;
}

// ---------------------------------------------------------------- download

async function download(entry) {
  const attempts = [
    { Referer: entry.page || `https://${hostOf(entry.url)}/` },
    { Referer: `https://${hostOf(entry.url)}/` },
    {},
  ];
  for (const extra of attempts) {
    try {
      const res = await fetch(entry.url, {
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8", ...extra },
        signal: AbortSignal.timeout(25000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 1024) continue;
      return { buf, status: res.status };
    } catch {
      /* try the next referer shape */
    }
  }
  return null;
}

// -------------------------------------------------------------------- main

async function main() {
  const opt = parseArgs(process.argv);
  const names = opt.subject ? [opt.subject] : Object.keys(SUBJECTS);
  const blocklist = await loadBlocklist();
  const csvPath = join(ROOT, "sources", "sources.csv");
  const header =
    "id,subject,tier,query,engine,page_url,image_url,host,width_decl,height_decl," +
    "width_real,height_real,bytes,sha256,status,note";

  if (!existsSync(csvPath)) await writeFile(csvPath, header + "\n", "utf8");

  // Resume: remember both hashes and source urls already handled.
  const seenHashes = new Set();
  const seenUrls = new Set();
  if (existsSync(csvPath)) {
    const text = await readFile(csvPath, "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
      const clean = cells.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
      const [, , , , , , imageUrl, , , , , , , sha] = clean;
      if (sha) seenHashes.add(sha);
      if (imageUrl) seenUrls.add(imageUrl);
    }
  }

  const rows = [];
  let seq = 0;

  for (const name of names) {
    const subject = SUBJECTS[name];
    if (!subject) throw new Error(`unknown subject: ${name}`);
    const outDir = join(ROOT, "raw", name);
    await mkdir(outDir, { recursive: true });

    console.log(`\n### ${name} (${subject.label}) — ${subject.queries.length} queries`);

    for (const [query, tier] of subject.queries) {
      if (opt.only && !query.includes(opt.only)) continue;
      console.log(`\n-- ${query} [${tier}]`);
      let entries = [];
      for (const engine of opt.engines) {
        try {
          const found =
            engine === "ddg"
              ? await ddgSearch(query, opt.pages, opt.searchDelayMs)
              : await bingSearch(query, opt.pages, opt.searchDelayMs);
          console.log(`   ${engine}: ${found.length} raw results`);
          entries.push(...found);
        } catch (error) {
          console.log(`   ${engine}: failed (${error.message})`);
        }
        if (entries.length >= opt.maxPerQuery * 2) break;
        await sleep(opt.searchDelayMs);
      }

      // cheap pre-filters
      const candidates = [];
      const skipped = new Map();
      for (const entry of entries) {
        if (!entry.url || seenUrls.has(entry.url)) continue;
        if (
          entry.width &&
          entry.height &&
          (Math.min(entry.width, entry.height) < opt.minSide * 0.7 ||
            entry.width * entry.height < opt.minPixels * 0.6)
        ) {
          skipped.set("declared-too-small", (skipped.get("declared-too-small") || 0) + 1);
          continue;
        }
        const hit = blocked(entry, blocklist);
        if (hit) {
          skipped.set(hit, (skipped.get(hit) || 0) + 1);
          continue;
        }
        candidates.push(entry);
      }
      if (skipped.size) {
        console.log(`   skipped: ${[...skipped].map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }

      let kept = 0;
      const queue = candidates.slice(0, opt.maxPerQuery);
      const workers = Array.from({ length: opt.concurrency }, async () => {
        for (;;) {
          const entry = queue.shift();
          if (!entry) return;
          if (seenUrls.has(entry.url)) continue;
          seenUrls.add(entry.url);
          const got = await download(entry);
          if (!got) continue;
          const ext = extOf(got.buf);
          if (!ext || ext === "gif") continue;
          const dims = sniffDims(got.buf);
          if (!dims) continue;
          const [w, h] = dims;
          if (Math.min(w, h) < opt.minSide) continue;
          if (w * h < opt.minPixels) continue;
          if (got.buf.length < opt.minBytes || got.buf.length > opt.maxBytes) continue;
          const sha = createHash("sha256").update(got.buf).digest("hex");
          if (seenHashes.has(sha)) continue;
          seenHashes.add(sha);

          const host = hostOf(entry.url);
          seq += 1;
          const id = `${name}-${String(seq).padStart(4, "0")}`;
          const file = `${id}_${host.replace(/[^a-z0-9.-]/gi, "_")}_${sha.slice(0, 8)}.${ext}`;
          if (!opt.dry) {
            await writeFile(join(outDir, file), got.buf);
          }
          kept += 1;
          rows.push(
            [
              id,
              name,
              tier,
              query,
              entry.engine,
              entry.page || "",
              entry.url,
              host,
              entry.width || "",
              entry.height || "",
              w,
              h,
              got.buf.length,
              sha,
              "ok",
              file,
            ]
              .map(csvCell)
              .join(","),
          );
        }
      });
      await Promise.all(workers);
      console.log(`   kept: ${kept}`);

      if (rows.length >= 50) {
        if (!opt.dry) await appendFile(csvPath, rows.join("\n") + "\n", "utf8");
        rows.length = 0;
      }
    }
  }

  if (rows.length && !opt.dry) await appendFile(csvPath, rows.join("\n") + "\n", "utf8");
  console.log(`\nDone. new images: ${seq}${opt.dry ? " (dry run, nothing written)" : ""}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
