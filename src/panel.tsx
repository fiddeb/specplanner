import { bindWorkspace } from "./panel-client.js";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";
import { Plan } from "./plan.js";
import { Board } from "./board.js";
import "./panel.css";

document.documentElement.dataset.embedded = String(window.parent !== window);

function Planner() {
  const [workspacePath, setWorkspacePath] = useState<string | null | undefined>();
  const [connection, setConnection] = useState<App | null>(null);
  const initialized = useRef(false);
  const [connectionRequestId, setConnectionRequestId] = useState<string>();
  const [connectingProject, setConnectingProject] = useState(false);
  const sentRequests = useRef(new Set<string>());
  useEffect(() => {
    if (!connection || !connectionRequestId || initialized.current) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    setConnectingProject(true);
    async function check() {
      try {
        const result = await connection!.callServerTool({ name: "workspace_connection", arguments: { requestId: connectionRequestId } });
        if (stopped || initialized.current) return;
        if (result.isError) throw new Error(result.content?.filter(item => item.type === "text").map(item => item.text).join(" ") || "Unable to connect this project.");
        const info = result.structuredContent as { connected?: boolean; workspacePath?: string | null };
        if (info.connected && (typeof info.workspacePath === "string" || info.workspacePath === null)) {
          initialized.current = true; setWorkspacePath(info.workspacePath); setConnectingProject(false); return;
        }
        if (Date.now() - started > 120_000) throw new Error("The agent has not connected this panel yet. Reopen SpecPlanner to retry, or choose a repository below.");
        timer = setTimeout(() => void check(), 2000);
      } catch (error) { if (!stopped) { setConnectingProject(false); setWorkspaceError(error instanceof Error ? error.message : "Project connection failed."); } }
    }
    async function connectProject() {
      try {
        if (!sentRequests.current.has(connectionRequestId!)) {
          sentRequests.current.add(connectionRequestId!);
          const sent = await connection!.sendMessage({ role: "user", content: [{ type: "text", text: `Connect the SpecPlanner panel I opened to this chat's current project. Call SpecPlanner connect_workspace with requestId "${connectionRequestId}" and workspacePath set to this chat's trusted absolute project directory, or null if this chat has no project. Do not open another panel or change project files.` }] });
          if (sent.isError) throw new Error("Codex could not receive the project connection request.");
        }
        if (!stopped) await check();
      } catch (error) { if (!stopped) { setConnectingProject(false); setWorkspaceError(error instanceof Error ? error.message : "Project connection failed."); } }
    }
    void connectProject();
    return () => { stopped = true; clearTimeout(timer); };
  }, [connection, connectionRequestId, workspacePath]);
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [pendingWorkspace, setPendingWorkspace] = useState<string>();
  const [selecting, setSelecting] = useState(false);
  const [tab, setTab] = useState("Board");
  const scoped = useMemo(() => connection && workspacePath !== undefined ? bindWorkspace(connection, workspacePath) : null, [connection, workspacePath]);
  async function chooseWorkspace() {
    if (!connection) return;
    setSelecting(true); setWorkspaceError("");
    try {
      const result = await connection.callServerTool({ name: "workspace_info", arguments: { workspacePath: workspaceDraft.trim() } });
      if (result.isError) throw new Error(result.content?.filter(item => item.type === "text").map(item => item.text).join(" ") || "Unable to open workspace.");
      const info = result.structuredContent as { path: string };
      if (workspacePath === null) { setPendingWorkspace(info.path); return; }
      initialized.current = true; setWorkspacePath(info.path);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : "Unable to open workspace."); }
    finally { setSelecting(false); }
  }
  const [theme, setTheme] = useState<"light" | "dark">(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [status, setStatus] = useState("Connecting to the host…");
  useEffect(() => {
    applyDocumentTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (window.parent === window) {
      setStatus("Preview only · Open through an MCP host to connect");
      return;
    }
    const app = new App({ name: "SpecPlanner", version: "0.1.8" }, {}, { autoResize: false });
    const syncTheme = (ctx: ReturnType<App["getHostContext"]>) => {
      if (ctx?.theme) { applyDocumentTheme(ctx.theme); setTheme(ctx.theme); }
      if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
      if (ctx?.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
    };
    app.onhostcontextchanged = () => syncTheme(app.getHostContext());
    app.ontoolresult = result => {
      setStatus("Connected to the agent · v0.1.8");
      const info = result.structuredContent as { workspacePath?: unknown; connectionRequestId?: string } | undefined;
      if (!initialized.current && info?.connectionRequestId) { setConnectionRequestId(info.connectionRequestId); return; }
      if (!initialized.current && info && (typeof info.workspacePath === "string" || info.workspacePath === null)) {
        initialized.current = true; setWorkspacePath(info.workspacePath as string | null);
      }
    };
    app.connect().then(() => { syncTheme(app.getHostContext()); setConnection(app); setStatus("Connected to the host · v0.1.8");  }).catch(() => setStatus("No MCP host connected"));
    return () => { void app.close(); };
  }, []);
  return <main className={tab === "Board" ? "planner with-board" : "planner"}>
    <header><span className="eyebrow">SPECPLANNER</span><h1>Room for your next idea.</h1><p>Explore a solution together, from the first sketch to a reviewed plan.</p></header>
    {connection && <div className="workspace-context">
      {workspacePath ? <p className="workspace-path">Workspace: {workspacePath}</p> : <>
        <p role="status">{connectingProject ? "Connecting to this chat’s project through Codex…" : "Choose a repository if this chat has no project, or if the automatic connection could not complete."}</p>
        <form onSubmit={event => { event.preventDefault(); void chooseWorkspace(); }}><label>Repository path<input value={workspaceDraft} onChange={event => setWorkspaceDraft(event.target.value)} placeholder="/absolute/path/to/repository" required disabled={selecting} /></label><button disabled={selecting}>{selecting ? "Opening…" : "Use workspace"}</button></form>
        {workspacePath === undefined && <button onClick={() => { initialized.current = true; setWorkspacePath(null); }}>Use personal board</button>}
        {pendingWorkspace && <div role="group" aria-label="Confirm workspace switch"><p>Open {pendingWorkspace}? Unsaved personal board drafts will be discarded. Saved drawings remain in your personal board.</p><button onClick={() => { initialized.current = true; setWorkspacePath(pendingWorkspace); setPendingWorkspace(undefined); }}>Open this workspace</button><button onClick={() => setPendingWorkspace(undefined)}>Cancel</button></div>}
        {workspaceError && <p role="alert">{workspaceError}</p>}
      </>}
    </div>}
    <nav aria-label="Planning views">{["Plan", "Board", "Decisions"].map(name => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <div className="board-view" hidden={tab !== "Board"}>{window.parent === window || scoped ? <Board key={workspacePath ?? "personal"} app={scoped} theme={theme} /> : <p>Connecting to board storage…</p>}</div>
    <div className="plan-view" hidden={tab !== "Plan"}><Plan key={workspacePath ?? "personal"} app={scoped} /></div>
    <section hidden={tab !== "Decisions"}>
      <span className="eyebrow">{tab}</span>
      <h2>{tab === "Plan" ? "A shared direction" : tab === "Board" ? "Make the idea visible" : "What we agree on"}</h2>
      <p>{tab === "Plan" ? "Review proposals, design, requirements, and tasks together here." : tab === "Board" ? "The official Excalidraw editor will appear here, with clean lines, rounded boxes, and sans-serif text." : "Keep decisions and open questions connected to the plan here."}</p>
      <div className="notice">Early prototype · Documents and drawings are not connected yet.</div>
    </section>
    <footer role="status">{status}</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Planner />);
