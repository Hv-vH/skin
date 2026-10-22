#!/usr/bin/env node
/**
 * Article harvester: finds entertainment/photobook articles through Bing web
 * search, then pulls the in-article images from those pages. This reaches
 * high-resolution press photos that the image index does not surface well.
 *
 *   node scripts/fetch_articles.mjs --subject=yua \
 *     --seed-queries="三上悠亜 写真集 発売,三上悠亜 イベント レポート"
 *
 *   node scripts/fetch_articles.mjs --subject=yua --urls="https://...,https://..."
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
const MIN_SIDE = 1200;
const MIN_BYTES = 60 * 1024;
const MAX_PAGES = 14;
const MAX_IMAGES_PER_PAGE = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

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
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [dv.getUint32(16), dv.getUint32(20)];
  if (Buffer.from(b.slice(0, 4)).toString("latin1") === "RIFF" && Buffer.from(b.slice(8, 12)).toString("latin1") === "WEBP") {
    const chunk = Buffer.from(b.slice(12, 16)).toString("latin1");
    if (chunk === "VP8X") return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    if (chunk === "VP8 ") return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
  }
  return null;
}

function extOf(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50) return "png";
  if (Buffer.from(b.slice(0, 4)).toString("latin1") === "RIFF") return "webp";
  return null;
}

async function fetchText(url, referer) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,ja;q=0.8", Referer: referer || url },
    signal: AbortSignal.timeout(25000),
    redirect: "follow",
  });
  return { status: res.status, body: await res.text() };
}

async function download(url, referer) {
  for (const ref of [referer, `https://${hostOf(url)}/`, ""]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", ...(ref ? { Referer: ref } : {}) },
        signal: AbortSignal.timeout(25000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 1024) continue;
      return buf;
    } catch {
      /* next referer */
    }
  }
  return null;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absolute(base, candidate) {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

function extractImages(html, pageUrl) {
  const found = new Set();
  const patterns = [
    /<img[^>]+?(?:data-src|data-original|data-lazy-src|data-actualsrc|src)\s*=\s*["']([^"']+)["']/gi,
    /"(https?:\/\/[^"\\]+?\.(?:jpg|jpeg|png|webp))"/gi,
    /url\(["']?(https?:\/\/[^"')]+?\.(?:jpg|jpeg|png|webp))["']?\)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = decodeEntities(match[1]);
      if (!/^https?:\/\//i.test(raw) && !raw.startsWith("//") && !raw.startsWith("/")) continue;
      if (/sprite|logo|icon|avatar|qrcode|placeholder|loading|blank|pixel|emoji|button|banner_ad/i.test(raw)) continue;
      const abs = absolute(pageUrl, raw.startsWith("//") ? `https:${raw}` : raw);
      if (!abs || !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(abs)) continue;
      found.add(abs);
    }
  }
  return [...found];
}

async function bingSeeds(query) {
  const url =
    `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=30&mkt=zh-CN&form=QBLH`;
  const { body } = await fetchText(url, "https://cn.bing.com/");
  const seeds = [];
  for (const match of body.matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/gi)) {
    const href = decodeEntities(match[1]);
    if (!/^https?:\/\//.test(href)) continue;
    if (/bing\.com|microsoft\.com|go\.microsoft/.test(href)) continue;
    seeds.push(href);
  }
  return seeds;
}

async function loadBlocklist() {
  const file = join(ROOT, "scripts", "blocklist.txt");
  if (!existsSync(file)) return { hosts: [], words: [] };
  const hosts = [];
  const words = [];
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const v = line.trim();
    if (!v || v.startsWith("#")) continue;
    if (v.startsWith("!")) words.push(v.slice(1).toLowerCase());
    else hosts.push(v.toLowerCase());
  }
  return { hosts, words };
}

function blockedHost(url, list) {
  const host = hostOf(url);
  return list.hosts.some((h) => host === h || host.endsWith("." + h));
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, "").split("=");
      return [k, rest.join("=")];
    }),
  );
  const subject = args.subject;
  if (!subject) throw new Error("--subject is required");

  const rawDir = join(ROOT, "raw", subject);
  await mkdir(rawDir, { recursive: true });
  const csvPath = join(ROOT, "sources", "sources.csv");
  if (!existsSync(csvPath)) {
    await writeFile(
      csvPath,
      "id,subject,tier,query,engine,page_url,image_url,host,width_decl,height_decl,width_real,height_real,bytes,sha256,status,note\n",
      "utf8",
    );
  }

  const blocklist = await loadBlocklist();
  const seen = new Set();
  for (const line of (await readFile(csvPath, "utf8")).split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts[13]) seen.add(parts[13]);
  }

  let seeds = [];
  if (args.urls) seeds.push(...args.urls.split(",").filter(Boolean));
  if (args["seed-queries"]) {
    for (const query of args["seed-queries"].split(",")) {
      const found = await bingSeeds(query).catch(() => []);
      console.log(`seed "${query}": ${found.length} pages`);
      seeds.push(...found);
      await sleep(3000);
    }
  }
  seeds = [...new Set(seeds)].filter((u) => !blockedHost(u, blocklist)).slice(0, MAX_PAGES);
  console.log(`pages to crawl: ${seeds.length}`);

  let seq = existsSync(rawDir) ? (await readFile(csvPath, "utf8")).split("\n").filter((l) => l.includes(`z${subject}-`)).length : 0;
  const rows = [];
  let kept = 0;

  for (const [index, page] of seeds.entries()) {
    let images = [];
    try {
      const { status, body } = await fetchText(page);
      if (status !== 200) {
        console.log(`  [${index + 1}/${seeds.length}] ${status} ${hostOf(page)}`);
        continue;
      }
      images = extractImages(body, page).slice(0, MAX_IMAGES_PER_PAGE);
      console.log(`  [${index + 1}/${seeds.length}] ${hostOf(page)}: ${images.length} candidate images`);
    } catch (error) {
      console.log(`  [${index + 1}/${seeds.length}] failed ${hostOf(page)} (${error.message.slice(0, 40)})`);
      continue;
    }

    for (const image of images) {
      const host = hostOf(image);
      if (!host || blockedHost(image, blocklist)) continue;
      const buf = await download(image, page);
      if (!buf) continue;
      const ext = extOf(buf);
      if (!ext) continue;
      const dims = sniffDims(buf);
      if (!dims || Math.min(dims[0], dims[1]) < MIN_SIDE) continue;
      if (buf.length < MIN_BYTES) continue;
      const sha = createHash("sha256").update(buf).digest("hex");
      if (seen.has(sha)) continue;
      seen.add(sha);
      seq += 1;
      const id = `${subject}-a${String(seq).padStart(4, "0")}`;
      const file = `${id}_${host.replace(/[^a-z0-9.-]/gi, "_")}_${sha.slice(0, 8)}.${ext}`;
      await writeFile(join(rawDir, file), buf);
      kept += 1;
      rows.push(
        [
          id,
          subject,
          "article",
          "",
          "article",
          page,
          image,
          host,
          "",
          "",
          dims[0],
          dims[1],
          buf.length,
          sha,
          "ok",
          file,
        ].join(","),
      );
    }
    await sleep(1500);
  }

  if (rows.length) await appendFile(csvPath, rows.join("\n") + "\n", "utf8");
  console.log(`\narticle harvest: ${kept} new images`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
