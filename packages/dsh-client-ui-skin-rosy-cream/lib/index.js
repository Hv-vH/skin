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
	"06155cb49e2224800da0c3542854904e551e6b65dd3b338a97ed3f2a4d2401c3.webp",
	"20c87fe21fefb190cd3b3610787dfad6e5146ec64bf39868ef03d34424d017fa.png",
	"2713243d2ca7f729d54761785ea07b77e47f01446b93d7d340656c3c9aee49e6.webp",
	"2ce7c08bd849beccc8d292432f28a8a316cca25ce40251fcb121d6a27367c15e.webp",
	"568c53382eb2fbdfc219a3ba060edc3edec16e205dab5a2fbef8d56d9c98a652.webp",
	"5eba6c657d6aaa42d62aa1cb5edf7c43c204ad9fd03801dc200bcf659cf5d06e.png",
	"92a981ac57b754842527272446fbed25a81c202761133af014d08bdf7085b136.webp",
	"960aae166f9884fd0e45f83e0df27e89c854ed46abcd799bd90d0ba97a79e02a.webp",
	"9c16e966839922cbce6417c943bb85d91af5956f41ab99efe49bbbc51e6c363c.webp",
	"a7e8d7638a59a0baeeeb88b0b6151d811475e9a3b30098e84b19292d97aba53f.png",
	"b21c42b4ec61aa6fbd7ef68dcbf5d8c7f4f3126be83e805a920baf4a6a73f955.webp",
	"b3faee810b5bb5aa1c768533c6f18933fd4a593e147b4fc7fadee876272d7bbb.webp",
	"b41b35f88dc524b84b1c8e0ce43164e0523cde4250026e7f03e1e5d8c10b6a81.webp",
	"cd1e0e13a9025ba87e1a8ebd96db1a3d61ab0d9b1b358caa25eb206792e8f538.png"
];
//#endregion
//#region src/index.ts
/** Serve only this package's immutable presentation assets while the skin is enabled. */
function apply(ctx) {
	installSkinAssets(ctx, "rosy-cream", new URL("../assets/runtime/", import.meta.url), manifest_default);
}
//#endregion
export { apply };
