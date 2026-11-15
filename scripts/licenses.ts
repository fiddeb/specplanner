import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

type Notice = { path: string; sha256: string; source?: string; note?: string };
type VendorNotice = { file: string; sha256: string; source: string; note?: string };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const licenseName = /^(licen[sc]e|notice|copying|ofl)(?:[.\-_]|$)/i;

// Include embedded font and other asset notices as well as package-root licenses.
async function noticeFiles(root: string, path = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) found.push(...await noticeFiles(root, child));
    else if (entry.isFile() && licenseName.test(entry.name)) found.push(child);
  }
  return found.sort();
}

export async function writeThirdPartyNotices(root: string, target: string, runtimePackages: Iterable<string>) {
  const bundled: string[] = JSON.parse(await readFile(join(root, "dist/bundled-packages.json"), "utf8"));
  const vendors: Record<string, VendorNotice> = JSON.parse(await readFile(join(root, "licenses/vendor-sources.json"), "utf8"));
  const packages = [...new Set([...bundled.map(path => join(root, path)), ...runtimePackages])].sort();
  const manifest = [];
  const sections = ["Third-party software included in SpecPlanner. Each package retains its own license.\n"];
  await mkdir(join(target, "licenses"), { recursive: true });
  for (const directory of packages) {
    const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const id = `${pkg.name}@${pkg.version}`;
    const license = pkg.license ?? pkg.licenses?.map((item: { type: string }) => item.type).join(" OR ") ?? "See included license text";
    const texts: { path: string; text: string; source?: string; note?: string }[] = [];
    for (const path of await noticeFiles(directory)) texts.push({ path, text: await readFile(join(directory, path), "utf8") });
    if (!texts.some(item => !item.path.includes("/"))) {
      const vendor = vendors[id];
      if (vendor) {
        const text = await readFile(join(root, "licenses", vendor.file), "utf8");
        if (hash(text) !== vendor.sha256) throw new Error(`License checksum mismatch for ${id}`);
        texts.unshift({ path: vendor.file, text, source: vendor.source, note: vendor.note });
      } else {
        const readme = await readFile(join(directory, "README.md"), "utf8").catch(() => "");
        if (!/permission is hereby granted/i.test(readme)) throw new Error(`Missing full license notice for ${id}`);
        texts.unshift({ path: "README.md", text: readme });
      }
    }
    const notices: Notice[] = [];
    sections.push(`\n${"=".repeat(72)}\n${id}\nLicense: ${license}\nPackage: ${relative(root, directory)}\n`);
    for (const item of texts) {
      const sha256 = hash(item.text);
      await writeFile(join(target, "licenses", `${sha256}.txt`), item.text);
      notices.push({ path: item.path, sha256, ...(item.source ? { source: item.source } : {}), ...(item.note ? { note: item.note } : {}) });
      sections.push(`\n--- ${item.path}${item.source ? ` (${item.source})` : ""} ---\n${item.note ? `${item.note}\n` : ""}${item.text}\n`);
    }
    manifest.push({ name: pkg.name, version: pkg.version, license, packagePath: relative(root, directory), notices });
  }
  await writeFile(join(target, "licenses/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(target, "THIRD_PARTY_NOTICES.txt"), sections.join(""));
}
