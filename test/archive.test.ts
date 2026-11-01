import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, confirmation, delta } from "./closeout-fixture.js";
import { ArchiveService } from "../src/archive.js";
import { DocumentStore } from "../src/document-store.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { filesUnder } from "../src/context.js";
import { ContextReader } from "../src/context-reader.js";

test("preview is read-only; official archive syncs specs and preserves every original file and exact review", () => fixture(async ({ root, data, archive, workspace, put, change }) => {
  await change("delivery");
  await put("changes/delivery/evidence.bin", Buffer.from([0, 255, 10, 42]));
  const documents = new DocumentStore(workspace, data);
  const original = await documents.read("delivery", "proposal.md");
  const comment = await documents.comment("delivery", "proposal.md", original.revision, 0, 6, "Behåll underlaget exakt.");
  const before = await filesUnder(join(root, "openspec"));
  const preview = await archive.preview("delivery");
  assert.equal(preview.blockers.total, 0);
  assert.equal(preview.tasks.status, "complete");
  assert.equal(preview.implementation.status, "unknown");
  assert.equal((preview.affectedSpecs.items[0] as { operation: string }).operation, "create");
  assert.deepEqual(await filesUnder(join(root, "openspec")), before);
  const proposed = await archive.read(preview.token, "specs/delivery/spec.md", "after", {});
  assert.match(proposed.content!, /SHALL retain accepted input/);
  await assert.rejects(archive.apply(preview.token, { ...confirmation, specDiffsReviewed: false }), /confirmations/);
  await assert.rejects(archive.apply(preview.token, { ...confirmation, verification: { summary: "", evidencePaths: [] } }), /unknown/);
  const result = await archive.apply(preview.token, confirmation);
  assert.equal(result.outcome, "archived");
  assert.equal(result.implementation.status, "verified");
  assert.match(await readFile(join(root, "openspec/specs/delivery/spec.md"), "utf8"), /## Requirements/);
  const archivedName = result.destination.split("/").at(-1)!;
  assert.match(archivedName, /^\d{4}-\d{2}-\d{2}-delivery$/);
  assert.deepEqual(await filesUnder(join(root, result.destination)), before.filter(file => file.path.startsWith("changes/delivery/")).map(file => ({ ...file, path: file.path.slice("changes/delivery/".length) })));
  assert.deepEqual((await documents.read("delivery", "proposal.md", archivedName)).comments, [comment]);
  assert.equal((await new ArchiveService(workspace, data).apply(preview.token, confirmation)).outcome, "archived");
  assert.equal((await archive.inspect(preview.token, "changes", { limit: 1 })).hasMore, true);
}));

test("no-delta changes archive without inventing specs and dated names are not prefixed twice", () => fixture(async ({ root, archive, change }) => {
  await change("2026-10-01-docs", null);
  const preview = await archive.preview("2026-10-01-docs");
  assert.equal(preview.affectedSpecs.total, 0);
  assert.equal(preview.destination, "openspec/changes/archive/2026-10-01-docs");
  assert.equal((await archive.apply(preview.token, confirmation)).outcome, "archived");
  await assert.rejects(readdir(join(root, "openspec/specs")), /ENOENT/);
}));

test("official task parsing catches nested and nonstandard unchecked tasks; nothing archives automatically", () => fixture(async ({ root, archive, put, change }) => {
  await change("unfinished");
  await put("changes/unfinished/tasks.md", "- [x] Done\n  + [~] Pending nested work\n1. [ ] Pending ordered work\n");
  const preview = await archive.preview("unfinished");
  assert.equal(preview.tasks.total, 3); assert.equal(preview.tasks.remaining, 2);
  assert.equal((await archive.inspect(preview.token, "tasks", {})).total, 2);
  await assert.rejects(archive.apply(preview.token, confirmation), /blockers/);
  assert.ok((await readdir(join(root, "openspec/changes"))).includes("unfinished"));
}));

test("overlaps require explicit order and dependencies must have been archived first", () => fixture(async ({ archive, change }) => {
  await change("first"); await change("second", delta.replace("retain accepted input", "retain all accepted input"));
  const unknown = await archive.preview("first");
  assert.equal(unknown.overlaps.total, 1);
  assert.match(unknown.blockers.items.join(" "), /overlapOrder/);
  const wrong = await archive.preview("second", { overlapOrder: ["first", "second"] });
  assert.match(wrong.blockers.items.join(" "), /preceding/);
  const dependency = await archive.preview("first", { overlapOrder: ["first", "second"], dependsOn: ["second", "missing"] });
  assert.match(dependency.blockers.items.join(" "), /still active/);
  assert.match(dependency.blockers.items.join(" "), /no archive evidence/);
  const ordered = await archive.preview("first", { overlapOrder: ["first", "second"], dependsOn: [] });
  assert.equal(ordered.blockers.total, 0);
  assert.equal((await archive.apply(ordered.token, confirmation)).outcome, "archived");
  const staleDelta = await archive.preview("second", { dependsOn: ["first"] });
  assert.ok(staleDelta.blockers.total > 0, "An already-added requirement must be reconciled, not silently overwritten");
}));

test("a stale MODIFIED delta cannot silently drop newer scenarios", () => fixture(async ({ archive, put, change, root }) => {
  await put("specs/delivery/spec.md", `# Delivery\n\n## Purpose\nRetain accepted task input for reliable processing.\n\n## Requirements\n\n${delta.split("\n").slice(2).join("\n")}\n#### Scenario: Newer guarantee\n- **WHEN** two workers retry\n- **THEN** preserve both inputs\n`);
  await change("stale", delta.replace("ADDED", "MODIFIED"));
  const before = await filesUnder(join(root, "openspec"));
  const preview = await archive.preview("stale");
  assert.ok(preview.blockers.total > 0);
  assert.match((await archive.read(preview.token, "$diagnostics", "after", {})).content!, /archive.*(failed|error)|scenario/i);
  assert.deepEqual(await filesUnder(join(root, "openspec")), before);
}));

test("external file edits and new review comments invalidate preview tokens", () => fixture(async ({ root, archive, workspace, data, change, put }) => {
  await change("delivery");
  let preview = await archive.preview("delivery");
  await put("changes/delivery/verification.md", "New verification result\n");
  await assert.rejects(archive.apply(preview.token, confirmation), /changed since preview/);
  preview = await archive.preview("delivery");
  const documents = new DocumentStore(workspace, data), document = await documents.read("delivery", "proposal.md");
  await documents.comment("delivery", "proposal.md", document.revision, 0, 0, "New unresolved review question");
  await assert.rejects(archive.apply(preview.token, confirmation), /review comments changed/);
  await assert.rejects(readFile(join(root, "openspec/specs/delivery/spec.md")), /ENOENT/);
}));

test("empty or populated destination collisions never replace the active change or archive", () => fixture(async ({ root, archive, change }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  await mkdir(join(root, preview.destination), { recursive: true });
  await assert.rejects(archive.apply(preview.token, confirmation), /changed since preview|destination/);
  const collided = await archive.preview("delivery");
  assert.match(collided.blockers.items.join(" "), /destination/);
  await assert.rejects(archive.apply(collided.token, confirmation), /blockers/);
  assert.equal((await readdir(join(root, preview.destination))).length, 0);
  assert.ok((await readdir(join(root, "openspec/changes/delivery"))).includes(".openspec.yaml"));
}));

test("concurrent archive callers cannot both run the operation; retry is idempotent", () => fixture(async ({ archive, change }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  const results = await Promise.allSettled([archive.apply(preview.token, confirmation), archive.apply(preview.token, confirmation)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await archive.apply(preview.token, confirmation)).outcome, "archived");
}));

test("partial failures report actual mutations, preserve change files, and expose recovery diagnostics", () => fixture(async ({ workspace, data, archive, change, put, root }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  class FailingWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      if (args[0] !== "archive") return super.command(args, allowInvalid);
      await put("specs/delivery/spec.md", "Partial sync from an interrupted operation\n");
      return { archive: null, status: [{ code: "injected_failure", message: "Stopped before moving change" }] };
    }
  }
  const failing = new ArchiveService(new FailingWorkspace(workspace.root), data);
  const result = await failing.apply(preview.token, confirmation);
  assert.equal(result.outcome, "partial"); assert.deepEqual(result.changed.items, ["specs/delivery/spec.md"]);
  assert.ok(result.remaining.total); assert.match(result.recovery, /reconcile/);
  assert.match((await failing.read(preview.token, "$diagnostics", "after", {})).content!, /injected_failure/);
  assert.ok((await readdir(join(root, "openspec/changes/delivery"))).includes("verification.md"));
  await assert.rejects(failing.apply(preview.token, confirmation), /already ran/);
}));

