import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { OpenSpecWorkspace } from "./openspec.js";
import { ContextReader, type DocumentReadInput } from "./context-reader.js";
import { ArchiveService } from "./archive.js";
import { digest, page, type PageInput, type TextInput } from "./context.js";

// Structured content is the data contract. Do not duplicate whole documents in text blocks.
export const reply = (result: unknown) => ({ content: [{ type: "text" as const, text: "Result in structuredContent.result." }], structuredContent: { result } });
type Scope = { workspacePath?: string | null };
type DocumentInput = Scope & DocumentReadInput & { id: string; path: string };
type ArchiveInput = TextInput & PageInput & { workspacePath: string; action: "preview" | "inspect" | "read" | "apply" | "result"; id?: string; token?: string; dependsOn?: string[]; overlapOrder?: string[]; section?: string; path?: string; version?: "before" | "after"; verification?: { summary: string; evidencePaths: string[] }; dependenciesReviewed?: boolean; specDiffsReviewed?: boolean; unknownTasksAcknowledged?: boolean };
const pages = { cursor: z.string().max(1000).optional(), limit: z.number().int().min(1).max(100).optional() };
const text = { offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(64000).optional(), expectedRevision: z.string().optional(), knownRevision: z.string().optional() };
const commentSelection = { commentId: z.string().uuid().optional(), commentField: z.enum(["text", "quote"]).optional() };
export function registerContextTools(server: McpServer, workspaceInput: { workspacePath: z.ZodOptional<z.ZodNullable<z.ZodString>> }, required: (path?: string | null) => OpenSpecWorkspace, data: string) {
  const read = (path?: string | null) => new ContextReader(required(path), data);
  const annotations = { readOnlyHint: true, openWorldHint: false };
  const _meta = { ui: { visibility: ["model", "app"] } };
  registerAppTool(server, "list_changes", { description: "List active change IDs, sorted and paginated. Select an ID, then change_status/read_change. Stale or cross-project cursors fail.", inputSchema: { ...workspaceInput, ...pages }, annotations, _meta }, async ({ workspacePath, ...input }: Scope & PageInput) => reply(await read(workspacePath).changes(input)));
  registerAppTool(server, "list_project_documents", { description: "Explicit paginated inventory: project guidance (default), baseline specifications, archive, or all. Fetch exact text with read_project_document.", inputSchema: { ...workspaceInput, ...pages, category: z.enum(["project", "specification", "archive", "all"]).default("project") }, annotations, _meta }, async ({ workspacePath, category, ...input }: Scope & PageInput & { category: "project" | "specification" | "archive" | "all" }) => reply(await read(workspacePath).projectDocuments(category, input)));
  registerAppTool(server, "read_change", { description: "Paginated file manifest for one active change; no document bodies. Use read_document for Markdown and exact comments, read_change_file for other text/evidence. Read all relevant pages before deciding.", inputSchema: { ...workspaceInput, id: z.string(), ...pages }, annotations, _meta }, async ({ workspacePath, id, ...input }: Scope & PageInput & { id: string }) => reply(await read(workspacePath).change(id, input)));
  registerAppTool(server, "read_change_file", { description: "Exact UTF-16 text slice of a selected change file, including metadata or verification logs. Follow nextOffset with expectedRevision; knownRevision returns unchanged. Binary/oversized files require repository file tools.", inputSchema: { ...workspaceInput, id: z.string(), path: z.string(), ...text }, annotations, _meta }, async ({ workspacePath, id, path, ...input }: Scope & TextInput & { id: string; path: string }) => reply(await read(workspacePath).file(id, path, input)));
  registerAppTool(server, "read_document", { description: "Exact Markdown with bounded comment previews. Follow textPage/quotePage via commentId and commentField for full originals. Reuse revision AND commentsRevision; new comments remain visible when content is unchanged. Follow nextOffset/expectedRevision and commentsPage.nextCursor. archiveName reads retained reviews using the original change id.", inputSchema: { ...workspaceInput, id: z.string(), path: z.string(), ...text, expectedIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(), knownCommentsRevision: z.string().optional(), commentsCursor: pages.cursor, commentsLimit: pages.limit, archiveName: z.string().optional(), ...commentSelection }, annotations, _meta }, async ({ workspacePath, id, path, ...input }: DocumentInput) => reply(await (input.commentId || input.commentField ? read(workspacePath).comment(id, path, input) : read(workspacePath).document(id, path, input))));
  registerAppTool(server, "read_project_document", { description: "Exact, bounded text of a library document. Follow text and comment continuations. Archived reviews are included when an archive receipt identifies the original change; otherwise review history is explicitly unknown.", inputSchema: { ...workspaceInput, path: z.string(), ...text, expectedIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(), knownCommentsRevision: z.string().optional(), commentsCursor: pages.cursor, commentsLimit: pages.limit, ...commentSelection }, annotations, _meta }, async ({ workspacePath, path, ...input }: Scope & DocumentReadInput & { path: string }) => reply(await read(workspacePath).projectDocument(path, input)));
  registerAppTool(server, "change_status", { description: "Compact planning/task status and review counts. Evidence is unassessed; validation and checked tasks never trigger archive. Reuse knownRevision. Follow evidence/deltaSpecs pages using section and cursor, or preview closeout for exact details.", inputSchema: { ...workspaceInput, id: z.string(), knownRevision: z.string().optional(), section: z.enum(["evidence", "deltaSpecs"]).optional(), ...pages }, annotations, _meta }, async ({ workspacePath, id, knownRevision, section, ...input }: Scope & PageInput & { id: string; knownRevision?: string; section?: "evidence" | "deltaSpecs" }) => {
    const status = await new ArchiveService(required(workspacePath), data).status(id);
    const manifest = await read(workspacePath).change(id, { limit: 100 });
    const revision = digest(JSON.stringify([await required(workspacePath).identity(), manifest.documents.revision, manifest.review, status]));
    if (section) return reply(page<unknown>(status[section], input, revision));
    if (revision === knownRevision) return reply({ id, revision, unchanged: true });
    return reply({ ...status, review: manifest.review, tasks: { status: status.tasks.status, total: status.tasks.total, completed: status.tasks.completed, remaining: status.tasks.total - status.tasks.completed, unreadable: status.tasks.unreadable.length }, evidence: page(status.evidence, {}, revision), deltaSpecs: page(status.deltaSpecs, {}, revision), revision, unchanged: false });
  });
  registerAppTool(server, "archive_change", {
    description: "Explicit closeout: preview simulates official sync+archive in a temporary repo; inspect/read exposes every original input and exact spec diff. Resolve overlaps/dependencies, verify implementation using saved evidence, then explicitly apply the token with review confirmations. Concurrent edits invalidate previews. result reports actual mutations and recovery. Never archives from validation or task completion alone.",
    inputSchema: { workspacePath: z.string().min(1), action: z.enum(["preview", "inspect", "read", "apply", "result"]), id: z.string().optional(), token: z.string().optional(),
      dependsOn: z.array(z.string()).max(100).optional(), overlapOrder: z.array(z.string()).max(100).optional(), section: z.enum(["files", "specs", "tasks", "evidence", "deltaSpecs", "planningArtifacts", "overlaps", "blockers", "diagnostics", "changes", "remaining", "observedChanges", "pendingSpecs"]).optional(),
      path: z.string().optional(), version: z.enum(["before", "after"]).optional(), cursor: pages.cursor, limit: z.number().int().min(1).max(64000).optional(), offset: text.offset, expectedRevision: text.expectedRevision,
      verification: z.object({ summary: z.string().min(1).max(10000), evidencePaths: z.array(z.string()).min(1).max(100) }).optional(), dependenciesReviewed: z.boolean().optional(), specDiffsReviewed: z.boolean().optional(), unknownTasksAcknowledged: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }, _meta,
  }, async (input: ArchiveInput) => {
    const service = new ArchiveService(new OpenSpecWorkspace(input.workspacePath), data);
    const requireValue = (value: string | undefined, name: string) => { if (!value) throw new Error(`${name} is required for ${input.action}.`); return value; };
    if (input.action === "preview") return reply(await service.preview(requireValue(input.id, "id"), { dependsOn: input.dependsOn, overlapOrder: input.overlapOrder }));
    const token = requireValue(input.token, "token");
    if (input.action === "inspect") return reply(await service.inspect(token, requireValue(input.section, "section"), input));
    if (input.action === "read") return reply(await service.read(token, requireValue(input.path, "path"), input.version ?? "after", input));
    if (input.action === "result") return reply(await service.result(token));
    if (!input.verification) throw new Error("Explicit implementation verification with saved evidence is required.");
    return reply(await service.apply(token, { verification: input.verification, dependenciesReviewed: input.dependenciesReviewed === true, specDiffsReviewed: input.specDiffsReviewed === true, unknownTasksAcknowledged: input.unknownTasksAcknowledged }));
  });
}
