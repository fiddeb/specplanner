import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export type PageInput = { cursor?: string; limit?: number };
export function page<T>(items: T[], input: PageInput, scope: string) {
  const revision = digest(JSON.stringify([scope, items]));
  let offset = 0;
  if (input.cursor) {
    const cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
    if (cursor.revision !== revision) throw new Error("Listing changed or cursor belongs to another workspace/query. Restart from the first page.");
    offset = cursor.offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) throw new Error("Invalid page cursor.");
  }
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Page limit must be between 1 and 100.");
  const next = Math.min(offset + limit, items.length);
  return { items: items.slice(offset, next), revision, total: items.length, hasMore: next < items.length,
    nextCursor: next < items.length ? Buffer.from(JSON.stringify({ revision, offset: next })).toString("base64url") : null };
}
export type TextInput = { offset?: number; limit?: number; expectedRevision?: string; knownRevision?: string };
export function textPage(content: string, input: TextInput, scope: string, existingRevision?: string) {
  // Include identity in conditional revisions: equal bytes in different projects are different context.
  const revision = existingRevision ?? digest(`${scope}\0${content}`);
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 12000;
  if (!Number.isInteger(offset) || offset < 0 || offset > content.length || !Number.isInteger(limit) || limit < 1 || limit > 64000) throw new Error("Invalid text range (limit 1–64,000 UTF-16 units).");
  if ((offset > 0 && !input.expectedRevision) || (input.expectedRevision && input.expectedRevision !== revision)) throw new Error("Document changed or missing expectedRevision. Restart the read.");
  if (input.knownRevision === revision) return { revision, unchanged: true as const, total: content.length, hasMore: false, nextOffset: null };
  const next = Math.min(offset + limit, content.length);
  return { revision, unchanged: false as const, content: content.slice(offset, next), offset, total: content.length, hasMore: next < content.length, nextOffset: next < content.length ? next : null };
}
export type FileEntry = { path: string; revision: string; bytes: number; mode: number };
export async function filesUnder(root: string, maxBytes = 64_000_000): Promise<FileEntry[]> {
  try { await lstat(root); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const files: FileEntry[] = [];
  let total = 0, entries = 0;
  async function visit(path: string) {
    const stat = await lstat(join(root, path));
    if (++entries > 10000) throw new Error("Tree exceeds 10,000 entries.");
    if (stat.isSymbolicLink()) throw new Error("Symlinks are not supported inside the OpenSpec tree.");
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort()) {
        if (!path && name === ".specplanner-write-lock") continue;
        await visit(path ? `${path}/${name}` : name);
      }
    } else if (stat.isFile()) {
      total += stat.size;
      if (total > maxBytes) throw new Error(`Tree exceeds the ${maxBytes} byte inspection limit; nothing was truncated.`);
      const content = await readFile(join(root, path));
      if (content.length !== stat.size) throw new Error("File changed during inspection. Retry.");
      files.push({ path, revision: digest(content), bytes: content.length, mode: stat.mode & 0o777 });
    } else throw new Error("Only regular files and directories are supported.");
  }
  await visit("");
  return files;
}
export function relativeFile(path: string) {
  if (!path || path.length > 1000 || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Use a relative file path without traversal.");
  return path;
}
