import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./closeout-fixture.js";
import { planningInstructions } from "../src/planning-instructions.js";
import { writingPolicy } from "../src/writing-policy.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

async function fullInstructions(...args: Parameters<typeof planningInstructions>) {
  const result = await planningInstructions(...args); assert.ok(!result.unchanged); return result;
}

test("policy is accessible before a change exists; complete known policy may be reused", () => fixture(async ({ workspace }) => {
  const first = await fullInstructions(workspace, {});
  assert.deepEqual(first.specplannerWritingPolicy, { ...writingPolicy, revision: first.writingPolicyRevision });
  assert.deepEqual(await workspace.list(), [], "Policy reads must not create planning artifacts");
  assert.deepEqual(await planningInstructions(workspace, { knownRevision: first.revision }), { revision: first.revision, unchanged: true });
  assert.equal((await fullInstructions(undefined, {})).specplannerWritingPolicy.version, 2);
  await assert.rejects(planningInstructions(workspace, { id: "missing" }), /both/);
  await assert.rejects(planningInstructions(workspace, { artifact: "tasks" }), /both/);
}));

test("instruction reuse retains exact artifact rules and refreshes changed or cross-project context", () => fixture(async ({ root, workspace, change, put }) => {
  await change("delivery");
  await put("config.yaml", "schema: spec-driven\ncontext: Keep every accepted job.\nrules:\n  tasks:\n    - Verify durable acceptance.\n");
  const first = await fullInstructions(workspace, { id: "delivery", artifact: "proposal" });
  const known = { knownContextRevision: first.contextRevision, knownWritingPolicyRevision: first.writingPolicyRevision };
  const tasks = await fullInstructions(workspace, { id: "delivery", artifact: "tasks", ...known });
  const official = await workspace.instructions("delivery", "tasks");
  for (const [key, value] of Object.entries(official)) {
    if (!["context", "specplannerWritingPolicy"].includes(key)) assert.deepEqual(tasks[key as keyof typeof tasks], value, key);
  }
  assert.equal(tasks.contextUnchanged, true); assert.equal("context" in tasks, false);
  assert.equal(tasks.specplannerWritingPolicy?.unchanged, true);
  await put("config.yaml", "schema: spec-driven\ncontext: Keep every accepted job until its result is stored.\n");
  const changed = await fullInstructions(workspace, { id: "delivery", artifact: "tasks", ...known });
  assert.equal(changed.contextUnchanged, false); assert.notEqual(changed.revision, tasks.revision);
  assert.equal(changed.context, "Keep every accepted job until its result is stored.");
  const otherPath = join(root, "other"); await mkdir(join(otherPath, ".git"), { recursive: true });
  const other = new OpenSpecWorkspace(otherPath);
  other.instructions = workspace.instructions.bind(workspace);
  const crossProject = await fullInstructions(other, { id: "delivery", artifact: "tasks", knownContextRevision: changed.contextRevision });
  assert.equal(crossProject.contextUnchanged, false); assert.equal(crossProject.context, changed.context);
}));

test("OpenSpec 2 operation guidance stays exact across context reuse and invalidation", () => fixture(async ({ workspace, change, put }) => {
  await change("delivery");
  const config = "schema: spec-driven\ncontext: Retain accepted input.\nrules:\n  tasks:\n    - Link each task.\noperations:\n  apply:\n    guidance:\n      - Verify worker restart.\n  archive:\n    guidance:\n      - Review saved evidence.\n";
  await put("config.yaml", config);
  const first = await fullInstructions(workspace, { id: "delivery", artifact: "proposal" });
  for (const artifact of ["apply", "archive"] as const) {
    const official = await workspace.instructions("delivery", artifact);
    const result = await fullInstructions(workspace, { id: "delivery", artifact, knownContextRevision: first.contextRevision, knownWritingPolicyRevision: first.writingPolicyRevision });
    assert.equal(result.contextUnchanged, true); assert.equal("context" in result, false);
    assert.deepEqual(result.operationGuidance, [artifact === "apply" ? "Verify worker restart." : "Review saved evidence."]);
    for (const [key, value] of Object.entries(official)) if (key !== "context") assert.deepEqual(result[key], value, key);
    await put("config.yaml", config.replace("Retain accepted input.", "Retain input until result storage."));
    const refreshed = await fullInstructions(workspace, { id: "delivery", artifact, knownRevision: result.revision, knownContextRevision: first.contextRevision });
    assert.equal(refreshed.context, "Retain input until result storage.");
    await put("config.yaml", config.replace("Review saved evidence.", "Review restart evidence."));
    const guidance = await fullInstructions(workspace, { id: "delivery", artifact: "archive", knownContextRevision: first.contextRevision });
    assert.deepEqual(guidance.operationGuidance, ["Review restart evidence."]);
    assert.equal(guidance.contextUnchanged, true);
    await put("config.yaml", config);
  }
}));

test("MCP board caches preserve full scenes and cannot cross workspace or saved revisions", () => fixture(async ({ root, data, workspace }) => {
  const previous = process.env.SPECPLANNER_DATA_DIR; process.env.SPECPLANNER_DATA_DIR = data;
  const server = createServer(""); const client = new Client({ name: "conditional-board-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: { workspacePath: workspace.root, ...args } });
      assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent as Record<string, any>;
    };
    const policy = await call("planning_instructions");
    assert.deepEqual(policy.result.specplannerWritingPolicy.instructions, writingPolicy.instructions);
    const first = await call("read_board");
    const known = { knownRevision: first.cacheRevision };
    const repeated = await call("read_board", known);
    assert.equal(repeated.unchanged, true); assert.equal("scene" in repeated, false);
    const otherPath = join(root, "another"); await mkdir(join(otherPath, ".git"), { recursive: true });
    assert.equal((await call("read_board", { ...known, workspacePath: otherPath })).unchanged, false);
    assert.equal((await call("read_board", { ...known, workspacePath: null })).unchanged, false);
    const scene = { elements: [{ id: "one", type: "text", x: 0, y: 0, width: 10, height: 10, text: "SHALL retain every input" }] };
    await call("save_board", { expectedRevision: 0, scene });
    const changed = await call("read_board", known);
    assert.equal(changed.unchanged, false); assert.deepEqual(changed.scene, scene);
    const old = await call("read_board", { revision: 0, knownRevision: changed.cacheRevision });
    assert.deepEqual(old.scene, first.scene); assert.equal(old.unchanged, false);
  } finally { await client.close(); await server.close(); if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous; }
}));
