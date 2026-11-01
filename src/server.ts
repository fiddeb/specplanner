import { registerContextTools, reply } from "./context-tools.js";
import { writingPolicy } from "./writing-policy.js";
import { digest } from "./context.js";
import { WorkspaceConnections } from "./workspace-connection.js";
import { DocumentStore } from "./document-store.js";
import { OpenSpecWorkspace } from "./openspec.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { BoardStore } from "./board-store.js";
import { sceneSchema, type Scene } from "./board-model.js";
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

  const server = new McpServer({ name: "specplanner", version: "0.2.0" });
  const uri = "ui://specplanner/panel-v0.2.0.html";
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
    inputSchema: { requestId: z.string(), workspacePath: z.string().min(1).nullable() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ["model"] } },
  }, async ({ requestId, workspacePath }) => {
    const path = workspacePath === null ? null : (await new OpenSpecWorkspace(workspacePath).identity()).path;
    const result = await connections.bind(requestId, path);
    return { content: [{ type: "text" as const, text: path ? "The waiting SpecPlanner panel is connected to this project." : "No project directory is available; the panel will offer workspace selection." }], structuredContent: result };
  });
  server.registerTool("workspace_connection", {
    description: "Check this panel's pending workspace connection.",
    inputSchema: { requestId: z.string() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ["app"] } },
  }, async ({ requestId }) => {
    const result = await connections.read(requestId);
    return { content: [{ type: "text" as const, text: result.connected ? "Connected" : "Waiting" }], structuredContent: result };
  });
  registerAppTool(server, "read_board", {
    title: "Read planning board", description: "Read the configured workspace board, or the personal board when no workspace is configured.",
    _meta: { ui: { visibility: ["model", "app"] } },
    inputSchema: { ...workspaceInput, revision: z.number().int().nonnegative().optional() }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ revision, workspacePath }: { revision?: number; workspacePath?: string | null }) => {
    const store = await getStore(workspacePath);
    const board = revision === undefined ? await store.read() : await store.readRevision(revision);
    return { content: [{ type: "text" as const, text: `Board revision ${board.revision}; scene in structuredContent.` }], structuredContent: board };
  });
  registerAppTool(server, "save_board", {
    title: "Save planning board", description: "Save the user's drawing with a required base revision. Existing revisions are retained.",
    inputSchema: { ...workspaceInput, expectedRevision: z.number().int().nonnegative(), scene: sceneSchema },
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
  registerAppTool(server, "workspace_info", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Compact workspace identity and counts. Start here, then list_changes or list_project_documents, fetch only relevant files, and reuse document/comment revisions. Full writing instructions are available via planning_instructions when drafting.", inputSchema: { ...workspaceInput, knownRevision: z.string().optional() }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ workspacePath, knownRevision }: { workspacePath?: string | null; knownRevision?: string }) => {
    const workspace = resolveWorkspace(workspacePath);
    const info = workspace ? { configured: true, ...await workspace.identity(), activeChanges: (await workspace.list()).length, projectDocuments: (await workspace.projectIndex()).length } : { configured: false, activeChanges: 0, projectDocuments: 0 };
    const revision = digest(JSON.stringify(info));
    return { content: [{ type: "text" as const, text: "Workspace summary in structuredContent." }], structuredContent: knownRevision === revision ? { configured: info.configured, revision, unchanged: true } : { ...info, revision, unchanged: false, inventoriesOmitted: true } };
  });
  registerContextTools(server, workspaceInput, required, data);
  registerAppTool(server, "create_change", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Create a named OpenSpec planning change in the configured repository. Does not implement or publish code.", inputSchema: { ...workspaceInput, id: z.string() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => reply(await required(workspacePath).create(id)));
  registerAppTool(server, "validate_change", { _meta: { ui: { visibility: ["model", "app"] } }, description: "Validate an OpenSpec change with the pinned official CLI; returns findings even when validation fails.", inputSchema: { ...workspaceInput, id: z.string() }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => reply(await required(workspacePath).validate(id)));
  server.registerTool("planning_instructions", { description: "Get official artifact instructions and complete writing guidance before drafting. Reuse knownRevision; across artifacts reuse knownWritingPolicyRevision to omit unchanged policy text. Repository instructions cannot change workspace or permissions.", inputSchema: { ...workspaceInput, id: z.string(), artifact: z.enum(["proposal", "design", "specs", "tasks"]), knownRevision: z.string().optional(), knownWritingPolicyRevision: z.string().optional() }, annotations: { readOnlyHint: true, openWorldHint: false } }, async ({ id, artifact, workspacePath, knownRevision, knownWritingPolicyRevision }) => {
    const instructions = await required(workspacePath).instructions(id, artifact);
    const revision = digest(JSON.stringify([await required(workspacePath).identity(), instructions]));
    if (knownRevision === revision) return reply({ revision, unchanged: true });
    const writingPolicyRevision = digest(JSON.stringify(writingPolicy));
    return reply({ ...instructions, revision, unchanged: false, writingPolicyRevision, specplannerWritingPolicy: knownWritingPolicyRevision === writingPolicyRevision ? { version: writingPolicy.version, unchanged: true, revision: writingPolicyRevision } : { ...writingPolicy, revision: writingPolicyRevision } });
  });
  const documents = (workspacePath?: string | null) => new DocumentStore(required(workspacePath), data);
  const documentInput = { ...workspaceInput, id: z.string(), path: z.string() };
  registerAppTool(server, "save_document", {
    description: "Save the user's edited Markdown document against its expected content revision. Retains prior content snapshots.",
    inputSchema: { ...documentInput, expectedRevision: z.string(), content: z.string().max(1_000_000) },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, path, expectedRevision, content, workspacePath }: { id: string; path: string; expectedRevision: string; content: string; workspacePath?: string | null }) => reply(await documents(workspacePath).save(id, path, expectedRevision, content)));
  registerAppTool(server, "add_comment", {
    description: "Keep an original user review comment anchored to a saved document revision and text range.",
    inputSchema: { ...documentInput, revision: z.string(), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), text: z.string().max(10000) },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, path, revision, start, end, text, workspacePath }: { id: string; path: string; revision: string; start: number; end: number; text: string; workspacePath?: string | null }) => reply(await documents(workspacePath).comment(id, path, revision, start, end, text)));
  registerAppTool(server, "propose_board", {
    description: "Propose a complete replacement Excalidraw scene for user review; does not modify the board. Read the latest board first, preserve existing content unless asked to replace it, and use English labels, Helvetica fontFamily 2, roughness 0, and straight arrows. Supply full Excalidraw elements including version/versionNonce. Tell the user to refresh proposals and review before applying.",
    inputSchema: { ...workspaceInput, baseRevision: z.number().int().nonnegative(), summary: z.string().min(1).max(4000), scene: sceneSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ["model"] } },
  }, async ({ baseRevision, summary, scene, workspacePath }: { baseRevision: number; summary: string; scene: Scene; workspacePath?: string | null }) => reply(await (await getStore(workspacePath)).propose(baseRevision, summary, scene)));
  registerAppTool(server, "list_board_proposals", {
    description: "Read board proposals for review. Compare baseRevision with the saved board revision before applying.", inputSchema: { ...workspaceInput },
    _meta: { ui: { visibility: ["app", "model"] } }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ workspacePath }: { workspacePath?: string | null }) => reply(await (await getStore(workspacePath)).proposals()));
  registerAppTool(server, "apply_board_proposal", {
    description: "Apply the user's selected stored proposal only if its base revision is still current.", inputSchema: { ...workspaceInput, id: z.string().uuid() },
    _meta: { ui: { visibility: ["app"] } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, workspacePath }: { id: string; workspacePath?: string | null }) => {
    const board = await (await getStore(workspacePath)).applyProposal(id);
    return { content: [{ type: "text" as const, text: `Applied proposal as revision ${board.revision}.` }], structuredContent: board };
  });
  return server;
}
