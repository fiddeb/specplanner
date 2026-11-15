import { ArchiveReview } from "./archive-review.js";
import { fullText, type Page } from "./panel-reading.js";
import { DocumentEditor } from "./document-editor.js";
import type { ReviewComment } from "./document-store.js";
import { MarkdownDocument } from "./markdown-document.js";
import { useEffect, useState } from "react";
import type { PanelClient } from "./panel-client.js";
type Workspace = { configured: boolean; name?: string; path?: string; activeChanges: number; changes: string[]; documents?: { path: string; category: string }[] };
type LibraryDocument = { path: string; category: string };
type Change = { id: string; documents: { path: string }[]; page: Page<{ path: string }> };
export function Plan({ app }: { app: PanelClient | null }) {
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({});
  const [generation, setGeneration] = useState(0);
  const hasDrafts = Object.values(dirtyPaths).some(Boolean);
  const onDirty = (path: string, dirty: boolean) => setDirtyPaths(previous => ({ ...previous, [path]: dirty }));
  const [workspace, setWorkspace] = useState<Workspace>();
  const [changePage, setChangePage] = useState<Page<string>>();
  const [libraryPages, setLibraryPages] = useState<Partial<Record<string, Page<LibraryDocument>>>>({});
  const [projectDocument, setProjectDocument] = useState<{ path: string; content: string; comments?: ReviewComment[] }>();
  const [selected, setSelected] = useState<Change>();
  const [activePath, setActivePath] = useState("");
  const [openedPaths, setOpenedPaths] = useState<string[]>([]);
  const [browse, setBrowse] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [archiveResult, setArchiveResult] = useState<unknown>();
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
  async function refresh() {
    const info = await call("workspace_info") as Workspace;
    if (!info.configured) { setWorkspace({ ...info, changes: [] }); return; }
    const changes = (await call("list_changes")).result as Page<string>;
    const documents = (await call("list_project_documents", { category: "project" })).result as Page<LibraryDocument>;
    setChangePage(changes); setLibraryPages({ project: documents }); setWorkspace({ ...info, changes: changes.items, documents: documents.items });
  }
  async function loadLibrary(category: string, more = false) {
    const next = (await call("list_project_documents", { category, ...(more ? { cursor: libraryPages[category]?.nextCursor } : {}) })).result as Page<LibraryDocument>;
    setLibraryPages(previous => ({ ...previous, [category]: next }));
    setWorkspace(previous => previous && { ...previous, documents: [...(previous.documents ?? []).filter(document => more || document.category !== category), ...next.items] });
  }
  function showDocument(path: string) {
    setProjectDocument(undefined); setActivePath(path); setBrowse(false);
    setOpenedPaths(previous => previous.includes(path) ? previous : [...previous, path]);
  }
  async function open(id: string) {
    const manifest = (await call("read_change", { id })).result as { id: string; documents: Page<{ path: string }> };
    const change: Change = { id, documents: manifest.documents.items.filter(document => document.path.endsWith(".md")), page: manifest.documents };
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
        {workspace.activeChanges === 0 && <p>No active changes.</p>}
        <ul>{workspace.changes.map(id => <li key={id}><button aria-pressed={selected?.id === id} disabled={busy || hasDrafts} onClick={() => void run(() => open(id))}>{id}</button>{selected?.id === id && <ul>{selected.documents.map(document => <li key={document.path}><button disabled={busy} aria-pressed={!projectDocument && activePath === document.path} onClick={() => showDocument(document.path)}>{document.path}{dirtyPaths[document.path] ? " · Draft" : ""}</button></li>)}</ul>}</li>)}</ul>
        {changePage?.hasMore && <button disabled={busy} onClick={() => void run(async () => {
          const next = (await call("list_changes", { cursor: changePage.nextCursor })).result as Page<string>;
          setChangePage(next); setWorkspace(previous => previous && { ...previous, changes: [...previous.changes, ...next.items] });
        })}>Load more changes</button>}
        {selected?.page.hasMore && <button disabled={busy} onClick={() => void run(async () => {
          const next = ((await call("read_change", { id: selected.id, cursor: selected.page.nextCursor })).result as { documents: Page<{ path: string }> }).documents;
          setSelected(previous => previous && { ...previous, documents: [...previous.documents, ...next.items.filter(document => document.path.endsWith(".md"))], page: next });
        })}>Load more change files</button>}
        {(["project", "specification", "archive"] as const).map(category => <details key={category} open={category === "project"} onToggle={event => { if (event.currentTarget.open && !libraryPages[category] && !busy) void run(() => loadLibrary(category)); }}><summary>{category === "project" ? "Project guidance" : category === "specification" ? "Current specifications" : "Archived changes"}</summary><ul>{workspace.documents?.filter(document => document.category === category).map(document => <li key={document.path}><button disabled={busy} aria-pressed={projectDocument?.path === document.path} onClick={() => void run(async () => {
          const loaded = await fullText(call, "read_project_document", { path: document.path }); setProjectDocument({ path: document.path, content: loaded.content, comments: loaded.comments as ReviewComment[] }); setBrowse(false);
        })}>{document.path}</button></li>)}</ul>{libraryPages[category]?.hasMore && <button disabled={busy} onClick={() => void run(() => loadLibrary(category, true))}>Load more documents</button>}</details>)}
        <details><summary>New change</summary><form onSubmit={event => { event.preventDefault(); if (hasDrafts) return; void run(async () => { await call("create_change", { id: name }); await refresh(); await open(name); setName(""); }); }}><label>Change name<input value={name} onChange={event => setName(event.target.value)} placeholder="add-feature" pattern="[a-z0-9]+(-[a-z0-9]+)*" required maxLength={100} /></label><button disabled={busy || hasDrafts}>Create change</button></form></details>
        {hasDrafts && <p>Save or discard drafts before changing to another change or refreshing.</p>}
      </aside>
      <div className="document-reading-area" aria-label="Document reader">
        {archiveResult != null && <><p role="status">The change was archived. Original files and review history were retained.</p><details><summary>Archive receipt and recovery details</summary><pre className="validation-result">{JSON.stringify(archiveResult, null, 2)}</pre></details></>}
        {projectDocument && <article className="project-document"><header className="document-heading"><h2>{projectDocument.path}</h2><span>Read-only</span></header>{/\.md$/i.test(projectDocument.path) ? <MarkdownDocument content={projectDocument.content} /> : <pre className="spec-document">{projectDocument.content}</pre>}{!!projectDocument.comments?.length && <details><summary>Original review comments ({projectDocument.comments.length})</summary><ul className="review-comments">{projectDocument.comments.map(comment => <li key={comment.id}>{comment.quote && <blockquote>{comment.quote}</blockquote>}<p>{comment.text}</p><small>Saved revision: {comment.revision}</small></li>)}</ul></details>}</article>}
        <div hidden={!!projectDocument}>
          {selected && <div className="change-heading"><span>{selected.id}</span><button disabled={busy} onClick={() => void run(async () => setValidation(JSON.stringify((await call("validate_change", { id: selected.id })).result, null, 2)))}>Validate</button></div>}
          {selected && <ArchiveReview key={selected.id} id={selected.id} call={call} dirty={hasDrafts} locked={busy} onBusyChange={setBusy} onArchived={async result => { setArchiveResult(result); setSelected(undefined); setProjectDocument(undefined); setDirtyPaths({}); await refresh(); }} />}
          {selected?.documents.length === 0 && <p>This change has no documents yet. Ask Codex to draft its proposal.</p>}
          {selected?.documents.filter(document => openedPaths.includes(document.path)).map(document => <div key={`${selected.id}/${document.path}/${generation}`} hidden={activePath !== document.path}><DocumentEditor id={selected.id} path={document.path} call={call} onDirty={onDirty} locked={busy} /></div>)}
          {validation && <details><summary>Validation result</summary><pre className="validation-result">{validation}</pre></details>}
        </div>
        {!selected && !projectDocument && <p className="reader-empty">Choose a change or project document to start reading.</p>}
      </div>
    </div>
  </section>;
}
