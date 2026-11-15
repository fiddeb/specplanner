import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSpecCommand } from "./openspec-command.js";
import { taskProgress } from "./openspec-tasks.js";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function changeId(value: string) {
  if (value.length > 100 || !idPattern.test(value) || value === "archive") throw new Error("Use a lowercase change name with single hyphens.");
  return value;
}
export function archivedChangeName(value: string) {
  if (value.length > 111 || !idPattern.test(value) || value === "archive") throw new Error("Invalid archived change name.");
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
      if (!stat.isDirectory() && !stat.isFile()) throw new Error("Only regular OpenSpec files and directories are supported.");
      if (++count > 10000) throw new Error("OpenSpec tree is too large.");
      if (stat.isDirectory()) for (const child of await readdir(path)) await visit(join(path, child));
    };
    try { await visit(join(root, "openspec")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const entries = await readdir(join(root, "openspec"), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
    const local = entries.some(entry => entry.isDirectory() && ["changes", "specs"].includes(entry.name));
    if (!local && entries.some(entry => ["config.yaml", "config.yml"].includes(entry.name))) {
      // Check before mkdir: adding changes/ would silently override a store-only declaration.
      const context = await openSpecCommand(this.cli, root, ["context", "--json"]) as { root?: { path?: string } };
      if (context.root?.path !== root) throw new Error("This project selects an external OpenSpec store. Select that store's repository explicitly as workspacePath; SpecPlanner will not create a competing local planning tree.");
    }
    return root;
  }
  async command(args: string[], allowInvalid = false) {
    const cwd = await this.checkTree();
    if (!(await lstat(join(cwd, "openspec", "changes"))).isDirectory()) throw new Error("A local OpenSpec changes directory is required.");
    return openSpecCommand(this.cli, cwd, args, allowInvalid);
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
    if (!["proposal", "design", "specs", "tasks", "apply", "archive"].includes(artifact)) throw new Error("Unsupported planning artifact or operation.");
    const official = await this.command(["instructions", artifact, "--change", changeId(id), "--json"]);
    if (!official || typeof official !== "object" || Array.isArray(official)) throw new Error("Unexpected OpenSpec instruction format.");
    return official as Record<string, unknown>;
  }
  async taskStatus(id: string) {
    const root = await this.checkTree();
    return taskProgress(await this.instructions(id, "apply"), join(root, "openspec", "changes", changeId(id)));
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
