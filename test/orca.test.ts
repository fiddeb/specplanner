import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import activate, { deactivate } from "../src/orca-worker.js";
import { OrcaBridge } from "../src/orca-bridge.js";
import { connectOrca, orcaClient } from "../src/orca-client.js";
import type { OrcaFrame, OrcaHost, OrcaRequestContext, OrcaWorker, OrcaWorkspace } from "../src/orca-contract.js";
import { boardSchema } from "../src/board-model.js";

const context = (id: string): OrcaRequestContext => ({ panel: { id }, signal: new AbortController().signal });
function storageFixture() {
  const values = new Map<string, unknown>();
  return { async get(key: string) { return values.get(key); }, async set(key: string, value: unknown) { values.set(key, value); } };
}
function hostFixture(workspaces: OrcaWorkspace[], selected = workspaces[0]?.id) {
  const state: { selected: string | undefined; workspaces: OrcaWorkspace[] } = { selected, workspaces };
  const host: OrcaHost = {
    call: (async (name: string) => name === "workspace.readContext" ? { workspaceId: state.selected } : { workspaces: state.workspaces, truncated: false }) as OrcaHost["call"],
  };
  return { host, state };
}
function frameFor(request: (name: string, input: unknown, context: OrcaRequestContext) => Promise<unknown>, id: string): OrcaFrame {
  return { plugin: { async request(name, input) {
    assert.ok(Buffer.byteLength(JSON.stringify(input)) < 64 * 1024, "Orca request limit");
    const response = await request(name, input, context(id));
    assert.ok(Buffer.byteLength(JSON.stringify(response)) < 1024 * 1024, "Orca response limit");
    return response;
  } }, on: () => ({ dispose() {} }) };
}

test("Orca and MCP share board revisions, bounded transfers, documents and explicit project isolation", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "specplanner-orca-")));
  const dataBefore = process.env.SPECPLANNER_DATA_DIR;
  process.env.SPECPLANNER_DATA_DIR = join(root, "data");
  const a = join(root, "a"), b = join(root, "b");
  await mkdir(join(a, ".git"), { recursive: true }); await mkdir(join(b, ".git"), { recursive: true });
  const { host, state } = hostFixture([{ id: "a", path: a, hostId: "local" }, { id: "b", path: b, hostId: "local" }]);
  const handlers = new Map<string, (input: unknown, context: OrcaRequestContext) => Promise<unknown>>();
  const worker: OrcaWorker = { host, storage: storageFixture(), panels: { handle(name, handler) { handlers.set(name, handler); return { dispose() { handlers.delete(name); } }; } } };
  try {
    await activate(worker);
    const request = (name: string, input: unknown, context: OrcaRequestContext) => handlers.get(name)!(input, context);
    const frameA = frameFor(request, "panel-a");
    const bindingA = await connectOrca(frameA);
    const appA = orcaClient(frameA, bindingA);
    state.selected = "b";
    const frameB = frameFor(request, "panel-b");
    const appB = orcaClient(frameB, await connectOrca(frameB));
    assert.equal((await connectOrca(frameA)).workspacePath, a, "focus changes cannot move an existing panel");
    await deactivate(); await activate(worker);
    assert.equal((await connectOrca(frameA)).workspacePath, a, "worker restarts retain the original binding");
    const scene = { elements: [{ id: "large", type: "text", x: 0, y: 0, width: 100, height: 100, text: "🙂\n\u0000".repeat(130_000) }] };
    const saved = await appA.callServerTool({ name: "save_board", arguments: { workspacePath: b, expectedRevision: 0, scene } });
    assert.ok(!saved.isError, JSON.stringify(saved));
    assert.deepEqual(boardSchema.parse(saved.structuredContent), { revision: 1, scene });
    const read = await appA.callServerTool({ name: "read_board" });
    assert.deepEqual(boardSchema.parse(read.structuredContent), { revision: 1, scene });
    assert.equal(boardSchema.parse((await appB.callServerTool({ name: "read_board" })).structuredContent).revision, 0);
    assert.equal((await appA.callServerTool({ name: "save_board", arguments: { expectedRevision: 0, scene } })).isError, true);
    assert.ok(!(await appA.callServerTool({ name: "create_change", arguments: { id: "native-plan" } })).isError);
    await writeFile(join(a, "openspec/changes/native-plan/proposal.md"), "# Native plan\n");
    const doc = await appA.callServerTool({ name: "read_document", arguments: { id: "native-plan", path: "proposal.md" } });
    assert.ok(!doc.isError, JSON.stringify(doc));
    assert.match(JSON.stringify(doc.structuredContent), /Native plan/);
    state.workspaces[0].path = b;
    await assert.rejects(appA.callServerTool({ name: "read_board" }), /path changed/);
    state.workspaces[0].path = a;
    state.workspaces[0].hostId = "ssh:remote";
    await assert.rejects(appA.callServerTool({ name: "read_board" }), /local repositories/);
    await assert.rejects(appB.callServerTool({ name: "propose_board" }), /not available/);
    const personalFrame = frameFor(request, "personal");
    const personal = orcaClient(personalFrame, await connectOrca(personalFrame, true));
    assert.equal(boardSchema.parse((await personal.callServerTool({ name: "read_board" })).structuredContent).revision, 0);
    assert.equal(personal.messageDelivery, "copy");
  } finally {
    await deactivate();
    if (dataBefore === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = dataBefore;
    await rm(root, { recursive: true, force: true });
  }
});

