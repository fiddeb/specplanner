import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, confirmation } from "./closeout-fixture.js";
import { ArchiveService } from "../src/archive.js";
import { DocumentStore, revisionOf } from "../src/document-store.js";
import { ContextReader } from "../src/context-reader.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { filesUnder } from "../src/context.js";

test("reusing identical change names and content isolates current and archived reviews", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("delivery", null);
  const store = new DocumentStore(workspace, data);
  const original = await store.read("delivery", "proposal.md");
  const old = await store.comment("delivery", "proposal.md", original.revision, 0, 0, "Original review", original.identity);
  const preview = await archive.preview("delivery");
  const receipt = await archive.apply(preview.token, confirmation);
  const name = receipt.destination.split("/").at(-1)!;
  await change("delivery", null);
  const current = await new DocumentStore(workspace, data).read("delivery", "proposal.md");
  assert.equal(current.content, original.content);
  assert.deepEqual(current.comments, []);
  await assert.rejects(store.comment("delivery", "proposal.md", original.revision, 0, 0, "Stale panel comment", original.identity), /identity changed/);
  await assert.rejects(store.save("delivery", "proposal.md", original.revision, "Stale panel draft", original.identity), /identity changed/);
  const recent = await store.comment("delivery", "proposal.md", current.revision, 0, 0, "New review", current.identity);
  assert.deepEqual((await store.read("delivery", "proposal.md", name)).comments, [old]);
  assert.deepEqual((await store.read("delivery", "proposal.md")).comments, [recent]);
  await assert.rejects(store.read(name, "proposal.md", name), /identity/);
  const before = await filesUnder(join(root, "openspec"));
  await store.read("delivery", "proposal.md", name);
  assert.deepEqual(await filesUnder(join(root, "openspec")), before);
}));

test("copy-and-remove archive operations keep the original review association", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("delivery", null);
  const store = new DocumentStore(workspace, data);
  const document = await store.read("delivery", "proposal.md");
  const comment = await store.comment("delivery", "proposal.md", document.revision, 0, 0, "Copy retained review", document.identity);
  const preview = await archive.preview("delivery");
  class CopyingWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      if (args[0] !== "archive") return super.command(args, allowInvalid);
      await cp(join(root, "openspec/changes/delivery"), join(root, preview.destination), { recursive: true });
      await rm(join(root, "openspec/changes/delivery"), { recursive: true });
      return { archive: preview.destination };
    }
  }
  const result = await new ArchiveService(new CopyingWorkspace(root), data).apply(preview.token, confirmation);
  assert.equal(result.outcome, "archived");
  assert.deepEqual((await store.read("delivery", "proposal.md", result.destination.split("/").at(-1)!)).comments, [comment]);
}));

test("replacing an active directory invalidates previews even when every file is identical", () => fixture(async ({ root, archive, change }) => {
  await change("delivery", null);
  const preview = await archive.preview("delivery");
  const source = join(root, "openspec/changes/delivery");
  await rename(source, join(root, "saved-change"));
  await cp(join(root, "saved-change"), source, { recursive: true });
  await assert.rejects(archive.apply(preview.token, confirmation), /changed since preview/);
}));

test("a stale preview cannot claim an external archive of a different change generation", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("delivery", null);
  const store = new DocumentStore(workspace, data);
  const old = await store.read("delivery", "proposal.md");
  await store.comment("delivery", "proposal.md", old.revision, 0, 0, "Old generation", old.identity);
  const preview = await archive.preview("delivery");
  await rename(join(root, "openspec/changes/delivery"), join(root, "old-delivery"));
  await change("delivery", null);
  const current = await store.read("delivery", "proposal.md");
  const comment = await store.comment("delivery", "proposal.md", current.revision, 0, 0, "Current generation", current.identity);
  await mkdir(join(root, "openspec/changes/archive"));
  await rename(join(root, "openspec/changes/delivery"), join(root, preview.destination));
  await assert.rejects(archive.apply(preview.token, confirmation), /review identity/);
  assert.deepEqual((await store.read("delivery", "proposal.md", preview.destination.split("/").at(-1)!)).comments, [comment]);
}));

