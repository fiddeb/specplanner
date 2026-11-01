import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fixture } from "./closeout-fixture.js";
import { ContextReader } from "../src/context-reader.js";
import { DocumentStore } from "../src/document-store.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { createServer } from "../src/server.js";
import { fullText, allPages } from "../src/panel-reading.js";

test("compact manifests preserve access to all originals through stable, explicit pages", () => fixture(async ({ workspace, data, change, put }) => {
  await change("alpha"); await change("beta"); await change("gamma");
  await put("README.md", "# Guidance\nExact original project guidance.\n");
  await put("changes/archive/2026-09-01-old/proposal.md", "# Archived original\n");
  const reader = new ContextReader(workspace, data);
  const first = await reader.changes({ limit: 1 });
  assert.deepEqual(first.items, ["alpha"]); assert.equal(first.hasMore, true); assert.equal(first.total, 3);
  assert.deepEqual((await reader.changes({ limit: 1, cursor: first.nextCursor! })).items, ["beta"]);
  const manifest = await reader.change("alpha", { limit: 2 });
  assert.equal(manifest.documents.hasMore, true);
  assert.equal("content" in manifest.documents.items[0], false);
  assert.equal((await reader.projectDocuments("project", {})).total, 1);
  assert.equal((await reader.projectDocuments("archive", {})).total, 1);
  assert.match((await reader.projectDocument("changes/archive/2026-09-01-old/proposal.md", {})).content!, /Archived original/);
  await change("aardvark");
  await assert.rejects(reader.changes({ cursor: first.nextCursor! }), /Listing changed/);
  await assert.rejects(reader.file("alpha", "../outside", {}), /relative/);
  await assert.rejects(reader.changes({ limit: 101 }), /limit/);
}));

test("document and comment conditional reads are independent; external edits cannot hide behind a known revision", () => fixture(async ({ workspace, data, change, put }) => {
  await change("delivery");
  const reader = new ContextReader(workspace, data), documents = new DocumentStore(workspace, data);
  const first = await reader.document("delivery", "proposal.md", {});
  const known = { knownRevision: first.revision, knownCommentsRevision: first.commentsRevision };
  const unchanged = await reader.document("delivery", "proposal.md", known);
  assert.equal(unchanged.unchanged, true); assert.equal(unchanged.content, undefined); assert.equal(unchanged.comments, undefined);
  const comment = await documents.comment("delivery", "proposal.md", first.revision, 0, 0, "Behåll alla krav, även undantagen.");
  const commented = await reader.document("delivery", "proposal.md", known);
  assert.equal(commented.unchanged, false); assert.equal(commented.contentUnchanged, true); assert.equal(commented.content, undefined);
  assert.deepEqual(commented.comments, [comment]);
  await put("changes/delivery/proposal.md", "# External replacement\nExact new text 🌍\n");
  const updated = await reader.document("delivery", "proposal.md", known);
  assert.equal(updated.contentUnchanged, false); assert.match(updated.content!, /External replacement/);
  assert.deepEqual(updated.comments, [comment]);
  await assert.rejects(reader.document("delivery", "proposal.md", { offset: 1, expectedRevision: first.revision }), /changed/);
}));

test("text and comment pagination reconstruct exact originals and reject stale pages", () => fixture(async ({ workspace, data, change, put }) => {
  await change("delivery");
  const content = "MUST retain every input 🌍.\n".repeat(4000);
  await put("changes/delivery/proposal.md", content);
  const reader = new ContextReader(workspace, data), store = new DocumentStore(workspace, data);
  const first = await reader.document("delivery", "proposal.md", { limit: 5 });
  assert.equal(first.hasMore, true); assert.equal(first.nextOffset, 5); assert.equal(first.total, content.length);
  await assert.rejects(reader.document("delivery", "proposal.md", { offset: 5 }), /missing expectedRevision/);
  for (let i = 0; i < 23; i++) await store.comment("delivery", "proposal.md", first.revision, i, i + 1, `Original review comment ${i}`);
  const call = async (_tool: string, args: Record<string, unknown>) => ({ result: await reader.document("delivery", "proposal.md", args) });
  const full = await fullText(call, "read_document", { id: "delivery", path: "proposal.md" });
  assert.equal(full.content, content); assert.equal(full.comments.length, 23);
  const comments = await reader.document("delivery", "proposal.md", { commentsLimit: 1 });
  await store.comment("delivery", "proposal.md", first.revision, 0, 0, "A new concurrent comment");
  await assert.rejects(reader.document("delivery", "proposal.md", { commentsCursor: comments.commentsPage.nextCursor! }), /Listing changed/);
  const file = await reader.file("delivery", "verification.md", {});
  assert.equal((await reader.file("delivery", "verification.md", { knownRevision: file.revision })).unchanged, true);
  await put("changes/delivery/verification.md", "Different saved verification\n");
  assert.equal((await reader.file("delivery", "verification.md", { knownRevision: file.revision })).unchanged, false);
}));

