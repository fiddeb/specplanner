import { fullText } from "./panel-reading.js";
import { MarkdownDocument } from "./markdown-document.js";
import React, { useEffect, useState, useRef } from "react";
import type { ReviewComment } from "./document-store.js";
import { locateReviewSelection } from "./review-selection.js";
type Document = { path: string; content: string; revision: string; comments: ReviewComment[] };
type Call = (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
export function DocumentEditor({ id, path, call, onDirty, locked = false }: { id: string; path: string; call: Call; onDirty: (path: string, dirty: boolean) => void; locked?: boolean }) {
  const readerRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDetailsElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [selectionError, setSelectionError] = useState("");
  function openReview() {
    if (reviewRef.current) reviewRef.current.open = true;
    commentRef.current?.focus();
    reviewRef.current?.scrollIntoView({ block: "nearest" });
  }
  function captureSelection() {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !readerRef.current?.contains(selected.anchorNode) || !readerRef.current.contains(selected.focusNode)) return;
    const range = locateReviewSelection(draft, selected.toString());
    setSelection(range ?? { start: 0, end: 0 });
    setSelectionError(range ? "" : "This passage cannot be matched unambiguously to the Markdown source. Use Edit / select text to select the exact passage before commenting.");
  }
  const [editing, setEditing] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [document, setDocument] = useState<Document>();
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [working, setBusy] = useState(false);
  const busy = working || locked;
  const [error, setError] = useState("");
  const dirty = !!document && draft !== document.content;
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || comment) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, comment]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Operation failed."); } finally { setBusy(false); }
  }
  async function load() {
    const next = await fullText(call, "read_document", { id, path }) as unknown as Document;
    setDocument(next); setDraft(next.content); setSelection({ start: 0, end: 0 });
  }
  useEffect(() => { void run(load); }, [id, path]);
  // A pending comment also prevents the parent from replacing this editor.
  useEffect(() => { onDirty(path, dirty || !!comment); }, [dirty, comment, path]);
  return <article className="document-editor" aria-label={path}><header className="document-heading"><h2>{path}</h2><div className="document-mode"><button disabled={busy} aria-pressed={!editing} onClick={() => { setEditing(false); setSelection({ start: 0, end: 0 }); setSelectionError(""); }}>Read</button><button disabled={busy} aria-pressed={editing} onClick={() => { setEditing(true); setSelectionError(""); }}>Edit / select text</button></div></header>
    {document && <>
      <div className="review-shortcuts"><button disabled={busy || dirty || !!selectionError} onClick={openReview}>{selection.end > selection.start ? "Comment on selection" : "Add document comment"}</button><button onClick={openReview}>View comments ({document.comments.length})</button></div>
      {!editing && <p className="selection-hint">Select a passage to comment on it.</p>}
      {selectionError && <p role="alert">{selectionError}</p>}
      {!editing ? <div ref={readerRef} onMouseUp={captureSelection} onKeyUp={captureSelection} onTouchEnd={captureSelection}><MarkdownDocument content={draft} /></div> : <label className="source-editor">Document text<textarea aria-label={`Edit ${path}`} value={draft} disabled={busy} spellCheck={false}
        onChange={event => { setDraft(event.target.value); setSelection({ start: 0, end: 0 }); setSelectionError(""); }}
        onSelect={event => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} /></label>}
      <div className="document-actions"><button disabled={busy || !dirty} onClick={() => void run(async () => {
        const next = (await call("save_document", { id, path, expectedRevision: document.revision, content: draft })).result as Document;
        setDocument(next); setDraft(next.content); setSelection({ start: 0, end: 0 });
      })}>Save document</button><button disabled={busy} onClick={() => { if (dirty) setConfirmReload(true); else void run(load); }}>Reload saved</button><span role="status">{dirty ? "Unsaved changes" : "Saved"}</span></div>
      {confirmReload && <div role="group" aria-label="Discard edits"><p>Discard your unsaved document edits?</p><button onClick={() => { setConfirmReload(false); void run(load); }}>Discard and reload</button><button onClick={() => setConfirmReload(false)}>Keep editing</button></div>}
      <details ref={reviewRef} className="document-review"><summary>Comments ({document.comments.length})</summary>
      {!editing && <p>Select text in the reader, then choose Comment on selection. For passages spanning Markdown formatting, use Edit / select text.</p>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const added = (await call("add_comment", { id, path, revision: document.revision, ...selection, text: comment })).result as ReviewComment;
        setDocument({ ...document, comments: [...document.comments, added] }); setComment("");
      }); }}>
        <label>Review comment<textarea ref={commentRef} aria-label={`Comment on ${path}`} value={comment} disabled={busy} maxLength={10000} onChange={event => setComment(event.target.value)} /></label>
        <p>{dirty ? "Save your edits before commenting." : selection.end > selection.start ? `Commenting on selected text (${selection.end - selection.start} characters).` : "Commenting on the whole document."}</p>
        {!dirty && selection.end > selection.start && <blockquote>{document.content.slice(selection.start, selection.end)}</blockquote>}
        <button disabled={busy || dirty || !!selectionError || !comment.trim()}>Add comment</button>
        {comment && <button type="button" disabled={busy} onClick={() => setComment("")}>Discard comment</button>}
      </form>
      <ul className="review-comments">{document.comments.map(item => <li key={item.id}>
        <small>{item.revision === document.revision ? "Current version" : "Earlier version"} · {new Date(item.createdAt).toLocaleString()}</small>
        {item.quote && <blockquote>{item.quote}</blockquote>}<p>{item.text}</p>
      </li>)}</ul></details>
    </>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
