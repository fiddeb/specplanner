import { useEffect, useState } from "react";
import { allPages, fullText, type Page, type ToolCall } from "./panel-reading.js";
type Preview = { token: string; destination: string; files: number; planning: { status: string }; tasks: { status: string; total: number; completed: number; remaining: number }; blockers: Page<string>; affectedSpecs: Page<{ path: string; operation: string }>; evidence: Page<{ path: string }>; overlaps: Page<unknown>; dependencies: { status: string } };
export function ArchiveReview({ id, call, dirty, locked, onBusyChange, onArchived }: { id: string; call: ToolCall; dirty: boolean; locked: boolean; onBusyChange: (busy: boolean) => void; onArchived: (result: unknown) => Promise<void> }) {
  const [preview, setPreview] = useState<Preview>();
  const [details, setDetails] = useState<unknown>();
  const [diffs, setDiffs] = useState<{ path: string; before: string; after: string }[]>();
  const [files, setFiles] = useState<{ path: string }[]>([]);
  const [summary, setSummary] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [dependsOn, setDependsOn] = useState("");
  const [order, setOrder] = useState("");
  const [dependenciesReviewed, setDependenciesReviewed] = useState(false);
  const [specDiffsReviewed, setSpecDiffsReviewed] = useState(false);
  const [unknownTasksAcknowledged, setUnknownTasksAcknowledged] = useState(false);
  const [working, setBusy] = useState(false);
  const busy = working || locked;
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ outcome: string }>();
  const [status, setStatus] = useState<{ planning: { status: string }; tasks: { status: string; completed: number; total: number }; implementation: { status: string }; archived: boolean }>();
  useEffect(() => {
    if (dirty) return;
    let stopped = false;
    void call("change_status", { id }).then(result => { if (!stopped) setStatus(result.result as typeof status); }).catch(error => { if (!stopped) setError(String(error)); });
    return () => { stopped = true; };
  }, [id, dirty]);
  async function run(action: () => Promise<void>) { setBusy(true); onBusyChange(true); setError(""); try { await action(); } catch (error) { setError(String(error)); } finally { setBusy(false); onBusyChange(false); } }
  const names = (value: string) => value.split(",").map(name => name.trim()).filter(Boolean);
  return <>{status && <p className="change-status">Planning artifacts: {status.planning.status} (file presence). Tasks: {status.tasks.status} ({status.tasks.completed}/{status.tasks.total}). Implementation verification: {status.implementation.status}. Archived: {status.archived ? "yes" : "no"}.</p>}<details className="archive-review"><summary>Close out this change</summary>
    <p>Planning documents, checked implementation tasks, verified implementation, and an archived change are separate states. Spec validation does not verify implementation.</p>
    <label>Dependencies reviewed in the original documents (comma-separated change IDs)<input value={dependsOn} onChange={event => setDependsOn(event.target.value)} /></label>
    <label>Order for overlapping changes (comma-separated IDs, this change first)<input value={order} onChange={event => setOrder(event.target.value)} /></label>
    <button disabled={busy || dirty} onClick={() => void run(async () => {
      setPreview(undefined); setDiffs(undefined); setDetails(undefined); setFiles([]); setOutcome(undefined); setDependenciesReviewed(false); setSpecDiffsReviewed(false); setEvidence([]);
      setPreview((await call("archive_change", { action: "preview", id, dependsOn: names(dependsOn), overlapOrder: names(order) })).result as Preview);
    })}>Preview spec sync and archive</button>
    {dirty && <p>Save or discard document and comment drafts before previewing or archiving.</p>}
    {preview && <>
      <p>Planning: {preview.planning.status}. Tasks: {preview.tasks.status} ({preview.tasks.completed}/{preview.tasks.total}); {preview.tasks.remaining} remaining. Implementation verification: unknown until explicitly assessed below.</p>
      <p>Destination: <code>{preview.destination}</code>. All {preview.files} original change files will be moved. Main specs are synced by the official CLI before the change is archived.</p>
      <p>Dependencies: {preview.dependencies.status}. Overlapping changes: {preview.overlaps.total}.</p>
      <ul>{preview.blockers.items.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
      <button disabled={busy} onClick={() => void run(async () => {
        const sections: Record<string, unknown> = {};
        for (const section of ["tasks", "evidence", "overlaps", "blockers"]) sections[section] = await allPages(call, "archive_change", { action: "inspect", token: preview.token, section });
        sections.diagnostics = (await fullText(call, "archive_change", { action: "read", token: preview.token, path: "$diagnostics" })).content;
        setDetails(sections);
        setFiles(await allPages(call, "archive_change", { action: "inspect", token: preview.token, section: "files" }));
        const specs = await allPages<{ path: string }>(call, "archive_change", { action: "inspect", token: preview.token, section: "specs" });
        const loaded = [];
        for (const spec of specs) loaded.push({ path: spec.path, before: (await fullText(call, "archive_change", { action: "read", token: preview.token, path: spec.path, version: "before" })).content, after: (await fullText(call, "archive_change", { action: "read", token: preview.token, path: spec.path, version: "after" })).content });
        setDiffs(loaded);
      })}>Load all review details and exact spec changes</button>
      {details != null && <pre className="validation-result">{JSON.stringify(details, null, 2)}</pre>}
      {diffs?.map(diff => <details key={diff.path}><summary>{diff.path}</summary><h3>Current main spec</h3><pre>{diff.before || "Does not exist"}</pre><h3>Proposed main spec</h3><pre>{diff.after || "Will be deleted"}</pre></details>)}
      {diffs && <>
        <label>Implementation verification assessment<textarea value={summary} maxLength={10000} onChange={event => setSummary(event.target.value)} placeholder="Describe the implementation checks performed and their results. Validation alone is insufficient." /></label>
        <fieldset><legend>Saved verification evidence (review its exact contents in the change reader)</legend>{files.map(file => <label key={file.path}><input type="checkbox" checked={evidence.includes(file.path)} onChange={event => setEvidence(previous => event.target.checked ? [...previous, file.path] : previous.filter(path => path !== file.path))} />{file.path}</label>)}</fieldset>
        <label><input type="checkbox" checked={dependenciesReviewed} onChange={event => setDependenciesReviewed(event.target.checked)} />I reviewed dependencies and overlapping changes in their original documents.</label>
        <label><input type="checkbox" checked={specDiffsReviewed} onChange={event => setSpecDiffsReviewed(event.target.checked)} />I reviewed every exact spec change, including existing requirements that might be newer.</label>
        {preview.tasks.status === "unknown" && <label><input type="checkbox" checked={unknownTasksAcknowledged} onChange={event => setUnknownTasksAcknowledged(event.target.checked)} />I reviewed the complete change and acknowledge that task status is unknown.</label>}
        <button disabled={busy || dirty || preview.blockers.total > 0 || !summary.trim() || !evidence.length || !dependenciesReviewed || !specDiffsReviewed || preview.tasks.status === "unknown" && !unknownTasksAcknowledged} onClick={() => void run(async () => {
          const result = (await call("archive_change", { action: "apply", token: preview.token, verification: { summary, evidencePaths: evidence }, dependenciesReviewed, specDiffsReviewed, unknownTasksAcknowledged })).result as { outcome: string };
          setOutcome(result);
          if (result.outcome === "archived") await onArchived(result);
        })}>Confirm spec sync and archive</button>
      </>}
    </>}
    {outcome != null && <><p role="status">Archive outcome: {outcome.outcome}. Review operation details before continuing.</p><details><summary>Operation and recovery details</summary><pre>{JSON.stringify(outcome, null, 2)}</pre></details></>}
    {error && <p role="alert">{error}</p>}
  </details></>;
}
