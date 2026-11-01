import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, join } from "node:path";

import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid release version");
const releases = new URL("releases/", root);
await mkdir(releases, { recursive: true });
const staging = await mkdtemp(new URL(".staging-", releases).pathname);
const target = new URL(`specplanner-${manifest.version}/`, releases);
try {
  for (const name of ["plugin.json", "mcp.json", "README.md"]) {
    await cp(new URL(name, root), join(staging, name));
  }
  await cp(new URL("docs/", root), join(staging, "docs"), { recursive: true });
  await mkdir(join(staging, "dist"));
  for (const name of ["server.js", "panel.html"]) {
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
    await cp(source, target, { recursive: true, filter: path => path === source || !relative(source, path).split("/").includes("node_modules") });
    const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyDependency(dependency, source);
  }
  await copyDependency("@fission-ai/openspec", fileURLToPath(root));
  await writeFile(join(staging, "package.json"), JSON.stringify({ name: "specplanner", version: manifest.version, private: true, type: "module", engines: { node: ">=22" } }, null, 2));
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  console.log(`Plugin package: ${target.pathname}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
