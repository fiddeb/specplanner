import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentStore } from "../src/document-store.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
async function fixture(run: (store: DocumentStore, root: string, data: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "specplanner-review-"));
  const data = join(root, "private-data");
  try {
    await mkdir(join(root, ".git"));
    await mkdir(join(root, "openspec/changes/example"), { recursive: true });
    await writeFile(join(root, "openspec/changes/example/proposal.md"), "# Plan\n\nOriginal text 🌍\n");
    await run(new DocumentStore(new OpenSpecWorkspace(root), data), root, data);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test("comments retain original text and selected revision after edits and restart", () => fixture(async (store, root, data) => {
  const original = await store.read("example", "proposal.md");
  const comment = await store.comment("example", "proposal.md", original.revision, 8, 16, "Förtydliga detta");
  assert.equal(comment.quote, "Original");
  const updated = await store.save("example", "proposal.md", original.revision, "# Revised\n");
  assert.notEqual(updated.revision, original.revision);
  const reopened = await new DocumentStore(new OpenSpecWorkspace(root), data).read("example", "proposal.md");
  assert.deepEqual(reopened.comments, [comment]);
  assert.equal(reopened.comments[0].text, "Förtydliga detta");
  const { history } = await store.paths("example", "proposal.md");
  assert.equal(await readFile(join(history, "revisions", `${original.revision}.md`), "utf8"), original.content);
}));
test("stale edits and competing plugin saves cannot overwrite newer revisions", () => fixture(async (store, root, data) => {
  const original = await store.read("example", "proposal.md");
  const other = new DocumentStore(new OpenSpecWorkspace(root), data);
  const results = await Promise.allSettled([
    store.save("example", "proposal.md", original.revision, "First"),
    other.save("example", "proposal.md", original.revision, "Second"),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  await assert.rejects(store.save("example", "proposal.md", original.revision, "Stale"), /changed/);
  const current = await store.read("example", "proposal.md");
  await writeFile(join(root, "openspec/changes/example/proposal.md"), "External edit");
  await assert.rejects(store.save("example", "proposal.md", current.revision, "Overwrite"), /changed/);
  assert.equal((await store.read("example", "proposal.md")).content, "External edit");
}));
test("review rejects traversal, symlinks, unknown revisions and invalid selections", () => fixture(async (store, root) => {
  const original = await store.read("example", "proposal.md");
  for (const path of ["../proposal.md", "/tmp/a.md", "sub/../../a.md", "a\\b.md"]) await assert.rejects(store.read("example", path));
  await assert.rejects(store.comment("example", "proposal.md", "0".repeat(64), 0, 0, "Missing revision"));
  await assert.rejects(store.comment("example", "proposal.md", original.revision, 0, 999, "Bad selection"));
  await assert.rejects(store.comment("example", "proposal.md", original.revision, 0, 0, " "));
  await symlink(join(root, "private-data"), join(root, "openspec/changes/example/linked"));
  await assert.rejects(store.save("example", "proposal.md", original.revision, "No"), /Symlinks/);
}));
