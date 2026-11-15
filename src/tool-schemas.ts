import { z } from "zod";

export const changeInput = z.string().describe("OpenSpec change directory name, such as add-retries: 1–100 lowercase letters/digits separated by single hyphens; archive is reserved. Use list_changes for existing IDs.");
export const changePathInput = z.string().describe("Markdown path relative to the selected change, such as proposal.md or specs/retries/spec.md. Obtain it from read_change; do not include openspec/changes/<id>/.");
export const identityInput = z.string().regex(/^[a-f0-9]{64}$/).describe("Change identity returned by read_document. Rejects a replaced change even when its name and content match; reload after an identity conflict.");
export const proposalIdInput = z.string().uuid().describe("Stored drawing proposal ID returned by propose_board or list_board_proposals, in the same workspace.");
export const pagesInput = {
  cursor: z.string().max(1000).optional().describe("Opaque nextCursor from the previous page of this same query and workspace. Omit on the first call; restart if the listing changes."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum entries per page, 1–100; defaults to 20."),
};
export const textInput = {
  offset: z.number().int().nonnegative().optional().describe("Zero-based UTF-16 text offset; defaults to 0. For continuation, use nextOffset and the same expectedRevision."),
  limit: z.number().int().min(1).max(64000).optional().describe("Maximum UTF-16 units in this text slice, 1–64,000; defaults to 12,000. Independent of the comment page size."),
  expectedRevision: z.string().optional().describe("Revision of the selected document or comment field. Required when offset > 0; a mismatch rejects the read so text from different revisions cannot be combined."),
  knownRevision: z.string().optional().describe("Revision whose full text is already in context. Matching text is omitted; document reads also require knownCommentsRevision to reuse content safely."),
};
export const commentReadInput = {
  expectedIdentity: identityInput.optional(),
  knownCommentsRevision: z.string().optional().describe("commentsRevision from the same document, change identity and workspace. Pass with knownRevision to reuse text while still detecting new comments."),
  commentsCursor: pagesInput.cursor.describe("commentsPage.nextCursor from this same document read. Paginates comment previews independently of offset/nextOffset for document text."),
  commentsLimit: pagesInput.limit.describe("Maximum comment previews per page, 1–100; defaults to 20. Each text/quote preview is bounded to 512 UTF-16 units."),
  commentId: z.string().uuid().optional().describe("ID of a comment returned by this document. Supply with commentField to read its original text or quote instead of document text."),
  commentField: z.enum(["text", "quote"]).optional().describe("Original comment field to read; requires commentId. Use that field's textPage/quotePage revision and nextOffset when continuing a preview."),
};

const textPageShape = {
  revision: z.string().describe("Opaque revision of this text stream. Use as expectedRevision for continuation or knownRevision when its full text is retained."),
  unchanged: z.boolean().describe("True when reusable text was omitted; for document reads this also accounts for comment changes."),
  content: z.string().optional().describe("Exact UTF-16 text slice; omitted when unchanged. For comment selection, this is the original text or quote, not document content."),
  offset: z.number().int().nonnegative().optional().describe("Start offset of the returned content; omitted when unchanged."),
  total: z.number().int().nonnegative().describe("Full length of the selected text stream in UTF-16 units."),
  hasMore: z.boolean().describe("Whether more text remains in this stream."),
  nextOffset: z.number().int().nonnegative().nullable().describe("Offset for the next text slice, or null when complete or unchanged."),
};
const textPageSchema = z.object(textPageShape);
export const reviewCommentSchema = z.object({
  id: z.string().describe("Persistent comment ID, used as commentId when reading original text or quote."),
  revision: z.string().describe("Saved document revision to which the selection belongs."),
  start: z.number().int().nonnegative().describe("Inclusive UTF-16 selection offset in that saved revision."),
  end: z.number().int().nonnegative().describe("Exclusive UTF-16 selection offset in that saved revision."),
  quote: z.string().describe("Selected original document text, preserved in its authored language."),
  text: z.string().describe("Original user comment, preserved in its authored language."),
  createdAt: z.string().describe("Comment creation timestamp in ISO 8601 format."),
});
const commentPreviewSchema = reviewCommentSchema.extend({
  textPage: textPageSchema.omit({ content: true }).optional().describe("Continuation metadata when text was truncated to a preview. Read with this comment's ID and commentField=text."),
  quotePage: textPageSchema.omit({ content: true }).optional().describe("Continuation metadata when quote was truncated to a preview. Read with this comment's ID and commentField=quote."),
});
const documentShape = {
  path: z.string().describe("Selected document path; project-library reads keep the path returned by list_project_documents."),
  identity: z.string().describe("Identity of the original change; use as expectedIdentity on subsequent reads or writes."),
};
const documentReadSchema = textPageSchema.extend({
  ...documentShape,
  contentUnchanged: z.boolean().optional().describe("Whether the document text is unchanged and omitted."),
  commentsUnchanged: z.boolean().optional().describe("Whether the comment stream is unchanged and previews are omitted."),
  commentsRevision: z.string().optional().describe("Opaque revision of all comments scoped to this document and change identity."),
  comments: z.array(commentPreviewSchema).optional().describe("Current page of comment previews; omitted when commentsUnchanged. Follow textPage/quotePage to retrieve full originals."),
  commentsPage: z.object({
    revision: z.string().describe("Revision of the paginated comment listing, distinct from commentsRevision used for conditional reads."),
    total: z.number().int().nonnegative().describe("Total comment count."),
    hasMore: z.boolean().describe("Whether another page of comment previews is available."),
    nextCursor: z.string().nullable().describe("Pass as commentsCursor to continue; null when complete or unchanged."),
  }).optional().describe("Present for document reads; omitted when selecting an original comment field."),
  commentId: z.string().optional().describe("Present only when reading one selected original comment field."),
  commentField: z.enum(["text", "quote"]).optional().describe("Selected original field; revision/total/nextOffset now refer to this field."),
});
export const documentReadOutput = { result: documentReadSchema.describe("Document reads include contentUnchanged, commentsUnchanged, commentsRevision and commentsPage, with optional comment previews. Selecting commentId/commentField instead returns that original field's text slice and omits document review metadata.") };
export const projectDocumentReadOutput = { result: documentReadSchema.partial({ identity: true }).extend({
  originalChangeId: z.string().optional().describe("Original change ID recovered from the archive operation record. Only mapped archived documents include identity and review metadata or selected comment fields."),
  reviewHistory: z.string().optional().describe("Explains when an archived document cannot be mapped to its original change. Missing comments must not be interpreted as an empty review history."),
}).describe("Library text slice. Mapped archives include originalChangeId and the same review fields as read_document; selecting commentId/commentField returns an original field slice. Other library documents omit identity, review and comment selection fields.") };
