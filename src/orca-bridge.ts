import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { OpenSpecWorkspace } from "./openspec.js";
import { downloadChunkSize, transferLimit, uploadChunkSize, type OrcaBinding, type OrcaHost, type OrcaRequestContext, type OrcaStorage } from "./orca-contract.js";

const panelTools = new Set(["workspace_info", "read_board", "save_board", "list_board_proposals", "read_board_proposal", "apply_board_proposal", "list_changes", "list_project_documents", "read_project_document", "read_change", "read_document", "create_change", "validate_change", "save_document", "add_comment", "change_status", "archive_change"]);
const token = z.string().uuid();
const callInput = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).strict();
type Session = OrcaBinding & { workspaceId: string | null };
const sessionSchema = z.object({ session: token, workspacePath: z.string().nullable(), workspaceId: z.string().nullable() });
type Transfer = { panelId: string; session: string; expectedLength: number; text: string; state: "upload" | "running" | "download"; touched: number };

/** Binds each frame to host context and chunks large scenes across Orca's 64 KiB request boundary. */
export class OrcaBridge {
  private sessions = new Map<string, Session>();
  private connecting = new Set<string>();
  private transfers = new Map<string, Transfer>();
  constructor(private host: OrcaHost, private callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>, private storage: OrcaStorage, private now = Date.now) {}

  sweep() {
    for (const [id, value] of this.transfers) if (this.now() - value.touched > 120_000) this.transfers.delete(id);
  }
  private async workspace(workspaceId: string) {
    const listing = await this.host.call("workspace.list", {});
    const workspace = listing.workspaces.find(item => item.id === workspaceId);
    if (!workspace) throw new Error("This workspace is unavailable in Orca. Reopen the panel in a local repository.");
    if (workspace.hostId !== "local" && workspace.hostId !== null) throw new Error("Native SpecPlanner currently supports local repositories. Use MCP on the repository's host for remote workspaces.");
    return (await new OpenSpecWorkspace(workspace.path).identity()).path;
  }
  private key(panelId: string) { return `binding-${createHash("sha256").update(panelId).digest("hex")}`; }
  private async storedSession(panelId: string) {
    const cached = this.sessions.get(panelId);
    if (cached) return cached;
    const saved = await this.storage.get(this.key(panelId));
    if (saved == null) return undefined;
    const session = sessionSchema.parse(saved);
    if (this.sessions.size >= 128) this.sessions.delete(this.sessions.keys().next().value!);
    this.sessions.set(panelId, session);
    return session;
  }
  private async session(panelId: string, id: string) {
    const session = await this.storedSession(panelId);
    if (!session || session.session !== id) throw new Error("The panel connection expired. Reopen it; saved work is retained.");
    return session;
  }
  private transfer(panelId: string, id: string) {
    const value = this.transfers.get(id);
    if (!value || value.panelId !== panelId) throw new Error("Transfer expired or belongs to another panel.");
    value.touched = this.now();
    return value;
  }
  async request(name: string, input: unknown, context: OrcaRequestContext): Promise<unknown> {
    this.sweep();
    context.signal.throwIfAborted();
    const panelId = context.panel.id;
    if (name === "planner.connect") {
      const { personal } = z.object({ personal: z.boolean().optional() }).strict().parse(input);
      if (this.connecting.has(panelId)) throw new Error("A connection is already in progress. Retry when it finishes.");
      this.connecting.add(panelId);
      try {
        const existing = await this.storedSession(panelId);
        context.signal.throwIfAborted();
        if (existing) {
          if (personal && existing.workspacePath !== null) throw new Error("This panel is already bound to a repository. Reopen it to choose personal storage.");
          return { session: existing.session, workspacePath: existing.workspacePath };
        }
        const workspaceId = personal ? null : (await this.host.call("workspace.readContext", {}))?.workspaceId;
        context.signal.throwIfAborted();
        if (!personal && !workspaceId) throw new Error("Select a local repository in Orca, then retry, or use the personal board.");
        const workspacePath = workspaceId ? await this.workspace(workspaceId) : null;
        context.signal.throwIfAborted();
        // Persist before answering: idle worker restarts must retain this frame's project.
        const binding: Session = { session: randomUUID(), workspacePath, workspaceId: workspaceId ?? null };
        await this.storage.set(this.key(panelId), binding);
        context.signal.throwIfAborted();
        return { session: binding.session, workspacePath };
      } finally { this.connecting.delete(panelId); }
    }
    if (name === "planner.begin") {
      const { session, length } = z.object({ session: token, length: z.number().int().min(1).max(transferLimit) }).strict().parse(input);
      await this.session(panelId, session);
      context.signal.throwIfAborted();
      if (this.transfers.size >= 16 || [...this.transfers.values()].reduce((sum, item) => sum + item.expectedLength, 0) + length > 16_400_000) throw new Error("Too many pending transfers. Wait for the current operation to finish.");
      const id = randomUUID();
      this.transfers.set(id, { panelId, session, expectedLength: length, text: "", state: "upload", touched: this.now() });
      return { id };
    }
    const { id } = z.object({ id: token }).parse(input);
    const transfer = this.transfer(panelId, id);
    if (name === "planner.release") { this.transfers.delete(id); return {}; }
    if (name === "planner.append") {
      const { offset, text } = z.object({ offset: z.number().int().nonnegative(), text: z.string().min(1).max(uploadChunkSize) }).parse(input);
      if (transfer.state !== "upload" || offset !== transfer.text.length || offset + text.length > transfer.expectedLength) throw new Error("Invalid transfer offset or length.");
      transfer.text += text;
      return {};
    }
    if (name === "planner.execute") {
      if (transfer.state !== "upload" || transfer.text.length !== transfer.expectedLength) throw new Error("Transfer is incomplete or already executed.");
      transfer.state = "running"; // Never replay a mutation, including after a timeout.
      const call = callInput.parse(JSON.parse(transfer.text));
      transfer.text = "";
      if (!panelTools.has(call.name)) throw new Error("This tool is not available to the Orca panel.");
      const session = await this.session(panelId, transfer.session);
      if (session.workspaceId && await this.workspace(session.workspaceId) !== session.workspacePath) throw new Error("The workspace path changed. Reopen the panel before continuing.");
      context.signal.throwIfAborted();
      const result = await this.callTool(call.name, { ...call.arguments, workspacePath: session.workspacePath });
      transfer.text = JSON.stringify(result);
      if (transfer.text.length > transferLimit) { this.transfers.delete(id); throw new Error("The response exceeds the native panel transfer limit. Use narrower document reads."); }
      transfer.expectedLength = transfer.text.length;
      transfer.state = "download";
      transfer.touched = this.now();
      return { length: transfer.text.length };
    }
    if (name === "planner.read") {
      const { offset } = z.object({ offset: z.number().int().nonnegative() }).parse(input);
      if (transfer.state !== "download" || offset >= transfer.text.length) throw new Error("Invalid response offset.");
      return { text: transfer.text.slice(offset, offset + downloadChunkSize) };
    }
    throw new Error("Unknown SpecPlanner request.");
  }
}
