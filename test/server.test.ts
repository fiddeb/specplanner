import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

test("MCP client can discover planner, invoke it, and load its UI resource", async () => {
  const server = createServer("<!doctype html><title>SpecPlanner</title>");
  const client = new Client({ name: "specplanner-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 23);
    assert.deepEqual((tools.find(tool => tool.name === "apply_board_proposal")!._meta as { ui: { visibility: string[] } }).ui.visibility, ["app"]);
    assert.deepEqual((tools.find(tool => tool.name === "propose_board")!._meta as { ui: { visibility: string[] } }).ui.visibility, ["model"]);
    assert.equal(tools[0].name, "open_planner");
    assert.equal(tools[0].annotations?.readOnlyHint, true);
    const meta = tools[0]._meta as { ui: { resourceUri: string }; "openai/ui": { entrypoints: { type: string }[] } };
    assert.equal(meta["openai/ui"].entrypoints[0].type, "thread");
    const result = await client.callTool({ name: "open_planner", arguments: { workspacePath: null } });
    assert.equal(result.isError, undefined);
    assert.equal((result.structuredContent as { phase: string }).phase, "workspace-planning");
    const resource = await client.readResource({ uri: meta.ui.resourceUri });
    assert.match(resource.contents[0].mimeType!, /text\/html/);
    assert.ok("text" in resource.contents[0]);
    assert.match(resource.contents[0].text, /SpecPlanner/);
  } finally {
    await client.close();
    await server.close();
  }
});
