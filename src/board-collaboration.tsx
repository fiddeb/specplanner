import React, { useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { PanelClient } from "./panel-client.js";
import { boardSchema, proposalSchema, proposalSummarySchema, type BoardProposal, type ProposalSummary } from "./board-model.js";
import type { Page } from "./panel-reading.js";

export function BoardCollaboration({ app, revision, dirty, busy, setBusy, reload, theme }: {
  app: PanelClient; revision: number; dirty: boolean; busy: boolean; setBusy: (value: boolean) => void;
  reload: () => Promise<void>; theme: "light" | "dark";
}) {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [proposalPage, setProposalPage] = useState<Page<ProposalSummary>>();
  const [selected, setSelected] = useState<BoardProposal>();
  const [request, setRequest] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Operation failed."); }
    finally { setBusy(false); }
  }
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await app.callServerTool({ name, arguments: args });
    if (result.isError) throw new Error(result.content?.filter(item => item.type === "text").map(item => item.text).join(" ") || "Operation failed.");
    return result;
  }
  async function send(mode: "draw" | "discuss") {
    const info = await call("workspace_info");
    const workspace = info.structuredContent as { configured: boolean; path?: string };
    const text = [
      `SpecPlanner ${mode === "draw" ? "drawing request" : "board review"}.`,
      workspace.configured ? `Workspace: ${workspace.path}` : "Workspace: personal board for this SpecPlanner connection.",
      `For every SpecPlanner tool call, pass workspacePath: ${JSON.stringify(workspace.configured ? workspace.path : null)}. Read the saved board using read_board with revision ${revision}. This is the version I am referring to.`,
      mode === "draw" ? "Read the latest board too, then use propose_board to propose the requested drawing for review. Preserve existing content unless my request requires replacing it. Use English labels, clean straight lines and sans-serif text. Do not apply the proposal automatically." : "Discuss my saved drawing and explain the implications for the plan. If an earlier board revision exists, compare it. Propose document or drawing changes for review; do not apply changes automatically.",
      `My request:\n${request.trim()}`,
    ].join("\n\n");
    setMessage(text);
    if (app.messageDelivery === "copy") return;
    const result = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    if (result.isError) throw new Error("The host did not accept the message. Copy the prepared message into the chat.");
    setStatus("Sent to Codex. When the proposal is ready, choose Refresh proposals.");
    setMessage("");
  }
  async function loadProposals(more = false) {
    const result = await call("list_board_proposals", more ? { cursor: proposalPage?.nextCursor } : {});
    const next = (result.structuredContent as { result: Page<ProposalSummary> }).result;
    const items = proposalSummarySchema.array().parse(next.items);
    setProposals(previous => more ? [...previous, ...items] : items);
    setProposalPage(next);
  }
  return <section className="board-collaboration" aria-label="Plan with Codex">
    <h2>Plan with Codex</h2>
    <label>Your request<textarea value={request} disabled={busy} maxLength={10000} onChange={event => setRequest(event.target.value)} placeholder="Draw the flow from Slack to the agent, including validation." /></label>
    <div className="board-actions">
      <button disabled={busy || dirty || !request.trim()} onClick={() => void run(() => send("draw"))}>{app.messageDelivery === "copy" ? "Prepare drawing request" : "Request drawing"}</button>
      <button disabled={busy || dirty || !request.trim()} onClick={() => void run(() => send("discuss"))}>{app.messageDelivery === "copy" ? "Prepare review request" : "Discuss changes"}</button>
      <button disabled={busy} onClick={() => void run(async () => {
        await loadProposals();
        setSelected(undefined); setStatus("Proposals refreshed.");
      })}>Refresh proposals</button>
    </div>
    {dirty && <p>Save your board before sending it to Codex or applying a proposal.</p>}
    <ul>{proposals.map(proposal => <li key={proposal.id}>
      <button disabled={busy} onClick={() => void run(async () => {
        const result = await call("read_board_proposal", { id: proposal.id });
        setSelected(proposalSchema.parse((result.structuredContent as { result: unknown }).result));
      })}>{proposal.summary}</button>
      <small> Based on v{proposal.baseRevision}{proposal.baseRevision !== revision ? " · Outdated" : " · Ready for review"}</small>
    </li>)}</ul>
    {proposalPage?.hasMore && <button disabled={busy} onClick={() => void run(() => loadProposals(true))}>Load more proposals</button>}
    {selected && <div>
      <p>{selected.summary}</p><p>This preview replaces the whole saved scene when applied. Previous saved versions are retained.</p>
      <div className="proposal-canvas"><Excalidraw key={selected.id} theme={theme} langCode="en" viewModeEnabled
        initialData={{ elements: restoreElements(selected.scene.elements as ExcalidrawInitialDataState["elements"], null), scrollToContent: true }}
        UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }} validateEmbeddable={() => false} /></div>
      <div className="board-actions"><button disabled={busy || dirty || selected.baseRevision !== revision} onClick={() => void run(async () => {
        const result = await call("apply_board_proposal", { id: selected.id });
        boardSchema.parse(result.structuredContent);
        setSelected(undefined); await reload(); setStatus("Proposal applied and saved.");
      })}>Apply to board</button><button disabled={busy} onClick={() => setSelected(undefined)}>Close preview</button></div>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <label>Message for chat<textarea readOnly value={message} onFocus={event => event.currentTarget.select()} /><small>{app.messageDelivery === "copy" ? "Copy this prepared message into your Codex chat." : "If the message did not arrive, copy it into the chat. Check the chat before retrying."}</small></label>}
  </section>;
}