test("failed archive attempts do not reserve history for a later change with the same name", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("delivery", null);
  const first = await archive.preview("delivery");
  class FailedWorkspace extends OpenSpecWorkspace {
    override async command(args: string[], allowInvalid = false) {
      return args[0] === "archive" ? { archive: null } : super.command(args, allowInvalid);
    }
  }
  assert.equal((await new ArchiveService(new FailedWorkspace(root), data).apply(first.token, confirmation)).outcome, "failed");
  await rename(join(root, "openspec/changes/delivery"), join(root, "old-delivery"));
  await change("delivery", null);
  const store = new DocumentStore(workspace, data);
  const document = await store.read("delivery", "proposal.md");
  const comment = await store.comment("delivery", "proposal.md", document.revision, 0, 0, "Later generation", document.identity);
  const next = await archive.preview("delivery");
  const result = await archive.apply(next.token, confirmation);
  assert.equal(result.outcome, "archived");
  assert.deepEqual((await store.read("delivery", "proposal.md", result.destination.split("/").at(-1)!)).comments, [comment]);
}));

async function legacyHistory(workspace: OpenSpecWorkspace, data: string, content: string) {
  const history = join(data, `workspace-${(await workspace.identity()).id}`, "documents", revisionOf("delivery/proposal.md"));
  await mkdir(join(history, "comments"), { recursive: true });
  await mkdir(join(history, "revisions"));
  const comment = { id: "legacy", revision: revisionOf(content), start: 0, end: 0, quote: "", text: "Behåll den ursprungliga kommentaren.", createdAt: "2026-10-01T12:00:00.000Z" };
  await writeFile(join(history, "comments/legacy.json"), JSON.stringify(comment));
  await writeFile(join(history, "revisions", `${comment.revision}.md`), content);
  return { history, comment };
}

test("concurrent first reads retain legacy history through restart, archive and reuse", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("delivery", null);
  const content = await readFile(join(root, "openspec/changes/delivery/proposal.md"), "utf8");
  const { history, comment } = await legacyHistory(workspace, data, content);
  const store = new DocumentStore(workspace, data);
  const reads = await Promise.all([store.read("delivery", "proposal.md"), new DocumentStore(workspace, data).read("delivery", "proposal.md")]);
  for (const read of reads) assert.deepEqual(read.comments, [comment]);
  const preview = await archive.preview("delivery"), result = await archive.apply(preview.token, confirmation);
  await change("delivery", null);
  assert.deepEqual((await store.read("delivery", "proposal.md")).comments, []);
  assert.deepEqual((await store.read("delivery", "proposal.md", result.destination.split("/").at(-1)!)).comments, [comment]);
  assert.equal(await readFile(join(history, "revisions", `${comment.revision}.md`), "utf8"), content);
}));

test("ambiguous legacy histories are retained instead of assigned to reused names", () => fixture(async ({ root, workspace, data, change, put }) => {
  await change("delivery", null);
  const content = await readFile(join(root, "openspec/changes/delivery/proposal.md"), "utf8");
  const { history } = await legacyHistory(workspace, data, content);
  await put("changes/archive/2026-10-01-delivery/proposal.md", content);
  const store = new DocumentStore(workspace, data);
  await assert.rejects(store.read("delivery", "proposal.md"), /ambiguous ownership/);
  assert.match(await readFile(join(history, "comments/legacy.json"), "utf8"), /Behåll/);
}));

test("a known dated original id does not block another change's legacy history", () => fixture(async ({ root, workspace, data, archive, change }) => {
  await change("2026-10-01-delivery", null);
  const preview = await archive.preview("2026-10-01-delivery");
  await archive.apply(preview.token, confirmation);
  await change("delivery", null);
  const content = await readFile(join(root, "openspec/changes/delivery/proposal.md"), "utf8");
  const { comment } = await legacyHistory(workspace, data, content);
  assert.deepEqual((await new DocumentStore(workspace, data).read("delivery", "proposal.md")).comments, [comment]);
}));

test("large retained snapshots do not consume the comment inspection budget", () => fixture(async ({ workspace, data, archive, change }) => {
  await change("delivery", null);
  const store = new DocumentStore(workspace, data);
  const { history } = await store.paths("delivery", "proposal.md");
  for (let i = 0; i < 65; i++) await store.snapshot(history, `${i}:` + "x".repeat(990000));
  const reader = new ContextReader(workspace, data);
  assert.equal((await reader.change("delivery", {})).review.comments, 0);
  assert.equal((await archive.status("delivery")).tasks.status, "complete");
  assert.equal((await archive.preview("delivery")).blockers.total, 0);
}));
