import { readFile } from "node:fs/promises";
//#region ../shared/skin-assets.ts
/** Public, immutable artwork only. Paths come from the shipped allowlist, never from disk traversal. */
function installSkinAssets(ctx, id, directory, files) {
	const prefix = `/skin-assets/${id}`;
	const allowed = new Set(files);
	ctx.inject(["webServer"], (webCtx) => {
		const server = webCtx.get("webServer");
		webCtx.effect(() => server.register({
			kind: "prefix",
			path: prefix,
			handler: async (req, res) => {
				if (req.method !== "GET" && req.method !== "HEAD") {
					res.writeHead(405, { Allow: "GET, HEAD" }).end();
					return;
				}
				const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
				const file = pathname.slice(prefix.length + 1);
				if (!pathname.startsWith(`${prefix}/`) || !allowed.has(file) || !/^[a-f0-9]{64}\.(png|webp)$/.test(file)) {
					res.writeHead(404).end();
					return;
				}
				let bytes;
				try {
					bytes = await readFile(new URL(file, directory));
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
					res.writeHead(404).end();
					return;
				}
				const etag = `"${file.split(".")[0]}"`;
				const headers = {
					"Content-Type": file.endsWith(".webp") ? "image/webp" : "image/png",
					"Cache-Control": "public, max-age=31536000, immutable",
					"X-Content-Type-Options": "nosniff",
					ETag: etag
				};
				if (req.headers["if-none-match"]?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
					res.writeHead(304, headers).end();
					return;
				}
				res.writeHead(200, {
					...headers,
					"Content-Length": bytes.length
				});
				res.end(req.method === "HEAD" ? void 0 : bytes);
			}
		}), `${id}: packaged artwork`);
	});
}
//#endregion
//#region assets/runtime/manifest.json
var manifest_default = [
	"0319e8d74a4a7b255d62fe64204f14d31d4e35618fe526947b54e0a4192508c9.webp",
	"086113ef1bf448083951a8c5e857aa9e6ee2e5be216b64a73627b85e0e4eb7f9.webp",
	"3f2b59e2abcb878052d0ceda1898deb2da0b6b3208231e0b8f82da73a89a3f2c.webp",
	"4c0e9386db95ae064e06b2bc286dedd307c8a33e133d8bf125cc508e2ec8d251.webp",
	"69dcbf14771e056de6fbdb0c457f0e5e7f75f92854940c10b32dd05e22c303ff.png",
	"97b18ae23fd8e4b97f11a9c58f276792a2ecf12863f556981ab7f2eb6eb5946c.webp",
	"a49954317f48e4b6471126318effb5a9050b3d26f0e524d12a6499446484d539.png",
	"a4b7bc6433a2bac86c53f612666cb43d8c8f56b6a5eae834e25e8d0c6ce2f7c8.webp",
	"d03569e9da8999333523f8f624736c80fe526729622f5bf417314dd82f0c1a6e.webp",
	"dea633f5fdc381b6b2730803af820fdcdc444643d1195d7428b6810c25927eef.webp",
	"e346a0a480c092ff339c39f83acec103e790e583b7f1d7ae50655ff8a57761f3.webp",
	"e61ea4a75e2041757673daa4a44c4071a5e1d97705cef00b1626803bd0bbdc98.png",
	"e945a069d4537d34e5839395ca45a0a1389066d3e660bf3592db445057ddf4cf.webp",
	"f3cd419ac74839f595cb850ab67434cb3d34718c37ac6da2cb9496eac9e1b79b.png"
];
//#endregion
//#region src/index.ts
/** Serve only this package's immutable presentation assets while the skin is enabled. */
function apply(ctx) {
	installSkinAssets(ctx, "ivory-noir", new URL("../assets/runtime/", import.meta.url), manifest_default);
}
//#endregion
export { apply };
