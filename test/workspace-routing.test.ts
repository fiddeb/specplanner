import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { bindWorkspace, type PanelClient } from "../src/panel-client.js";

test("interleaved MCP calls route documents, boards and proposals by project without shared selection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "specplanner-routing-"));
  const previous = process.env.SPECPLANNER_DATA_DIR;
  process.env.SPECPLANNER_DATA_DIR = join(dir, "data");
  const a = join(dir, "a"); const b = join(dir, "b");
  const server = createServer("<html></html>", undefined, new OpenSpecWorkspace(a));
  const client = new Client({ name: "routing-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    for (const [root, content] of [[a, "Alpha"], [b, "Beta"]]) {
      await mkdir(join(root, ".git"), { recursive: true });
      await mkdir(join(root, "openspec/changes/example"), { recursive: true });
      await writeFile(join(root, "openspec/changes/example/proposal.md"), content);
    }
    await server.connect(st); await client.connect(ct);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result));
      return result.structuredContent as any;
    };
    assert.equal((await call("open_planner", { workspacePath: b })).workspacePath, await realpath(b));
    assert.equal((await call("workspace_info", {})).path, await realpath(a), "opening B does not mutate the fallback");
    assert.equal((await call("workspace_info", { workspacePath: null })).configured, false);
    assert.equal((await call("read_document", { workspacePath: a, id: "example", path: "proposal.md" })).result.content, "Alpha");
    assert.equal((await call("read_document", { workspacePath: b, id: "example", path: "proposal.md" })).result.content, "Beta");
    await call("save_board", { workspacePath: a, expectedRevision: 0, scene: { elements: [] } });
    assert.equal((await call("read_board", { workspacePath: b })).revision, 0);
    assert.equal((await call("read_board", { workspacePath: null })).revision, 0);
    const proposal = await call("propose_board", { workspacePath: a, baseRevision: 1, summary: "Alpha", scene: { elements: [] } });
    assert.equal((await call("list_board_proposals", { workspacePath: b })).result.length, 0);
    const wrong = await client.callTool({ name: "apply_board_proposal", arguments: { workspacePath: b, id: proposal.result.id } });
    assert.equal(wrong.isError, true);
    assert.equal((await call("read_board", { workspacePath: a })).revision, 1);
    const invalid = await client.callTool({ name: "open_planner", arguments: { workspacePath: "relative" } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close(); await server.close();
    if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("panel binding includes its workspace even when caller arguments specify another", async () => {
  const calls: unknown[] = [];
  const app = { callServerTool: async (params: unknown) => { calls.push(params); return { content: [] }; }, sendMessage: async () => ({}) } as PanelClient;
  const a = bindWorkspace(app, "/projects/a"); const b = bindWorkspace(app, "/projects/b");
  await a.callServerTool({ name: "read_board", arguments: { workspacePath: "/projects/wrong" } });
  await b.callServerTool({ name: "read_board", arguments: {} });
  await bindWorkspace(app, null).callServerTool({ name: "read_board", arguments: {} });
  assert.deepEqual(calls, [
    { name: "read_board", arguments: { workspacePath: "/projects/a" } },
    { name: "read_board", arguments: { workspacePath: "/projects/b" } },
    { name: "read_board", arguments: { workspacePath: null } },
  ]);
});
