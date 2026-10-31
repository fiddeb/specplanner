import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/cli.ts"], outfile: "dist/server.js", bundle: true, banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }, platform: "node", format: "esm", target: "node22" });
await build({ entryPoints: ["src/panel.tsx"], outfile: "dist/panel.js", bundle: true, platform: "browser", format: "iife", target: "es2022", conditions: ["production"], loader: { ".woff2": "dataurl", ".woff": "dataurl", ".png": "dataurl", ".svg": "dataurl" }, define: { "process.env.NODE_ENV": '"production"' }, minify: true });
const js = await readFile("dist/panel.js", "utf8");
const css = await readFile("dist/panel.css", "utf8");
await writeFile("dist/panel.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpecPlanner</title><style>${css}</style><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></html>`);
