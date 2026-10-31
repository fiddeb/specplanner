import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoardStore, RevisionConflict } from "../src/board-store.js";
const scene = { elements: [{ id: "box", type: "rectangle" as const, x: 10, y: 20, width: 100, height: 80, roughness: 0 }] };
test("board persists across restarts and retains old revisions", async () => {
 const dir = await mkdtemp(join(tmpdir(), "specplanner-board-"));
 try {
  const store = new BoardStore(dir);
  assert.equal((await store.read()).revision, 0);
  await store.save(0, scene);
  assert.deepEqual((await new BoardStore(dir).read()).scene, scene);
  await store.save(1, { elements: [] });
  assert.equal(JSON.parse(await readFile(join(dir, "v1.json"), "utf8")).scene.elements.length, 1);
  await assert.rejects(store.save(1, scene), RevisionConflict);
  assert.equal((await store.read()).revision, 2);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
test("independent writers cannot publish the same base revision twice", async () => {
 const dir = await mkdtemp(join(tmpdir(), "specplanner-race-"));
 try {
  const results = await Promise.allSettled([new BoardStore(dir).save(0, scene), new BoardStore(dir).save(0, { elements: [] })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected" && result.reason instanceof RevisionConflict).length, 1);
  assert.deepEqual(await readdir(dir), ["v1.json"]);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
test("invalid scenes do not create a revision", async () => {
 const dir = await mkdtemp(join(tmpdir(), "specplanner-invalid-"));
 try {
  const store = new BoardStore(dir);
  await assert.rejects(store.save(0, { elements: [{ ...scene.elements[0], x: Infinity }] }));
  assert.equal((await store.read()).revision, 0);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test("proposals persist without changing the board and apply only once against their base", async () => {
 const dir = await mkdtemp(join(tmpdir(), "specplanner-proposal-"));
 try {
  const store = new BoardStore(dir);
  const proposal = await store.propose(0, "Add the planning step", scene);
  assert.equal((await store.read()).revision, 0);
  const restarted = new BoardStore(dir);
  assert.deepEqual(await restarted.proposals(), [proposal]);
  assert.deepEqual((await restarted.applyProposal(proposal.id)).scene, scene);
  await assert.rejects(store.applyProposal(proposal.id), RevisionConflict);
  assert.deepEqual((await store.readRevision(0)).scene.elements, []);
  assert.deepEqual((await store.readRevision(1)).scene, scene);
  await assert.rejects(store.readRevision(999));
  await assert.rejects(store.applyProposal("../outside"));
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test("manual saves invalidate proposals and competing applications publish only once", async () => {
 const dir = await mkdtemp(join(tmpdir(), "specplanner-proposal-race-"));
 try {
  const store = new BoardStore(dir);
  const stale = await store.propose(0, "Old proposal", scene);
  await store.save(0, { elements: [] });
  await assert.rejects(store.applyProposal(stale.id), RevisionConflict);
  await assert.rejects(store.propose(0, "Already stale", scene), RevisionConflict);
  const first = await store.propose(1, "First proposal", scene);
  const second = await store.propose(1, "Second proposal", { elements: [] });
  const results = await Promise.allSettled([store.applyProposal(first.id), new BoardStore(dir).applyProposal(second.id)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await store.read()).revision, 2);
  await assert.rejects(store.propose(2, "Duplicate element IDs", { elements: [...scene.elements, ...scene.elements] }));
 } finally { await rm(dir, { recursive: true, force: true }); }
});