test("archive previews enforce workspace, identifier, evidence and symlink boundaries", () => fixture(async ({ root, archive, change, put }) => {
  await change("delivery");
  for (const id of ["../outside", "/tmp/outside", "archive"]) await assert.rejects(archive.preview(id));
  const preview = await archive.preview("delivery");
  await assert.rejects(archive.apply(preview.token, { ...confirmation, verification: { summary: "Checked", evidencePaths: ["../outside"] } }), /relative|evidence/);
  await assert.rejects(archive.read(preview.token, "../outside", "after", {}));
  await put("specs/valid/spec.md", "Existing content\n");
  await symlink(root, join(root, "openspec/changes/delivery/linked"));
  await assert.rejects(archive.preview("delivery"), /Symlinks/);
  await assert.rejects(archive.apply(preview.token, confirmation), /Symlinks/);
}));

test("archive summary, exact-spec and outcome continuation cursors resume their advertised sections", () => fixture(async ({ archive, change, put }) => {
  await change("many-files");
  for (let i = 0; i < 24; i++) {
    await put(`changes/many-files/specs/cap-${i}/spec.md`, delta);
    await put(`changes/many-files/evidence/check-${i}.txt`, `Saved check ${i}: passed\n`);
  }
  const preview = await archive.preview("many-files");
  for (const [section, first] of [["evidence", preview.evidence], ["specs", preview.affectedSpecs], ["deltaSpecs", preview.deltaSpecs]] as const) {
    assert.equal(first.hasMore, true);
    const next = await archive.inspect(preview.token, section, { cursor: first.nextCursor! });
    assert.equal(next.total, first.total); assert.equal(next.items.length, first.total - first.items.length);
  }
  const archived = await archive.apply(preview.token, confirmation);
  assert.equal(archived.outcome, "archived"); assert.equal(archived.changed.hasMore, true);
  const next = await archive.inspect(preview.token, "changes", { cursor: archived.changed.nextCursor!, limit: 100 });
  assert.equal(next.items.length, 100); assert.equal(next.hasMore, true);
  const last = await archive.inspect(preview.token, "changes", { cursor: next.nextCursor!, limit: 100 });
  assert.equal(last.items.length + next.items.length + archived.changed.items.length, archived.changed.total);
  assert.equal(last.hasMore, false);
}));

