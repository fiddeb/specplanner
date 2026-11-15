import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const run = promisify(execFile);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Invalid release version");
const name = `specplanner-${pkg.version}`;
const releases = fileURLToPath(new URL("releases/", root));
const provenance = JSON.parse(await readFile(new URL(`releases/${name}/build-info.json`, root), "utf8"));
const sourceCommit = (await run("git", ["rev-parse", "HEAD"], { cwd: fileURLToPath(root) })).stdout.trim();
const dirty = (await run("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: fileURLToPath(root) })).stdout.trim();
if (dirty || provenance.sourceDirty || provenance.sourceCommit !== sourceCommit || provenance.version !== pkg.version) {
  throw new Error("Commit the release sources and rebuild/verify the package before creating an archive.");
}
await run("tar", ["-czf", `${name}.tar.gz`, name], { cwd: releases, env: { ...process.env, COPYFILE_DISABLE: "1" } });
const bytes = await readFile(new URL(`releases/${name}.tar.gz`, root));
const hash = createHash("sha256").update(bytes).digest("hex");
await writeFile(new URL("releases/SHA256SUMS", root), `${hash}  ${name}.tar.gz\n`);
console.log(`Release archive: releases/${name}.tar.gz (${bytes.length} bytes), source ${sourceCommit}`);
