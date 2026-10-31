import { DocumentEditor } from "./document-editor.js";
import { MarkdownDocument } from "./markdown-document.js";
import React, { useEffect, useState } from "react";
import type { PanelClient } from "./panel-client.js";
type Workspace = { configured: boolean; name?: string; path?: string; changes: string[]; documents?: { path: string; category: string }[] };
type Change = { id: string; documents: { path: string; content: string }[] };
export function Plan({ app }: { app: PanelClient | null }) {
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({});
  const [generation, setGeneration] = useState(0);
  const hasDrafts = Object.values(dirtyPaths).some(Boolean);
  const onDirty = (path: string, dirty: boolean) => setDirtyPaths(previous => ({ ...previous, [path]: dirty }));
  const [workspace, setWorkspace] = useState<Workspace>();
  const [projectDocument, setProjectDocument] = useState<{ path: string; content: string }>();
  const [selected, setSelected] = useState<Change>();
  const [activePath, setActivePath] = useState("");
  const [openedPaths, setOpenedPaths] = useState<string[]>([]);
  const [browse, setBrowse] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  async function call(tool: string, args: Record<string, unknown> = {}) {
    if (!app) throw new Error("Open the installed plugin to access a repository.");
    const result = await app.callServerTool({ name: tool, arguments: args });
    if (result.isError) throw new Error(result.content?.filter(item => item.type === "text").map(item => item.text).join(" ") || "The operation failed.");
    return result.structuredContent as Record<string, unknown>;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "The operation failed."); } finally { setBusy(false); }
  }
  async function refresh() { setWorkspace(await call("workspace_info") as Workspace); }
  function showDocument(path: string) {
    setProjectDocument(undefined); setActivePath(path); setBrowse(false);
    setOpenedPaths(previous => previous.includes(path) ? previous : [...previous, path]);
  }
  async function open(id: string) {
    const change = (await call("read_change", { id })).result as Change;
    setSelected(change); setProjectDocument(undefined); setValidation(""); setGeneration(value => value + 1); setDirtyPaths({});
    const first = change.documents.find(document => document.path === "proposal.md") ?? change.documents[0];
    setActivePath(first?.path ?? ""); setOpenedPaths(first ? [first.path] : []); setBrowse(false);
  }
  useEffect(() => { if (app) void run(refresh); }, [app]);
  if (!app) return <p>Open the installed plugin to read project documents.</p>;
  if (!workspace?.configured) return <section><p>{busy ? "Loading workspace…" : "Choose a repository above to read its OpenSpec documents."}</p>{error && <p role="alert">{error}</p>}</section>;
  return <section className={`plan-pane document-workspace ${browse ? "is-browsing" : "is-reading"}`}>
    <div className="reader-toolbar"><button aria-expanded={browse} onClick={() => setBrowse(value => !value)}>{browse ? "Hide documents" : "Browse documents"}</button><span>{workspace.name}</span><button disabled={busy || hasDrafts} onClick={() => void run(async () => { await refresh(); if (selected) await open(selected.id); })}>Refresh</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="reader-layout">
      <aside className="document-browser" aria-label="OpenSpec documents">
        <h2>Changes</h2>
        {workspace.changes.length === 0 && <p>No active changes.</p>}
        <ul>{workspace.changes.map(id => <li key={id}><button aria-pressed={selected?.id === id} disabled={busy || hasDrafts} onClick={() => void run(() => open(id))}>{id}</button>{selected?.id === id && <ul>{selected.documents.map(document => <li key={document.path}><button disabled={busy} aria-pressed={!projectDocument && activePath === document.path} onClick={() => showDocument(document.path)}>{document.path}{dirtyPaths[document.path] ? " · Draft" : ""}</button></li>)}</ul>}</li>)}</ul>
        {(["project", "specification", "archive"] as const).map(category => <details key={category} open={category === "project"}><summary>{category === "project" ? "Project guidance" : category === "specification" ? "Current specifications" : "Archived changes"}</summary><ul>{workspace.documents?.filter(document => document.category === category).map(document => <li key={document.path}><button disabled={busy} aria-pressed={projectDocument?.path === document.path} onClick={() => void run(async () => {
          setProjectDocument((await call("read_project_document", { path: document.path })).result as { path: string; content: string }); setBrowse(false);
        })}>{document.path}</button></li>)}</ul></details>)}
        <details><summary>New change</summary><form onSubmit={event => { event.preventDefault(); if (hasDrafts) return; void run(async () => { await call("create_change", { id: name }); await refresh(); await open(name); setName(""); }); }}><label>Change name<input value={name} onChange={event => setName(event.target.value)} placeholder="add-feature" pattern="[a-z0-9]+(-[a-z0-9]+)*" required maxLength={100} /></label><button disabled={busy || hasDrafts}>Create change</button></form></details>
        {hasDrafts && <p>Save or discard drafts before changing to another change or refreshing.</p>}
      </aside>
      <div className="document-reading-area" aria-label="Document reader">
        {projectDocument && <article className="project-document"><header className="document-heading"><h2>{projectDocument.path}</h2><span>Read-only</span></header>{/\.md$/i.test(projectDocument.path) ? <MarkdownDocument content={projectDocument.content} /> : <pre className="spec-document">{projectDocument.content}</pre>}</article>}
        <div hidden={!!projectDocument}>
          {selected && <div className="change-heading"><span>{selected.id}</span><button disabled={busy} onClick={() => void run(async () => setValidation(JSON.stringify((await call("validate_change", { id: selected.id })).result, null, 2)))}>Validate</button></div>}
          {selected?.documents.length === 0 && <p>This change has no documents yet. Ask Codex to draft its proposal.</p>}
          {selected?.documents.filter(document => openedPaths.includes(document.path)).map(document => <div key={`${selected.id}/${document.path}/${generation}`} hidden={activePath !== document.path}><DocumentEditor id={selected.id} path={document.path} call={call} onDirty={onDirty} /></div>)}
          {validation && <details><summary>Validation result</summary><pre className="validation-result">{validation}</pre></details>}
        </div>
        {!selected && !projectDocument && <p className="reader-empty">Choose a change or project document to start reading.</p>}
      </div>
    </div>
  </section>;
}
