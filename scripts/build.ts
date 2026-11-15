import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { embedExcalidrawFonts } from "./excalidraw-fonts.js";
await mkdir("dist", { recursive: true });
const server = await build({ entryPoints: ["src/cli.ts"], outfile: "dist/server.js", bundle: true, metafile: true, banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }, platform: "node", format: "esm", target: "node22" });
const worker = await build({ entryPoints: ["src/orca-worker.ts"], outfile: "dist/orca-worker.js", bundle: true, metafile: true, banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }, platform: "node", format: "esm", target: "node22" });
const panel = await build({ entryPoints: ["src/panel.tsx"], outfile: "dist/panel.js", bundle: true, metafile: true, platform: "browser", format: "iife", target: "es2022", conditions: ["production"], loader: { ".woff2": "dataurl", ".woff": "dataurl", ".png": "dataurl", ".svg": "dataurl" }, define: { "process.env.NODE_ENV": '"production"' }, minify: true });
const packages = new Set<string>();
for (const bundle of [server, worker, panel]) {
  for (const output of Object.values(bundle.metafile.outputs)) {
    for (const [input, retained] of Object.entries(output.inputs)) {
      if (!retained.bytesInOutput) continue;
      const parts = input.split("/");
      const index = parts.lastIndexOf("node_modules");
      if (index >= 0) packages.add(parts.slice(0, index + (parts[index + 1].startsWith("@") ? 3 : 2)).join("/"));
    }
  }
}
await writeFile("dist/bundled-packages.json", JSON.stringify([...packages].sort(), null, 2));
const js = await readFile("dist/panel.js", "utf8");
const css = await readFile("dist/panel.css", "utf8");
const page = (script: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpecPlanner</title><style>${css}</style><div id="root"></div>${script}</html>`;
await writeFile("dist/panel.html", page(`<script>${js.replaceAll("</script", "<\\/script")}</script>`));
const native = await embedExcalidrawFonts(js, "node_modules/@excalidraw/excalidraw");
await rm("dist/orca-fonts", { recursive: true, force: true });
await mkdir("dist/orca-fonts");
for (const [index, chunk] of native.chunks.entries()) await writeFile(`dist/orca-fonts/${index}.js`, chunk);
await writeFile("dist/orca-panel.js", native.js);
await writeFile("dist/orca-panel.html", page(native.chunks.map((_, index) => `<script src="./orca-fonts/${index}.js"></script>`).join("") + '<script src="./orca-panel.js"></script>'));
console.log(`Bundled ${native.count} Excalidraw font sources for Orca's offline panel.`);
