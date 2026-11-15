import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenSpecWorkspace, changeId } from "./openspec.js";
import { acquireWorkspaceWrite } from "./workspace-lock.js";
import { archiveMatchesChange, ReviewHistory } from "./review-history.js";
import { digest, filesUnder, page, relativeFile, textPage, type FileEntry, type PageInput, type TextInput } from "./context.js";

type SpecDiff = { path: string; before: string | null; after: string | null };
type Verification = { summary: string; evidencePaths: string[] };
export type ArchiveOptions = { dependsOn?: string[]; overlapOrder?: string[] };
type Outcome = { outcome: "archived" | "partial" | "failed"; changed: string[]; remaining: string[]; recovery: string; diagnostic?: unknown; verification?: Verification; inspectionError?: string };
type Plan = {
  token: string; workspacePath: string; id: string; date: string; destination: string; revision: string;
  before: FileEntry[]; reviewRevision: string; reviewGeneration: string; specs: SpecDiff[]; files: FileEntry[];
  status: Awaited<ReturnType<ArchiveService["status"]>>; overlaps: { id: string; paths: string[] }[];
  options: ArchiveOptions; blockers: string[]; cli: unknown; outcome?: Outcome;
};
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const archiveName = (id: string) => /^\d{4}-\d{2}-\d{2}-/.test(id) ? id : `${localDate()}-${id}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class ArchiveService {
  constructor(readonly workspace: OpenSpecWorkspace, readonly data: string) {}
  private async directory() { return join(this.data, `workspace-${(await this.workspace.identity()).id}`, "archive-previews"); }
  private async save(plan: Plan) {
    const directory = await this.directory(); await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `${plan.token}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(plan), { flag: "wx", mode: 0o600 });
    await rename(temporary, join(directory, `${plan.token}.json`));
  }
  private async load(token: string) {
    if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error("Invalid archive preview token.");
    const plan = JSON.parse(await readFile(join(await this.directory(), `${token}.json`), "utf8")) as Plan;
    if (plan.workspacePath !== (await this.workspace.identity()).path || plan.token !== token) throw new Error("Archive preview belongs to another workspace.");
    return plan;
  }
  private async reviews(files: FileEntry[]) {
    const changes = new Map<string, string[]>();
    for (const file of files) {
      const [folder, id, ...parts] = file.path.split("/");
      if (folder !== "changes" || id === "archive" || !parts.length) continue;
      changes.set(id, [...(changes.get(id) ?? []), parts.join("/")]);
    }
    const history = new ReviewHistory(this.workspace, this.data);
    const comments = [];
    for (const [id, paths] of changes) comments.push({ id, files: await history.comments(id, paths) });
    return digest(JSON.stringify(comments));
  }
  async status(id: string) {
    changeId(id);
    const root = await this.workspace.checkTree();
    const files = await filesUnder(join(root, "openspec/changes", id));
    if (!files.length) throw new Error("Active change does not exist or has no files.");
    const tasks = await this.workspace.taskStatus(id);
    let planning: { status: string; artifacts: { id: string; status: string }[]; error?: string };
    try {
      const official = await this.workspace.command(["status", "--change", id, "--json"]) as { isComplete?: boolean; artifacts?: { id: string; status: string }[] };
      planning = { status: official.isComplete === true ? "complete" : "incomplete", artifacts: (official.artifacts ?? []).map(({ id, status }) => ({ id, status })) };
    } catch (error) { planning = { status: "unknown", artifacts: [], error: String(error) }; }
    return { id, planning, tasks, implementation: { status: "unknown", basis: "Files and checked tasks do not prove implementation. An explicit evidence-backed assessment is required." }, archived: false,
      evidence: files.filter(file => /(?:verif|test|check|review|evidence)/i.test(file.path)).map(({ path, revision, bytes }) => ({ path, revision, bytes })),
      deltaSpecs: files.filter(file => file.path.startsWith("specs/") && file.path.endsWith("/spec.md")).map(file => file.path) };
  }
  async preview(id: string, options: ArchiveOptions = {}) {
    changeId(id);
    const root = await this.workspace.checkTree();
    const before = await filesUnder(join(root, "openspec"));
    const history = new ReviewHistory(this.workspace, this.data);
    const reviewGeneration = await history.generation(id);
    const reviewRevision = await this.reviews(before);
    const files = before.filter(file => file.path.startsWith(`changes/${id}/`)).map(file => ({ ...file, path: file.path.slice(`changes/${id}/`.length) }));
    if (!files.length) throw new Error("Active change does not exist or has no files.");
    const status = await this.status(id);
    const destination = `changes/archive/${archiveName(id)}`;
    const blockers: string[] = [];
    if (status.tasks.status === "incomplete") blockers.push("Implementation tasks are incomplete. Finish or explicitly revise the task plan before archiving.");
    if (status.tasks.unreadable.length) blockers.push("Task files could not be read.");
    if (before.some(file => file.path === destination || file.path.startsWith(`${destination}/`)) || await this.exists(join(root, "openspec", destination))) blockers.push("Archive destination already exists.");
    const paths = status.deltaSpecs.map(path => path.slice("specs/".length));
    const overlaps = (await this.workspace.list()).filter(name => name !== id).map(name => ({ id: name, paths: paths.filter(path => before.some(file => file.path === `changes/${name}/specs/${path}`)) })).filter(item => item.paths.length);
    if (overlaps.length) {
      const required = [id, ...overlaps.map(item => item.id)].sort();
      const order = options.overlapOrder ?? [];
      if (!same([...order].sort(), required) || new Set(order).size !== order.length) blockers.push("Overlapping capabilities require an explicit overlapOrder containing this change and every overlapping active change exactly once. Review their original requirements before choosing the order.");
      else if (order[0] !== id) blockers.push(`Archive preceding changes first: ${order.slice(0, order.indexOf(id)).join(", ")}. Rebase and preview again after each archive.`);
    }
    for (const dependency of options.dependsOn ?? []) {
      changeId(dependency);
      if (dependency === id || (await this.workspace.list()).includes(dependency)) blockers.push(`Dependency is still active: ${dependency}. Complete and archive it first.`);
      else {
        const names = new Set(before.filter(file => file.path.startsWith("changes/archive/")).map(file => file.path.split("/")[2]));
        let found = false;
        for (const name of names) {
          if (!archiveMatchesChange(name, dependency)) continue;
          const original = await this.originalChange(name);
          if (original === dependency || (!original && !/^\d{4}-\d{2}-\d{2}-/.test(name) && name === dependency)) found = true;
        }
        if (!found) blockers.push(`Dependency has no archive evidence with an unambiguous original identity: ${dependency}. Resolve it before continuing.`);
      }
    }
    const temporary = await mkdtemp(join(tmpdir(), "specplanner-archive-"));
    let cli: unknown;
    const specs: SpecDiff[] = [];
    try {
      await mkdir(join(temporary, ".git"));
      await cp(join(root, "openspec"), join(temporary, "openspec"), { recursive: true, filter: source => !source.endsWith("/.specplanner-write-lock") });
      if (!same(before, await filesUnder(join(temporary, "openspec"))) || !same(before, await filesUnder(join(root, "openspec")))) throw new Error("OpenSpec changed while preparing the preview. Retry.");
      if (!blockers.some(blocker => blocker.includes("tasks") || blocker.includes("destination"))) {
        cli = await new OpenSpecWorkspace(temporary, this.workspace.cli).command(["archive", id, "--json", "--yes"], true);
        if (!(cli as { archive?: unknown })?.archive) blockers.push("The official OpenSpec archive simulation failed. Inspect cli diagnostics and resolve the delta/main-spec conflict before retrying.");
      }
      const after = await filesUnder(join(temporary, "openspec"));
      const specPaths = new Set([...before, ...after].filter(file => file.path.startsWith("specs/")).map(file => file.path));
      for (const path of [...specPaths].sort()) {
        const a = before.find(file => file.path === path), b = after.find(file => file.path === path);
        if (a?.revision !== b?.revision) specs.push({ path, before: a ? await readFile(join(root, "openspec", path), "utf8") : null, after: b ? await readFile(join(temporary, "openspec", path), "utf8") : null });
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
    if (!same(before, await filesUnder(join(root, "openspec"))) || reviewGeneration !== await history.generation(id) || reviewRevision !== await this.reviews(before)) throw new Error("Files or review comments changed during preview. Retry.");
    const plan: Plan = { token: randomUUID(), workspacePath: root, id, date: localDate(), destination, revision: digest(JSON.stringify([root, before, reviewRevision, reviewGeneration, options])), before, reviewRevision, reviewGeneration, specs, files, status, overlaps, options, blockers, cli };
    await this.save(plan);
    return this.summary(plan);
  }
  private sectionItems(plan: Plan, section: string): unknown[] {
    const sections: Record<string, unknown[]> = {
      files: plan.files,
      specs: plan.specs.map(spec => ({ path: spec.path, operation: spec.before === null ? "create" : spec.after === null ? "delete" : "update", beforeRevision: spec.before === null ? null : digest(spec.before), afterRevision: spec.after === null ? null : digest(spec.after) })),
      tasks: plan.status.tasks.pending, evidence: plan.status.evidence, deltaSpecs: plan.status.deltaSpecs,
      planningArtifacts: plan.status.planning.artifacts, overlaps: plan.overlaps, blockers: plan.blockers,
      diagnostics: [{ readPath: "$diagnostics", action: "read", note: "Full CLI output is paginated as text." }],
      changes: plan.outcome?.changed ?? [], remaining: plan.outcome?.remaining ?? [],
    };
    if (!(section in sections)) throw new Error("Unknown archive preview section.");
    return sections[section];
  }
  private scope(plan: Plan, section: string) { return `${plan.workspacePath}/${plan.token}/${section}`; }
  private sectionPage(plan: Plan, section: string, input: PageInput = {}) { return page(this.sectionItems(plan, section), input, this.scope(plan, section)); }
  private summary(plan: Plan) {
    return { token: plan.token, id: plan.id, revision: plan.revision, destination: `openspec/${plan.destination}`, blockers: this.sectionPage(plan, "blockers"),
      planning: { ...plan.status.planning, artifacts: this.sectionPage(plan, "planningArtifacts") }, tasks: { status: plan.status.tasks.status, total: plan.status.tasks.total, completed: plan.status.tasks.completed, remaining: plan.status.tasks.total - plan.status.tasks.completed },
      implementation: plan.status.implementation, dependencies: { status: plan.options.dependsOn ? "explicit list supplied; review prose dependencies too" : "unknown; inspect proposal/design and supply dependsOn or acknowledge review", declared: plan.options.dependsOn ?? [] },
      files: plan.files.length, evidence: this.sectionPage(plan, "evidence"), deltaSpecs: this.sectionPage(plan, "deltaSpecs"),
      affectedSpecs: this.sectionPage(plan, "specs"), overlaps: this.sectionPage(plan, "overlaps"),
      review: "Inspect files, pending tasks, exact review comments, dependencies, overlapping changes and both sides of every spec diff. MODIFIED replaces a complete requirement; chronology is not inferred. Validation does not verify implementation.",
      next: "Follow each nextCursor with inspect and the same section (affectedSpecs uses specs). read returns exact before/after spec text. Explicitly apply the token with saved verification evidence and review confirmations." };
  }
  async inspect(token: string, section: string, input: PageInput) {
    const plan = await this.load(token);
    if (section === "observedChanges" || section === "pendingSpecs") {
      const observation = await this.observe(plan);
      return page(observation[section], input, this.scope(plan, section));
    }
    return this.sectionPage(plan, section, input);
  }
  async read(token: string, path: string, version: "before" | "after", input: TextInput) {
    const plan = await this.load(token);
    if (path === "$diagnostics") return textPage(JSON.stringify({ preview: plan.cli ?? { message: "Simulation was not run because tasks or destination blocked it." }, operation: plan.outcome ? { outcome: plan.outcome.outcome, diagnostic: plan.outcome.diagnostic ?? null, diagnosticRecorded: plan.outcome.diagnostic !== undefined, note: plan.outcome.diagnostic === undefined ? "No operation diagnostic was persisted; the operation may be in progress or interrupted. Use result to inspect current files." : undefined } : null }, null, 2), input, `${plan.workspacePath}/${token}/diagnostics`);
    const spec = plan.specs.find(spec => spec.path === relativeFile(path));
    if (!spec) throw new Error("Spec is not in this preview.");
    return { path, version, exists: spec[version] !== null, ...textPage(spec[version] ?? "", input, `${plan.workspacePath}/${token}/${path}/${version}`) };
  }
  private async exists(path: string) { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }
  async apply(token: string, confirmation: { verification: Verification; dependenciesReviewed: boolean; specDiffsReviewed: boolean; unknownTasksAcknowledged?: boolean }) {
    const plan = await this.load(token);
    const root = await this.workspace.checkTree();
    const release = await acquireWorkspaceWrite(this.workspace);
    const history = new ReviewHistory(this.workspace, this.data);
    try {
      const current = await filesUnder(join(root, "openspec"));
      const sourceExists = await this.exists(join(root, "openspec/changes", plan.id));
      const archived = current.filter(file => file.path.startsWith(`${plan.destination}/`)).map(file => ({ ...file, path: file.path.slice(plan.destination.length + 1) }));
      const specsMatch = plan.specs.every(spec => (current.find(file => file.path === spec.path)?.revision ?? null) === (spec.after === null ? null : digest(spec.after)));
      if (!sourceExists && same(archived, plan.files) && specsMatch) {
        if (plan.reviewGeneration) {
          const name = plan.destination.split("/").at(-1)!;
          if (await history.generation(plan.id, name) !== plan.reviewGeneration) throw new Error("Archived files match but their review identity is unknown or belongs to another change. Preserve the receipt and reconcile history before retrying.");
          await history.bindArchive(plan.id, name, plan.reviewGeneration);
        }
        if (plan.outcome?.outcome !== "archived") { plan.outcome = { ...plan.outcome, outcome: "archived", changed: [plan.destination, ...plan.specs.map(spec => spec.path)], remaining: [], recovery: "Recovered completed archive from its exact file fingerprints." }; return await this.persistOutcome(plan); }
        return this.outcomeSummary(plan);
      }
      if (plan.outcome) throw new Error("This operation already ran and current files differ from its receipt. Inspect the receipt and workspace; do not replay it.");
      if (plan.blockers.length) throw new Error("Preview has blockers. Resolve them and create a new preview.");
      if (await this.exists(join(root, "openspec", plan.destination))) throw new Error("Archive destination appeared after preview. Nothing was written; preview again.");
      if (plan.date !== localDate()) throw new Error("Archive date changed. Create a new preview for the new destination.");
      if (!same(current, plan.before) || plan.reviewGeneration !== await history.generation(plan.id) || plan.reviewRevision !== await this.reviews(current)) throw new Error("Workspace files or review comments changed since preview. Nothing was written; preview again.");
      if (!confirmation.dependenciesReviewed || !confirmation.specDiffsReviewed) throw new Error("Explicit dependency and exact spec-diff review confirmations are required.");
      if (plan.status.tasks.status === "unknown" && !confirmation.unknownTasksAcknowledged) throw new Error("Task status is unknown. Explicitly acknowledge this after reviewing the complete change.");
      const verification = confirmation.verification;
      if (!verification.summary.trim() || !verification.evidencePaths.length) throw new Error("Implementation verification is unknown. Supply an explicit assessment and saved evidence paths; checked tasks and spec validation are insufficient.");
      for (const path of verification.evidencePaths) if (!plan.files.some(file => file.path === relativeFile(path))) throw new Error(`Verification evidence is not a saved change file: ${path}`);
      // Persist the reviewed intent before invoking the CLI, so interrupted operations remain inspectable.
      plan.outcome = { outcome: "partial", changed: [], remaining: ["Run and inspect official archive"], recovery: "Inspect current source, destination and main specs against this preview before retrying.", verification };
      try { await this.save(plan); }
      catch (error) { throw new Error(`No repository files were changed: could not persist the reviewed archive intent. ${String(error)}`); }
      let diagnostic: unknown;
      try { diagnostic = await this.workspace.command(["archive", plan.id, "--json", "--yes"], true); }
      catch (error) { diagnostic = { error: String(error) }; }
      let after: FileEntry[];
      try {
        after = await filesUnder(join(root, "openspec"));
        if (!(await this.exists(join(root, "openspec/changes", plan.id))) && await this.exists(join(root, "openspec", plan.destination))) {
          await history.bindArchive(plan.id, plan.destination.split("/").at(-1)!, plan.reviewGeneration);
        }
      }
      catch (error) {
        plan.outcome = { ...plan.outcome, inspectionError: String(error), diagnostic, remaining: ["Inspect the workspace: post-operation file inspection failed, so the mutation set is unknown."] };
        return await this.persistOutcome(plan);
      }
      const allPaths = new Set([...current, ...after].map(file => file.path));
      const changed = [...allPaths].filter(path => !same(current.find(file => file.path === path), after.find(file => file.path === path))).sort();
      const finalArchive = after.filter(file => file.path.startsWith(`${plan.destination}/`)).map(file => ({ ...file, path: file.path.slice(plan.destination.length + 1) }));
      const complete = !(await this.exists(join(root, "openspec/changes", plan.id))) && same(finalArchive, plan.files) && plan.specs.every(spec => (after.find(file => file.path === spec.path)?.revision ?? null) === (spec.after === null ? null : digest(spec.after)));
      plan.outcome = { outcome: complete ? "archived" : changed.length ? "partial" : "failed", changed,
        remaining: complete ? [] : [...plan.specs.filter(spec => (after.find(file => file.path === spec.path)?.revision ?? null) !== (spec.after === null ? null : digest(spec.after))).map(spec => `Reconcile main spec: ${spec.path}`), "Confirm the complete original change exists at the reviewed archive destination, then finish archiving."],
        recovery: complete ? "All original change files were preserved. Review history remains in workspace-scoped storage; read_document accepts archiveName with the original change id." : "Use inspect section changes/diagnostics. Read actual specs and source/destination files. Do not rerun a stale token or blindly reapply deltas. If the CLI rolled back fully, create a fresh preview; otherwise reconcile partial changes first.", diagnostic, verification };
      return await this.persistOutcome(plan);
    } finally { await release(); }
  }
  private outcomeSummary(plan: Plan) {
    const result = plan.outcome!;
    return { ...result, changed: { ...this.sectionPage(plan, "changes"), known: !result.inspectionError }, remaining: this.sectionPage(plan, "remaining"), diagnostic: result.diagnostic ? "Available through read path $diagnostics" : undefined, token: plan.token, destination: `openspec/${plan.destination}`, implementation: { status: result.verification && result.outcome === "archived" ? "verified" : "unknown", reviewedRevision: plan.revision, basis: "Explicit caller assessment of saved evidence; SpecPlanner does not run or prove implementation checks." } };
  }
  private async persistOutcome(plan: Plan) {
    try { await this.save(plan); return { ...this.outcomeSummary(plan), receiptSaved: true }; }
    catch (error) { return { ...this.outcomeSummary(plan), changed: { ...page(plan.outcome!.changed, {}, this.scope(plan, "observedChanges")), known: !plan.outcome!.inspectionError }, changedContinuationSection: "observedChanges", receiptSaved: false, receiptError: String(error), diagnostic: { source: "live-unpersisted-operation", result: plan.outcome?.diagnostic ?? null, note: "This exact operation diagnostic could not be stored; subsequent reads distinguish it from preview diagnostics." }, recovery: "The reported file outcome is observed, but its final receipt could not be stored. Preserve this live diagnostic. Restore access to the workspace archive-previews directory, then call result/apply with this token to inspect or recognize the completed operation. Continue changed paths with inspect section observedChanges. Do not reapply deltas blindly." }; }
  }
  private async observe(plan: Plan) {
    const root = await this.workspace.checkTree();
    const current = await filesUnder(join(root, "openspec"));
    const paths = new Set([...plan.before, ...current].map(file => file.path));
    return {
      observedChanges: [...paths].filter(path => !same(plan.before.find(file => file.path === path), current.find(file => file.path === path))).sort(),
      sourcePresent: await this.exists(join(root, "openspec/changes", plan.id)),
      archiveMatches: same(current.filter(file => file.path.startsWith(`${plan.destination}/`)).map(file => ({ ...file, path: file.path.slice(plan.destination.length + 1) })), plan.files),
      pendingSpecs: plan.specs.filter(spec => (current.find(file => file.path === spec.path)?.revision ?? null) !== (spec.after === null ? null : digest(spec.after))).map(spec => spec.path),
    };
  }
  async result(token: string) {
    const plan = await this.load(token);
    if (!plan.outcome) return this.summary(plan);
    try {
      const observation = await this.observe(plan);
      return { ...this.outcomeSummary(plan), observed: { changed: page(observation.observedChanges, {}, this.scope(plan, "observedChanges")), sourcePresent: observation.sourcePresent, archiveMatches: observation.archiveMatches, pendingSpecs: page(observation.pendingSpecs, {}, this.scope(plan, "pendingSpecs")) } };
    } catch (error) { return { ...this.outcomeSummary(plan), observed: { known: false, error: String(error) } }; }
  }
  async originalChange(archiveName: string) {
    return new ReviewHistory(this.workspace, this.data).originalChange(archiveName);
  }
}
