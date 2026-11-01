export type ToolCall = (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
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
  const first = (await call(tool, { ...args, limit: 64000 })).result as { content: string; revision: string; hasMore?: boolean; nextOffset?: number | null; comments?: unknown[]; commentsPage?: Page<unknown>; [key: string]: unknown };
  let content = first.content;
  let current = first;
  while (current.hasMore) {
    if (current.nextOffset == null) throw new Error("Server reported more text without an offset.");
    current = (await call(tool, { ...args, limit: 64000, offset: current.nextOffset, expectedRevision: first.revision })).result as typeof first;
    content += current.content;
  }
  const comments = [...(first.comments ?? [])];
  let commentsPage = first.commentsPage;
  while (commentsPage?.hasMore) {
    if (!commentsPage.nextCursor) throw new Error("Server reported more comments without a cursor.");
    const next = (await call(tool, { ...args, knownRevision: first.revision, expectedRevision: first.revision, knownCommentsRevision: first.commentsRevision, commentsCursor: commentsPage.nextCursor })).result as typeof first;
    // Do not suppress a subsequent comment page using a whole-list conditional revision.
    if (!next.comments) throw new Error("Comments changed during reading. Reload the document.");
    comments.push(...next.comments); commentsPage = next.commentsPage;
  }
  return { ...first, content, comments };
}