test("archive blocks concurrent comment publication and document saves during the CLI operation", () => fixture(async ({ workspace, data, archive, change }) => {
  await change("delivery");
  const store = new DocumentStore(workspace, data), document = await store.read("delivery", "proposal.md");
  const preview = await archive.preview("delivery");
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
  const started = deferred(), resume = deferred();
  class GatedWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      if (args[0] === "archive") { started.resolve(); await resume.promise; }
      return super.command(args, allowInvalid);
    }
  }
  const applying = new ArchiveService(new GatedWorkspace(workspace.root), data).apply(preview.token, confirmation);
  await Promise.race([started.promise, applying.then(() => { throw new Error("CLI gate was not reached"); })]);
  try {
    await assert.rejects(store.comment("delivery", "proposal.md", document.revision, 0, 0, "Concurrent review"), /write is in progress/);
    await assert.rejects(store.save("delivery", "proposal.md", document.revision, "Concurrent draft"), /write is in progress/);
  } finally { resume.resolve(); }
  assert.equal((await applying).outcome, "archived");
}));

test("external edits during the CLI are detected and the changed evidence is preserved", () => fixture(async ({ workspace, data, archive, change, put, root }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  class EditingWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      if (args[0] === "archive") await put("changes/delivery/verification.md", "Externally revised verification\n");
      return super.command(args, allowInvalid);
    }
  }
  const result = await new ArchiveService(new EditingWorkspace(workspace.root), data).apply(preview.token, confirmation);
  assert.equal(result.outcome, "partial"); assert.equal(result.implementation.status, "unknown");
  assert.equal(await readFile(join(root, result.destination, "verification.md"), "utf8"), "Externally revised verification\n");
}));

