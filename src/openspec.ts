import { writingPolicy } from "./writing-policy.js";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function changeId(value: string) {
  if (value.length > 100 || !idPattern.test(value) || value === "archive") throw new Error("Use a lowercase change name with single hyphens.");
  return value;
}
export class OpenSpecWorkspace {
  constructor(readonly root: string, readonly cli = fileURLToPath(new URL("../node_modules/@fission-ai/openspec/bin/openspec.js", import.meta.url))) {
    if (!isAbsolute(root)) throw new Error("The repository path must be absolute.");
  }
  async identity() {
    const root = await realpath(this.root);
    await lstat(join(root, ".git"));
    return { path: root, id: createHash("sha256").update(root).digest("hex"), name: root.split("/").at(-1)! };
  }
  async checkTree() {
    const { path: root } = await this.identity();
    let count = 0;
    const visit = async (path: string): Promise<void> => {
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error("Symlinks are not supported inside this workspace's openspec directory.");
      if (++count > 10000) throw new Error("OpenSpec tree is too large.");
      if (stat.isDirectory()) for (const child of await readdir(path)) await visit(join(path, child));
    };
    try { await visit(join(root, "openspec")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return root;
  }
  async command(args: string[], allowInvalid = false) {
    const cwd = await this.checkTree();
    if (!(await lstat(join(cwd, "openspec", "changes"))).isDirectory()) throw new Error("A local OpenSpec changes directory is required.");
    return await new Promise<unknown>((resolve, reject) => {
      execFile(process.execPath, [this.cli, ...args], {
        cwd, timeout: 30000, maxBuffer: 2_000_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, OPENSPEC_TELEMETRY: "0", DO_NOT_TRACK: "1", CI: "1", NO_COLOR: "1" },
      }, (error, stdout, stderr) => {
        if (error && (!allowInvalid || error.code !== 1)) return reject(new Error(stderr.trim() || error.message));
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error(stderr.trim() || "OpenSpec did not return valid JSON.")); }
      });
    });
  }
  async list() {
    const root = await this.checkTree();
    try {
      return (await readdir(join(root, "openspec", "changes"), { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && idPattern.test(entry.name) && entry.name !== "archive")
        .map(entry => entry.name).sort();
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async projectIndex() {
    const root = await this.checkTree();
    const documents: { path: string; category: "project" | "specification" | "archive" }[] = [];
    const visit = async (relative: string): Promise<void> => {
      for (const entry of await readdir(join(root, "openspec", relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (path === "specs" || path.startsWith("specs/") || path === "changes" || path === "changes/archive" || path.startsWith("changes/archive/")) await visit(path);
        } else if (entry.isFile() && /\.(md|yaml|yml)$/i.test(path)) {
          documents.push({ path, category: path.startsWith("specs/") ? "specification" : path.startsWith("changes/archive/") ? "archive" : "project" });
        }
      }
    };
    try { await visit(""); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return documents.sort((a, b) => a.path.localeCompare(b.path));
  }
  async readProjectDocument(path: string) {
    if (path.length > 1000 || path.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\"))) throw new Error("Use a relative project document path.");
    const documents = await this.projectIndex();
    if (!documents.some(document => document.path === path)) throw new Error("Document is not in the project's OpenSpec index.");
    const root = await this.checkTree();
    const file = join(root, "openspec", path);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Document exceeds the 1 MB read limit.");
    return { path, content: await readFile(file, "utf8") };
  }
  async create(id: string) {
    changeId(id);
    const root = await this.checkTree();
    await mkdir(join(root, "openspec", "changes"), { recursive: true });
    return this.command(["new", "change", changeId(id), "--schema", "spec-driven", "--json"]); }
  async validate(id: string) { return this.command(["validate", changeId(id), "--type", "change", "--strict", "--json", "--no-interactive"], true); }
  async instructions(id: string, artifact: string) {
    if (!["proposal", "design", "specs", "tasks"].includes(artifact)) throw new Error("Unsupported planning artifact.");
    const official = await this.command(["instructions", artifact, "--change", changeId(id), "--json"]);
    if (!official || typeof official !== "object" || Array.isArray(official)) throw new Error("Unexpected OpenSpec instruction format.");
    return { ...official, specplannerWritingPolicy: writingPolicy };
  }
  async read(id: string) {
    const root = await this.checkTree();
    const directory = join(root, "openspec", "changes", changeId(id));
    const documents: { path: string; content: string }[] = [];
    let total = 0;
    const visit = async (relative: string): Promise<void> => {
      for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && path.endsWith(".md")) {
          const stat = await lstat(join(directory, path));
          total += stat.size;
          if (total > 1_000_000) throw new Error("Change documents exceed the 1 MB read limit.");
          documents.push({ path, content: await readFile(join(directory, path), "utf8") });
        }
      }
    };
    await visit("");
    return { id, documents };
  }
}