test("Orca rejects cross-panel transfers, malformed chunks, replay, oversized payloads and expired transfers", async () => {
  let now = 0, calls = 0;
  const { host } = hostFixture([]);
  const bridge = new OrcaBridge(host, async () => { calls++; return { content: [] }; }, storageFixture(), () => now);
  const a = context("a"), b = context("b");
  const binding = await bridge.request("planner.connect", { personal: true }, a) as { session: string };
  const payload = JSON.stringify({ name: "save_board", arguments: { expectedRevision: 0, scene: { elements: [] } } });
  const begin = async () => (await bridge.request("planner.begin", { session: binding.session, length: payload.length }, a) as { id: string }).id;
  await assert.rejects(bridge.request("planner.begin", { session: binding.session, length: 5_000_000 }, a));
  await assert.rejects(bridge.request("planner.begin", { session: binding.session, length: 1 }, b), /expired/);
  const id = await begin();
  await assert.rejects(bridge.request("planner.append", { id, offset: 0, text: payload }, b), /another panel/);
  await assert.rejects(bridge.request("planner.execute", { id }, a), /incomplete/);
  await assert.rejects(bridge.request("planner.append", { id, offset: 1, text: payload }, a), /offset/);
  await bridge.request("planner.append", { id, offset: 0, text: payload }, a);
  await bridge.request("planner.execute", { id }, a);
  await assert.rejects(bridge.request("planner.execute", { id }, a), /already executed/);
  assert.equal(calls, 1);
  now += 120_001;
  await assert.rejects(bridge.request("planner.read", { id, offset: 0 }, a), /expired/);
  const aborted = context("a"); aborted.signal = AbortSignal.abort();
  await assert.rejects(bridge.request("planner.begin", { session: binding.session, length: 1 }, aborted));
  for (let i = 0; i < 16; i++) await begin();
  await assert.rejects(begin(), /Too many/);
});

test("Orca requires a selected local repository or explicit personal storage", async () => {
  const { host, state } = hostFixture([{ id: "remote", path: "/tmp", hostId: "runtime:remote" }]);
  const bridge = new OrcaBridge(host, async () => ({}), storageFixture());
  await assert.rejects(bridge.request("planner.connect", {}, context("remote")), /local repositories/);
  state.selected = undefined;
  await assert.rejects(bridge.request("planner.connect", {}, context("missing")), /Select a local repository/);
  assert.equal((await bridge.request("planner.connect", { personal: true }, context("personal")) as { workspacePath: null }).workspacePath, null);
});

test("A cancelled Orca connection cannot claim a panel before a personal-board retry", async () => {
  let resolveContext!: (value: { workspaceId: string }) => void;
  const pending = new Promise<{ workspaceId: string }>(resolve => { resolveContext = resolve; });
  const host = { call: () => pending } as unknown as OrcaHost;
  const bridge = new OrcaBridge(host, async () => ({}), storageFixture());
  const controller = new AbortController();
  const connecting = bridge.request("planner.connect", {}, { panel: { id: "cancelled" }, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(bridge.request("planner.connect", { personal: true }, context("cancelled")), /already in progress/);
  controller.abort(); resolveContext({ workspaceId: "wrong-project" });
  await assert.rejects(connecting, /abort/i);
  assert.equal((await bridge.request("planner.connect", { personal: true }, context("cancelled")) as { workspacePath: null }).workspacePath, null);
});
