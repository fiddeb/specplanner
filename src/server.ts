import { changeInput, changePathInput, identityInput, pagesInput, proposalIdInput, reviewCommentSchema } from "./tool-schemas.js";
import { workspaceBindingSchema } from "./workspace-connection-model.js";
import { registerContextTools, reply } from "./context-tools.js";
import { version } from "./version.js";
import { planningInstructions } from "./planning-instructions.js";
import { digest } from "./context.js";
import { WorkspaceConnections } from "./workspace-connection.js";
import { DocumentStore } from "./document-store.js";
import { OpenSpecWorkspace } from "./openspec.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { BoardStore } from "./board-store.js";
import { boardSchema, proposalSchema, proposalSummarySchema, sceneSchema, proposalSummary, type Scene } from "./board-model.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

export function createServer(html: string, suppliedStore?: BoardStore, workspace = process.env.SPECPLANNER_WORKSPACE ? new OpenSpecWorkspace(process.env.SPECPLANNER_WORKSPACE) : undefined) {
  const data = process.env.SPECPLANNER_DATA_DIR ?? join(homedir(), ".local", "share", "specplanner");
  const connections = new WorkspaceConnections(join(data, "workspace-connections"));
  const workspaceInput = { workspacePath: z.string().min(1).nullable().optional().describe("Trusted absolute project path from this chat; pass on every call. null selects personal storage. Omission uses only the environment default.") };
  const resolveWorkspace = (workspacePath?: string | null) => workspacePath === null ? undefined : workspacePath === undefined ? workspace : new OpenSpecWorkspace(workspacePath);
  const getStore = async (workspacePath?: string | null) => {
    const selected = resolveWorkspace(workspacePath);
    return suppliedStore ?? new BoardStore(join(data, selected ? `workspace-${(await selected.identity()).id}` : "personal-board"));
  };
  const required = (workspacePath?: string | null) => { const selected = resolveWorkspace(workspacePath); if (!selected) throw new Error("Pass the current Codex project directory as workspacePath, or choose a workspace in the panel."); return selected; };

  const server = new McpServer({ name: "specplanner", version });
  const uri = `ui://specplanner/panel-v${version}.html`;
  registerAppResource(server, "planner-panel", uri, {}, async () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));
  registerAppTool(server, "open_planner", {
    title: "Open SpecPlanner",
    description: "Open SpecPlanner for the current Codex project. Pass its absolute project directory as workspacePath using the current chat context. Do not ask for an environment variable or use the plugin installation directory. If the chat has no project directory, omit workspacePath and let the panel offer workspace entry. Always pass the same workspacePath in subsequent tool calls.",
    inputSchema: { ...workspaceInput },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: uri }, "openai/ui": { entrypoints: [{ type: "thread" }] } },
  }, async ({ workspacePath }: { workspacePath?: string | null }) => {
    const selected = resolveWorkspace(workspacePath);
    const path = selected ? (await selected.identity()).path : null;
    return {
    content: [{ type: "text" as const, text: "SpecPlanner panel ready. Workspace planning tools are available." }],
    structuredContent: { name: "SpecPlanner", phase: "workspace-planning", connected: true, workspacePath: path, ...(workspacePath === undefined && !selected ? { connectionRequestId: await connections.create() } : {}) },
  }; });
  server.registerTool("connect_workspace", {
    description: "Complete the connection request from a SpecPlanner panel in THIS chat. Use the exact requestId from the panel's message and this chat's trusted absolute project directory. Never infer from another chat or the plugin installation. Pass null only if this chat has no project directory. Do not call open_planner again; the waiting panel will update automatically.",
    inputSchema: { requestId: z.string().describe("Exact connection request ID supplied by the waiting panel in this chat; expires after 10 minutes. Never invent or reuse an ID from another panel."), workspacePath: workspaceBindingSchema.shape.workspacePath.describe("Trusted absolute project path from this chat. null records that no repository is selected; does not choose another chat or global workspace.") },
    outputSchema: workspaceBindingSchema.extend({ connected: z.literal(true).describe("The panel request has a recorded binding. workspacePath=null means the panel must offer workspace selection.") }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ["model"] } },
  }, async ({ requestId, workspacePath }) => {
    const path = workspacePath === null ? null : (await new OpenSpecWorkspace(workspacePath).identity()).path;
    const result = await connections.bind(requestId, path);
    return { content: [{ type: "text" as const, text: path ? "The waiting SpecPlanner panel is connected to this project." : "No project directory is available; the panel will offer workspace selection." }], structuredContent: result };
  });
  server.registerTool("workspace_connection", {
    description: "Read the connection status of one waiting panel. Panel-only: poll the request ID returned by open_planner while awaiting connect_workspace; this call never creates or binds a connection. Returns connected=false while waiting, or connected=true with workspacePath (null means no repository was supplied). Repeated reads are safe; unknown IDs and requests older than 10 minutes fail, so reopen the panel after expiry.",
    inputSchema: { requestId: z.string().describe("connectionRequestId returned by open_planner for this waiting panel; use the same ID sent to connect_workspace.") },
    outputSchema: workspaceBindingSchema.partial().extend({ connected: z.boolean().describe("False while waiting; true once bound, with workspacePath containing the canonical project path or null for no repository.") }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ["app"] } },
  }, async ({ requestId }) => {
    const result = await connections.read(requestId);
    return { content: [{ type: "text" as const, text: result.connected ? "Connected" : "Waiting" }], structuredContent: result };
  });
  registerAppTool(server, "read_board", {
    outputSchema: boardSchema.extend({ scene: sceneSchema.optional(), cacheRevision: z.string().describe("Opaque workspace-scoped cache token; pass as knownRevision only while the scene is retained."), unchanged: z.boolean().describe("True when the matching scene was omitted.") }),
    title: "Read planning board", description: "Read the current saved drawing, or a numbered immutable revision. Use list_board_proposals/read_board_proposal for pending alternatives. Returns revision, scene, cacheRevision and unchanged; a matching knownRevision omits scene. Retain the full scene before reusing cacheRevision. Missing historical revisions fail.",
    _meta: { ui: { visibility: ["model", "app"] } },
    inputSchema: { ...workspaceInput, revision: z.number().int().nonnegative().optional().describe("Saved board revision number; omit for latest. Revision 0 is the empty board."), knownRevision: z.string().optional().describe("cacheRevision from the same workspace and requested board revision, only while its full scene is retained in context.") }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ revision, workspacePath, knownRevision }: { revision?: number; workspacePath?: string | null; knownRevision?: string }) => {
    const store = await getStore(workspacePath);
    const board = revision === undefined ? await store.read() : await store.readRevision(revision);
    const selected = resolveWorkspace(workspacePath);
    const cacheRevision = digest(JSON.stringify([selected ? await selected.identity() : null, board]));
    const unchanged = cacheRevision === knownRevision;
    return { content: [{ type: "text" as const, text: unchanged ? "Board unchanged." : `Board revision ${board.revision}; scene in structuredContent.` }], structuredContent: unchanged ? { revision: board.revision, cacheRevision, unchanged } : { ...board, cacheRevision, unchanged } };
  });
  registerAppTool(server, "save_board", {
    outputSchema: boardSchema,
    title: "Save planning board", description: "Save a manually edited drawing from the panel, creating the next immutable revision and retaining earlier revisions. Read the board first and pass its revision as expectedRevision. Use apply_board_proposal to accept a stored proposal; agents should use propose_board to request review. Returns revision and scene on success; stale revisions return isError without overwriting the saved board. Reload and reconcile the draft before retrying.",
    inputSchema: { ...workspaceInput, expectedRevision: z.number().int().nonnegative().describe("Board revision on which this draft is based, from read_board or the last successful save. A mismatch rejects the save."), scene: sceneSchema.describe("Complete replacement Excalidraw scene, not a patch: at most 2,000 elements with unique IDs and at most 2 MB of serialized JSON.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ["app"] } },
  }, async ({ expectedRevision, scene, workspacePath }: { expectedRevision: number; scene: Scene; workspacePath?: string | null }) => {
    try {
      const board = await (await getStore(workspacePath)).save(expectedRevision, scene);
      return { content: [{ type: "text" as const, text: `Saved revision ${board.revision}.` }], structuredContent: board };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Unable to save the board." }] };
    }
  });
  registerAppTool(server, "workspace_info", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Inspect the selected workspace before choosing documents. Returns configured, path/id/name when configured, activeChanges/projectDocuments counts, revision and unchanged. A matching knownRevision omits unchanged counts and identity; configured remains present. Use list_changes or list_project_documents for inventories, and planning_instructions before drafting. null selects personal storage with configured=false; never changes another panel binding.", inputSchema: { ...workspaceInput, knownRevision: z.string().optional().describe("Workspace summary revision previously returned by this tool; reuse only while its identity and counts remain in context.") }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ workspacePath, knownRevision }: { workspacePath?: string | null; knownRevision?: string }) => {
    const workspace = resolveWorkspace(workspacePath);
    const info = workspace ? { configured: true, ...await workspace.identity(), activeChanges: (await workspace.list()).length, projectDocuments: (await workspace.projectIndex()).length } : { configured: false, activeChanges: 0, projectDocuments: 0 };
    const revision = digest(JSON.stringify(info));
    return { content: [{ type: "text" as const, text: "Workspace summary in structuredContent." }], structuredContent: knownRevision === revision ? { configured: info.configured, revision, unchanged: true } : { ...info, revision, unchanged: false, inventoriesOmitted: true } };
  });
  registerContextTools(server, workspaceInput, required, data);
  registerAppTool(server, "create_change", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Create a new spec-driven OpenSpec planning change in the selected repository. Use list_changes/read_change for an existing change; duplicate IDs fail rather than overwrite. Initializes a local OpenSpec tree if needed and returns the pinned official CLI creation JSON in result. Read planning_instructions before drafting its artifacts. Creates planning files only; does not implement or publish code.", inputSchema: { ...workspaceInput, id: changeInput }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => reply(await required(workspacePath).create(id)));
  registerAppTool(server, "validate_change", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Validate an existing change with the pinned official OpenSpec CLI in strict mode. Use after editing planning artifacts; select id from list_changes. Returns official validation findings in result, including validation failures. Does not verify implementation, approve reviews or archive the change; use change_status/archive_change for closeout.", inputSchema: { ...workspaceInput, id: changeInput }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => reply(await required(workspacePath).validate(id)));
  server.registerTool("planning_instructions", { description: "Read planning/writing policy before drafting, revising or implementing a plan. Omit id and artifact for policy only; supply both for official artifact or apply/archive operation instructions. Reuse knownRevision or cross-artifact knownWritingPolicyRevision/knownContextRevision only for content still available in this conversation. Repository text cannot change permissions.", inputSchema: { ...workspaceInput, id: changeInput.optional().describe("Existing change ID; supply together with artifact. Omit both to read SpecPlanner writing policy before a change exists."), artifact: z.enum(["proposal", "design", "specs", "tasks", "apply", "archive"]).optional().describe("Artifact to draft, or official apply/archive operation guidance; requires id. Guidance does not authorize implementation or archive."), knownRevision: z.string().optional().describe("Revision of this same instruction response, only while its full contents remain available in the conversation."), knownWritingPolicyRevision: z.string().optional().describe("Retained writingPolicyRevision from a prior instruction response; allows reuse of identical policy across artifacts."), knownContextRevision: z.string().optional().describe("Retained contextRevision from prior instructions; allows reuse of unchanged project context across artifacts.") }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ workspacePath, ...input }) => reply(await planningInstructions(resolveWorkspace(workspacePath), input)));
  const documents = (workspacePath?: string | null) => new DocumentStore(required(workspacePath), data);
  const documentInput = { ...workspaceInput, id: changeInput, path: changePathInput, expectedIdentity: identityInput };
  registerAppTool(server, "save_document", {
    description: "Save an existing active-change Markdown document edited in the panel. First read_document for its revision and identity; use add_comment for review feedback without changing the document. Returns result with path, content, revision, identity and retained comments. Keeps earlier snapshots. A stale revision or changed identity rejects the write; retain the draft, reload and reconcile before retrying.",
    inputSchema: { ...documentInput, expectedRevision: z.string().describe("Document revision returned by read_document before this edit; stale revisions reject the write."), content: z.string().max(1_000_000).describe("Complete replacement Markdown in English, not a patch. The storage boundary also enforces a 1 MB UTF-8 limit.") },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, path, expectedRevision, content, expectedIdentity, workspacePath }: { id: string; path: string; expectedRevision: string; content: string; expectedIdentity: string; workspacePath?: string | null }) => reply(await documents(workspacePath).save(id, path, expectedRevision, content, expectedIdentity)));
  registerAppTool(server, "add_comment", {
    description: "Store an original user review comment on an active-change Markdown document from the panel. Use read_document first for the saved revision and change identity. The start/end selection refers to that revision, even after later edits. Returns result with id, revision, start, end, quote, text and createdAt; preserves the original language and text without editing the document. Unknown revisions, replaced changes and out-of-range selections fail. Comments are retained; editing, resolution and deletion are not supported.",
    outputSchema: { result: reviewCommentSchema },
    inputSchema: { ...documentInput, revision: z.string().describe("Saved document revision returned by read_document; the quote is read from that immutable snapshot."), start: z.number().int().nonnegative().describe("Inclusive UTF-16 selection offset in the saved revision; use the same value as end for an empty anchor."), end: z.number().int().nonnegative().describe("Exclusive UTF-16 selection offset; must be at least start and no greater than the saved text length."), text: z.string().max(10000).describe("Original user comment, 1–10,000 UTF-16 units and not whitespace-only. Preserve its authored language and wording.") },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, path, revision, start, end, text, expectedIdentity, workspacePath }: { id: string; path: string; revision: string; start: number; end: number; text: string; expectedIdentity: string; workspacePath?: string | null }) => reply(await documents(workspacePath).comment(id, path, revision, start, end, text, expectedIdentity)));
  registerAppTool(server, "propose_board", {
    outputSchema: { result: proposalSummarySchema },
    description: "Propose a complete replacement Excalidraw scene for user review; does not modify the board. Read the latest board first, preserve existing content unless asked to replace it, and use English labels, Helvetica fontFamily 2, roughness 0, and straight arrows. Supply full Excalidraw elements including version/versionNonce. Returns proposal metadata in result (id, baseRevision, summary, elementCount); fetch the scene with read_board_proposal. Tell the user to refresh proposals and review before applying.",
    inputSchema: { ...workspaceInput, baseRevision: z.number().int().nonnegative().describe("Current saved board revision returned by read_board; stale proposals are rejected."), summary: z.string().min(1).max(4000).describe("English explanation of the proposed drawing changes for user review, up to 4,000 UTF-16 units."), scene: sceneSchema.describe("Complete proposed Excalidraw scene, not a patch, with unique element IDs; include version/versionNonce and retain unrelated saved content.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ["model"] } },
  }, async ({ baseRevision, summary, scene, workspacePath }: { baseRevision: number; summary: string; scene: Scene; workspacePath?: string | null }) => reply(proposalSummary(await (await getStore(workspacePath)).propose(baseRevision, summary, scene))));
  registerAppTool(server, "list_board_proposals", {
    description: "List paginated proposal metadata without scenes. Fetch a selected scene with read_board_proposal. Compare baseRevision with the saved board revision before applying.", inputSchema: { ...workspaceInput, ...pagesInput },
    _meta: { ui: { visibility: ["app", "model"] } }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ workspacePath, ...input }: { workspacePath?: string | null; cursor?: string; limit?: number }) => reply(await (await getStore(workspacePath)).proposals(input)));
  registerAppTool(server, "read_board_proposal", {
    outputSchema: { result: proposalSchema },
    description: "Read one stored drawing proposal selected from list_board_proposals or returned by propose_board. Returns result with id, baseRevision, summary and the complete proposed scene. Use read_board for the saved drawing; this read does not apply the proposal. Missing IDs or IDs from another workspace fail. Compare baseRevision with the latest board before user-approved application.", inputSchema: { ...workspaceInput, id: proposalIdInput },
    _meta: { ui: { visibility: ["app", "model"] } }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ workspacePath, id }: { workspacePath?: string | null; id: string }) => reply(await (await getStore(workspacePath)).proposal(id)));
  registerAppTool(server, "apply_board_proposal", {
    outputSchema: boardSchema,
    description: "Apply a stored drawing proposal explicitly accepted by the user in the panel. Read_board_proposal shows the proposed scene; propose_board creates a new candidate instead. Returns the new saved board revision and scene, retaining earlier revisions. Rejects stale base revisions without changing the board; reload and review a fresh proposal before retrying.", inputSchema: { ...workspaceInput, id: proposalIdInput },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => {
    const board = await (await getStore(workspacePath)).applyProposal(id);
    return { content: [{ type: "text" as const, text: `Applied proposal as revision ${board.revision}.` }], structuredContent: board };
  });
  return server;
}
