import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { changeId, archivedChangeName, OpenSpecWorkspace } from "./openspec.js";
import { acquireWorkspaceWrite } from "./workspace-lock.js";

export const revisionOf = (content: string) => createHash("sha256").update(content).digest("hex");
export type ReviewComment = { id: string; revision: string; start: number; end: number; quote: string; text: string; createdAt: string };
export class DocumentStore {
  constructor(readonly workspace: OpenSpecWorkspace, readonly data: string) {}
  async paths(id: string, path: string, archiveName?: string) {
    changeId(id);
    if (path.length > 400 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.md$/.test(path)) throw new Error("Use a relative Markdown document path.");
    const root = await this.workspace.checkTree();
    if (archiveName) {
      archivedChangeName(archiveName);
      if (archiveName !== id && (!/^\d{4}-\d{2}-\d{2}-/.test(archiveName) || archiveName.slice(11) !== id)) throw new Error("Archive name does not match the original change id.");
    }
    const file = archiveName ? join(root, "openspec", "changes", "archive", archiveName, path) : join(root, "openspec", "changes", id, path);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Document must be a regular Markdown file under 1 MB.");
    const identity = await this.workspace.identity();
    const history = join(this.data, `workspace-${identity.id}`, "documents", revisionOf(`${id}/${path}`));
    return { file, history, lock: join(root, "openspec", ".specplanner-write-lock") };
  }
  async snapshot(history: string, content: string) {
    await mkdir(join(history, "revisions"), { recursive: true, mode: 0o700 });
    const revision = revisionOf(content);
    const temporary = join(history, "revisions", `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      try { await link(temporary, join(history, "revisions", `${revision}.md`)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally { await rm(temporary, { force: true }); }
    return revision;
  }
  async read(id: string, path: string, archiveName?: string) {
    const { file, history } = await this.paths(id, path, archiveName);
    const content = await readFile(file, "utf8");
    const revision = await this.snapshot(history, content);
    let comments: ReviewComment[] = [];
    try {
      const names = await readdir(join(history, "comments"));
      comments = await Promise.all(names.filter(name => name.endsWith(".json")).map(async name => JSON.parse(await readFile(join(history, "comments", name), "utf8")) as ReviewComment));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { path, content, revision, comments };
  }
  async save(id: string, path: string, expectedRevision: string, content: string) {
    if (Buffer.byteLength(content) > 1_000_000) throw new Error("Document exceeds the 1 MB limit.");
    const release = await acquireWorkspaceWrite(this.workspace);
    let temporary: string | undefined;
    try {
      const { file, history } = await this.paths(id, path);
      temporary = join(dirname(file), `.specplanner-${randomUUID()}.tmp`);
      const current = await readFile(file, "utf8");
      if (revisionOf(current) !== expectedRevision) throw new Error("Document changed since it was opened. Your draft is retained; reload to review the latest version.");
      await this.snapshot(history, current);
      await this.snapshot(history, content);
      await writeFile(temporary, content, { flag: "wx", mode: (await lstat(file)).mode & 0o777 });
      // Catch external editor changes during preparation. External writers do not share our lock.
      if (revisionOf(await readFile(file, "utf8")) !== expectedRevision) throw new Error("Document changed during saving. Your draft is retained.");
      await rename(temporary, file);
    } finally {
      if (temporary) await rm(temporary, { force: true });
      await release();
    }
    return this.read(id, path);
  }
  async comment(id: string, path: string, revision: string, start: number, end: number, text: string) {
    if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid document revision.");
    if (!text.trim() || text.length > 10000) throw new Error("Write a comment between 1 and 10,000 characters.");
    const release = await acquireWorkspaceWrite(this.workspace);
    try {
      const { history } = await this.paths(id, path);
      const content = await readFile(join(history, "revisions", `${revision}.md`), "utf8");
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > content.length) throw new Error("Invalid text selection.");
      const comment: ReviewComment = { id: randomUUID(), revision, start, end, quote: content.slice(start, end), text, createdAt: new Date().toISOString() };
      const directory = join(history, "comments");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, `${comment.id}.tmp`);
      await writeFile(temporary, JSON.stringify(comment), { flag: "wx", mode: 0o600 });
      await rename(temporary, join(directory, `${comment.id}.json`));
      return comment;
    } finally { await release(); }
  }
}
