import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Excalidraw's published JS contains font URL strings, not imports that esbuild can inline.
// Data URLs use its supported font loader path and avoid registering its network fallback.
export async function embedExcalidrawFonts(js: string, packageRoot: string) {
  const pattern = /"(\.\/fonts\/[A-Za-z0-9_./-]+\.woff2)"/g;
  const paths = [...new Set([...js.matchAll(pattern)].map(match => match[1]))];
  if (!paths.length) throw new Error("Expected Excalidraw font references; review the pinned package's asset layout.");
  const embedded = new Map<string, string>();
  for (const path of paths) {
    if (path.split("/").includes("..")) throw new Error("Invalid Excalidraw font path.");
    const bytes = await readFile(join(packageRoot, "dist/prod", path));
    if (bytes.subarray(0, 4).toString("ascii") !== "wOF2") throw new Error(`Invalid WOFF2 font: ${path}`);
    embedded.set(path, `data:font/woff2;base64,${bytes.toString("base64")}`);
  }
  // Orca limits each checked script to 16 MiB. Keep the asset registry in 4 MiB chunks.
  const chunks: string[] = [];
  let entries: string[] = [], length = 0;
  const flush = () => {
    if (!entries.length) return;
    chunks.push(`globalThis.__specplannerFontAssets??={};Object.assign(globalThis.__specplannerFontAssets,{${entries.join(",")}});`);
    entries = []; length = 0;
  };
  for (const [path, uri] of embedded) {
    const entry = `${JSON.stringify(path)}:${JSON.stringify(uri)}`;
    if (entry.length > 4 * 1024 * 1024) throw new Error(`Font exceeds the asset chunk limit: ${path}`);
    if (length + entry.length > 4 * 1024 * 1024 - 1024) flush();
    entries.push(entry); length += entry.length + 1;
  }
  flush();
  return { js: js.replace(pattern, (_, path: string) => `globalThis.__specplannerFontAssets[${JSON.stringify(path)}]`), chunks, count: paths.length };
}