test("100-character change IDs preserve readable archived documents and comments", () => fixture(async ({ workspace, data, archive, change }) => {
  const id = "a".repeat(100); await change(id, null);
  const store = new DocumentStore(workspace, data), document = await store.read(id, "proposal.md");
  const comment = await store.comment(id, "proposal.md", document.revision, 0, 0, "Retain the original review");
  const preview = await archive.preview(id), result = await archive.apply(preview.token, confirmation);
  assert.equal(result.outcome, "archived");
  const name = result.destination.split("/").at(-1)!; assert.equal(name.length, 111);
  assert.deepEqual((await store.read(id, "proposal.md", name)).comments, [comment]);
  const reader = new ContextReader(workspace, data);
  const archived = await reader.projectDocument(`${result.destination.slice("openspec/".length)}/proposal.md`, {});
  assert.ok("comments" in archived); assert.deepEqual(archived.comments, [comment]);
}));

test("missing tasks stay unknown and require explicit acknowledgement", () => fixture(async ({ root, archive, change }) => {
  await change("docs", null);
  const { unlink } = await import("node:fs/promises"); await unlink(join(root, "openspec/changes/docs/tasks.md"));
  const preview = await archive.preview("docs"); assert.equal(preview.tasks.status, "unknown");
  await assert.rejects(archive.apply(preview.token, confirmation), /Task status is unknown/);
  assert.equal((await archive.apply(preview.token, { ...confirmation, unknownTasksAcknowledged: true })).outcome, "archived");
}));

test("receipt-write failure after CLI success reports the observed archive and supports recovery", () => fixture(async ({ workspace, data, archive, change }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  const records = join(data, `workspace-${(await workspace.identity()).id}`, "archive-previews");
  class ReceiptFailureWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      const result = await super.command(args, allowInvalid);
      if (args[0] === "archive") { await rename(records, `${records}.saved`); await writeFile(records, "Temporary storage failure"); }
      return result;
    }
  }
  try {
    const result = await new ArchiveService(new ReceiptFailureWorkspace(workspace.root), data).apply(preview.token, confirmation);
    assert.equal(result.outcome, "archived");
    assert.equal("receiptSaved" in result && result.receiptSaved, false);
    assert.match(result.recovery, /receipt could not be stored/);
  } finally { await rm(records, { force: true }); await rename(`${records}.saved`, records); }
  assert.equal((await archive.apply(preview.token, confirmation)).outcome, "archived");
}));

test("partial failure diagnostics remain available when their receipt cannot be saved", () => fixture(async ({ workspace, data, archive, change, put }) => {
  await change("delivery");
  const preview = await archive.preview("delivery");
  const records = join(data, `workspace-${(await workspace.identity()).id}`, "archive-previews");
  class DoubleFailureWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      if (args[0] !== "archive") return super.command(args, allowInvalid);
      await put("specs/delivery/spec.md", "Interrupted partial sync\n");
      await rename(records, `${records}.saved`); await writeFile(records, "Temporary storage failure");
      return { archive: null, status: [{ code: "actual_partial_failure", message: "Main spec changed; change move failed" }] };
    }
  }
  try {
    const result = await new ArchiveService(new DoubleFailureWorkspace(workspace.root), data).apply(preview.token, confirmation);
    assert.equal(result.outcome, "partial");
    assert.equal("receiptSaved" in result && result.receiptSaved, false);
    assert.match(JSON.stringify(result.diagnostic), /live-unpersisted-operation/);
    assert.match(JSON.stringify(result.diagnostic), /actual_partial_failure/);
  } finally { await rm(records, { force: true }); await rename(`${records}.saved`, records); }
  const diagnostic = (await archive.read(preview.token, "$diagnostics", "after", {})).content!;
  assert.match(diagnostic, /"diagnosticRecorded": false/);
  assert.match(diagnostic, /"preview"/);
}));
