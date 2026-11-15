import type { ReviewComment } from "./document-store.js";
export type ToolCall = (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Continuation = { revision: string; hasMore: boolean; nextOffset: number | null };
type CommentPreview = ReviewComment & { textPage?: Continuation; quotePage?: Continuation };
export type Page<T> = { items: T[]; total: number; hasMore: boolean; nextCursor: string | null; revision: string };
export async function allPages<T>(call: ToolCall, tool: string, args: Record<string, unknown>, initial?: Page<T>): Promise<T[]> {
  const limit = args.limit ?? 100;
  let current = initial ?? (await call(tool, { ...args, limit })).result as Page<T>;
  const items = [...current.items];
  while (current.hasMore) {
    if (!current.nextCursor) throw new Error("Server reported more results without a cursor.");
    current = (await call(tool, { ...args, limit, cursor: current.nextCursor })).result as Page<T>;
    items.push(...current.items);
  }
  return items;
}
export async function fullText(call: ToolCall, tool: string, args: Record<string, unknown>) {
  const first = (await call(tool, { ...args, limit: 64000 })).result as { content: string; revision: string; hasMore?: boolean; nextOffset?: number | null; comments?: CommentPreview[]; commentsPage?: Page<CommentPreview>; [key: string]: unknown };
  let content = first.content;
  let current = first;
  while (current.hasMore) {
    if (current.nextOffset == null) throw new Error("Server reported more text without an offset.");
    current = (await call(tool, { ...args, limit: 64000, offset: current.nextOffset, expectedRevision: first.revision, expectedIdentity: first.identity, knownCommentsRevision: first.commentsRevision })).result as typeof first;
    if (current.commentsRevision !== first.commentsRevision) throw new Error("Comments changed during reading. Reload the document.");
    content += current.content;
  }
  const comments = [...(first.comments ?? [])];
  let commentsPage = first.commentsPage;
  while (commentsPage?.hasMore) {
    if (!commentsPage.nextCursor) throw new Error("Server reported more comments without a cursor.");
    const next = (await call(tool, { ...args, knownRevision: first.revision, expectedRevision: first.revision, expectedIdentity: first.identity, knownCommentsRevision: first.commentsRevision, commentsCursor: commentsPage.nextCursor })).result as typeof first;
    // Do not suppress a subsequent comment page using a whole-list conditional revision.
    if (!next.comments) throw new Error("Comments changed during reading. Reload the document.");
    comments.push(...next.comments); commentsPage = next.commentsPage;
  }
  // UI consumers reconstruct exact comments; agents can fetch only a relevant field.
  for (const comment of comments) for (const field of ["text", "quote"] as const) {
    let continuation = comment[`${field}Page`];
    while (continuation?.hasMore) {
      if (continuation.nextOffset == null) throw new Error("Server reported more review text without an offset.");
      const next = (await call(tool, { ...args, commentId: comment.id, commentField: field, offset: continuation.nextOffset, limit: 64000, expectedRevision: continuation.revision, expectedIdentity: first.identity })).result as Continuation & { content: string };
      comment[field] += next.content;
      continuation = next;
    }
    delete comment[`${field}Page`];
  }
  return { ...first, content, comments };
}