test("equal document bytes and names across projects never reuse another workspace's context", () => fixture(async ({ root, workspace, data, change }) => {
  await change("delivery");
  const otherRoot = join(root, "other"), other = new OpenSpecWorkspace(otherRoot);
  await mkdir(join(otherRoot, ".git"), { recursive: true });
  await mkdir(join(otherRoot, "openspec/changes/delivery"), { recursive: true });
  const reader = new ContextReader(workspace, data), second = new ContextReader(other, data);
  const original = await reader.document("delivery", "proposal.md", {});
  await writeFile(join(otherRoot, "openspec/changes/delivery/proposal.md"), original.content!);
  const result = await second.document("delivery", "proposal.md", { knownRevision: original.revision, knownCommentsRevision: original.commentsRevision });
  assert.equal(result.unchanged, false); assert.equal(result.content, original.content);
  const list = await reader.change("delivery", { limit: 1 });
  await assert.rejects(second.change("delivery", { cursor: list.documents.nextCursor! }), /another workspace/);
}));

test("real MCP results are compact, instructions support conditional reads, and panel page collection works", () => fixture(async ({ workspace, data, change, put }) => {
  await change("delivery"); await change("other", null);
  await put("README.md", "# Workspace guidance\n");
  const previous = process.env.SPECPLANNER_DATA_DIR; process.env.SPECPLANNER_DATA_DIR = data;
  const server = createServer("<html></html>");
  const client = new Client({ name: "context-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: { workspacePath: workspace.root, ...args } });
      assert.ok(!result.isError, JSON.stringify(result));
      return result.structuredContent as Record<string, unknown>;
    };
    const result = await client.callTool({ name: "workspace_info", arguments: { workspacePath: workspace.root } });
    const summary = result.structuredContent as Record<string, unknown>;
    assert.equal(summary.activeChanges, 2); assert.equal("changes" in summary, false); assert.equal("documents" in summary, false);
    assert.ok(JSON.stringify(result.content).length < 100);
    assert.equal((await call("workspace_info", { knownRevision: summary.revision })).unchanged, true);
    const all = await allPages<string>(call, "list_changes", { limit: 1 });
    assert.deepEqual(all, ["delivery", "other"]);
    const instructions = (await call("planning_instructions", { id: "delivery", artifact: "proposal" })).result as { revision: string; template: string; writingPolicyRevision: string };
    assert.ok(instructions.template);
    assert.deepEqual((await call("planning_instructions", { id: "delivery", artifact: "proposal", knownRevision: instructions.revision })).result, { revision: instructions.revision, unchanged: true });
    const nextArtifact = (await call("planning_instructions", { id: "delivery", artifact: "design", knownWritingPolicyRevision: instructions.writingPolicyRevision })).result as { template: string; specplannerWritingPolicy: { unchanged: boolean; instructions?: string } };
    assert.ok(nextArtifact.template); assert.equal(nextArtifact.specplannerWritingPolicy.unchanged, true); assert.equal(nextArtifact.specplannerWritingPolicy.instructions, undefined);
    const status = (await call("change_status", { id: "delivery" })).result as { revision: string; implementation: { status: string } };
    assert.equal(status.implementation.status, "unknown");
    const document = await new DocumentStore(workspace, data).read("delivery", "proposal.md");
    await new DocumentStore(workspace, data).comment("delivery", "proposal.md", document.revision, 0, 0, "New review");
    const changed = (await call("change_status", { id: "delivery", knownRevision: status.revision })).result as { unchanged: boolean };
    assert.equal(changed.unchanged, false);
    const missingScope = await client.callTool({ name: "archive_change", arguments: { action: "preview", id: "delivery" } });
    assert.equal(missingScope.isError, true);
  } finally { await client.close(); await server.close(); if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous; }
}));
