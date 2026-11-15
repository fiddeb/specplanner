import { link, lstat, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { digest, filesUnder, type FileEntry } from "./context.js";
import { archivedChangeName, changeId, OpenSpecWorkspace } from "./openspec.js";

const bindingSchema = z.object({ id: z.string(), generation: z.string().regex(/^[a-f0-9]{64}$/) });
type Binding = z.infer<typeof bindingSchema>;
type HistoryContext = { root: string; generation: string; workspaceRoot: string };

async function directoryIdentity(directory: string) {
  const stat = await lstat(directory, { bigint: true });
  if (!stat.isDirectory()) throw new Error("Change must be a regular directory.");
  return digest(`${stat.dev}:${stat.ino}:${stat.birthtimeNs}`);
}

export function archiveMatchesChange(name: string, id: string) {
  return name === id || (/^\d{4}-\d{2}-\d{2}-/.test(name) && name.slice(11) === id);
}

async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

// Immutable bindings coordinate first reads across processes without taking the write lock.
async function bind(path: string, value: Binding) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  try {
    try { await link(temporary, path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return bindingSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } finally { await unlink(temporary); }
}

export class ReviewHistory {
  constructor(readonly workspace: OpenSpecWorkspace, readonly data: string) {}

  private async directory() {
    return join(this.data, `workspace-${(await this.workspace.identity()).id}`);
  }

  private async location(id: string, archiveName?: string) {
    changeId(id);
    if (archiveName) {
      archivedChangeName(archiveName);
      if (!archiveMatchesChange(archiveName, id)) throw new Error("Archive name does not match the original change id.");
    }
    const root = await this.workspace.checkTree();
    const directory = join(root, "openspec/changes", ...(archiveName ? ["archive", archiveName] : [id]));
    // In-place document edits keep this identity; a replacement directory starts a new history.
    const identity = await directoryIdentity(directory);
    return { root, directory, identity, generation: digest(`${id}:${identity}`) };
  }

  async archivedBinding(archiveName: string): Promise<Binding | undefined> {
    archivedChangeName(archiveName);
    const root = await this.workspace.checkTree();
    const identity = await directoryIdentity(join(root, "openspec/changes/archive", archiveName));
    const reference = join(await this.directory(), "archive-review-refs", `${digest(`${archiveName}:${identity}`)}.json`);
    if (!(await exists(reference))) return;
    return bindingSchema.parse(JSON.parse(await readFile(reference, "utf8")));
  }

  async originalChange(archiveName: string) {
    const binding = await this.archivedBinding(archiveName);
    if (binding) return binding.id;
    const directory = join(await this.directory(), "archive-previews");
    let names: string[];
    try { names = await readdir(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    const root = (await this.workspace.identity()).path;
    const archived = await filesUnder(join(root, "openspec/changes/archive", archiveName));
    const originals = new Set<string>();
    for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      const plan = JSON.parse(await readFile(join(directory, name), "utf8"));
      if (plan.workspacePath !== root) throw new Error("Archive preview belongs to another workspace.");
      if (plan.destination === `changes/archive/${archiveName}` && plan.outcome?.outcome === "archived" && JSON.stringify(archived) === JSON.stringify(plan.files)) originals.add(changeId(plan.id));
    }
    return originals.size === 1 ? [...originals][0] : undefined;
  }

  async generation(id: string, archiveName?: string) {
    const location = await this.location(id, archiveName);
    if (!archiveName) return location.generation;
    const reference = join(await this.directory(), "archive-review-refs", `${digest(`${archiveName}:${location.identity}`)}.json`);
    if (!(await exists(reference))) return location.generation;
    const binding = bindingSchema.parse(JSON.parse(await readFile(reference, "utf8")));
    if (binding.id !== id) throw new Error("Archive review identity does not match the original change id.");
    return binding.generation;
  }

  // Called under the workspace write lock, after the archive directory has been observed.
  // Failed attempts never reserve an archive name. Intent remains in the operation receipt.
  async bindArchive(id: string, archiveName: string, generation: string) {
    const value = bindingSchema.parse({ id, generation });
    const { identity } = await this.location(id, archiveName);
    const reference = join(await this.directory(), "archive-review-refs", `${digest(`${archiveName}:${identity}`)}.json`);
    const existing = await bind(reference, value);
    if (existing.id !== id || existing.generation !== generation) throw new Error("Archive is already associated with another review history.");
  }

  private async resolve(id: string, archiveName?: string): Promise<HistoryContext> {
    return { generation: await this.generation(id, archiveName), root: await this.directory(), workspaceRoot: (await this.workspace.identity()).path };
  }

  private async documentAt(id: string, path: string, { root, generation, workspaceRoot }: HistoryContext) {
    const legacy = join(root, "documents", digest(`${id}/${path}`));
    if (await exists(legacy)) {
      const ownerPath = join(root, "legacy-review-owners", `${digest(id)}.json`);
      let owner: Binding;
      if (await exists(ownerPath)) {
        owner = bindingSchema.parse(JSON.parse(await readFile(ownerPath, "utf8")));
      } else {
        const changes = join(workspaceRoot, "openspec/changes");
        let archives: string[] = [];
        try { archives = await readdir(join(changes, "archive")); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        let occurrences = Number(await exists(join(changes, id)));
        for (const name of archives.filter(name => archiveMatchesChange(name, id))) {
          const original = await this.originalChange(name);
          if (original === undefined || original === id) occurrences++;
        }
        if (occurrences !== 1) throw new Error("Legacy review history has ambiguous ownership after change-name reuse. Original history is retained; resolve its ownership before continuing.");
        owner = await bind(ownerPath, { id, generation });
      }
      if (owner.id !== id) throw new Error("Legacy review identity does not match the change.");
      if (owner.generation === generation) return { history: legacy, identity: generation };
    }
    return { history: join(root, "documents-v2", generation, digest(path)), identity: generation };
  }

  async document(id: string, path: string, archiveName?: string) {
    return this.documentAt(id, path, await this.resolve(id, archiveName));
  }

  async comments(id: string, paths: string[]) {
    const files: FileEntry[] = [];
    const context = await this.resolve(id);
    let bytes = 0;
    for (const path of paths.filter(path => path.endsWith(".md")).sort()) {
      const { history } = await this.documentAt(id, path, context);
      for (const file of await filesUnder(join(history, "comments"))) {
        bytes += file.bytes;
        if (bytes > 64_000_000 || files.length >= 10000) throw new Error("Review comments exceed the inspection limit.");
        files.push({ ...file, path: `${path}/${file.path}` });
      }
    }
    return files;
  }
}
