import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, join } from "node:path";

import { fileURLToPath } from "node:url";
import { writeThirdPartyNotices } from "./licenses.js";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const orca = JSON.parse(await readFile(new URL("orca-plugin.json", root), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid release version");
if (manifest.version !== pkg.version) throw new Error("Package and plugin versions must match");
if (orca.version !== pkg.version) throw new Error("Orca and Codex plugin versions must match");
const releases = new URL("releases/", root);
await mkdir(releases, { recursive: true });
const staging = await mkdtemp(new URL(".staging-", releases).pathname);
const target = new URL(`specplanner-${manifest.version}/`, releases);
try {
  for (const name of ["plugin.json", "mcp.json", "orca-plugin.json", "README.md", "LICENSE"]) {
    await cp(new URL(name, root), join(staging, name));
  }
  await cp(new URL("docs/", root), join(staging, "docs"), { recursive: true });
  await cp(new URL("skills/", root), join(staging, "skills"), { recursive: true });
  await cp(new URL("orca-tests/", root), join(staging, "orca-tests"), { recursive: true });
  await mkdir(join(staging, "dist"));
  await cp(new URL("dist/orca-fonts/", root), join(staging, "dist/orca-fonts"), { recursive: true });
  for (const name of ["server.js", "orca-worker.js", "panel.html", "orca-panel.html", "orca-panel.js"]) {
    await cp(new URL(`dist/${name}`, root), join(staging, "dist", name));
  }
  // Preserve the official CLI's layout: schemas are resolved relative to its modules.
  const modules = fileURLToPath(new URL("node_modules/", root));
  const copied = new Set<string>();
  async function copyDependency(name: string, from: string): Promise<void> {
    let cursor = from;
    let source = "";
    while (cursor === fileURLToPath(root).replace(/\/$/, "") || cursor.startsWith(fileURLToPath(root))) {
      const candidate = join(cursor, "node_modules", name);
      try { await readFile(join(candidate, "package.json")); source = candidate; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      cursor = dirname(cursor);
    }
    if (!source) throw new Error(`Missing runtime dependency: ${name}`);
    if (copied.has(source)) return;
    copied.add(source);
    const target = join(staging, "node_modules", relative(modules, source));
    // Runtime JS, metadata, schemas, templates and licenses retain their original layout.
    // Source files, declarations and source maps are not needed to execute the pinned CLI.
    await cp(source, target, { recursive: true, filter: path => path === source || (!relative(source, path).split("/").includes("node_modules") && !/\.(?:ts|mts|cts|map)$/.test(path)) });
    const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyDependency(dependency, source);
  }
  await copyDependency("@fission-ai/openspec", fileURLToPath(root));
  await writeThirdPartyNotices(fileURLToPath(root), staging, copied);
  await writeFile(join(staging, "package.json"), JSON.stringify({ name: "specplanner", version: manifest.version, private: true, type: "module", license: pkg.license, engines: pkg.engines }, null, 2));
  const entries = await readdir(staging, { recursive: true });
  let bytes = 0;
  for (const entry of entries) {
    const info = await stat(join(staging, entry));
    if (info.isFile()) {
      bytes += info.size;
      if (/\.(?:js|mjs|cjs|wasm)$/.test(entry) && info.size > 16 * 1024 * 1024) throw new Error(`Script or WASM exceeds Orca's 16 MiB checked-file limit: ${entry}`);
    }
  }
  if (entries.length > 2000 || bytes > 50 * 1024 * 1024 || (await stat(join(staging, orca.contributes.panels[0].entry))).size > 10 * 1024 * 1024) throw new Error("Package exceeds Orca's entry, total size or HTML entry limit.");
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  console.log(`Plugin package: ${target.pathname}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
