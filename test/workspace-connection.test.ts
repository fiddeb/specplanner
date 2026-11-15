import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, mkdir, realpath, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WorkspaceConnections } from "../src/workspace-connection.js";
import { createServer } from "../src/server.js";

test("panel connections isolate concurrent projects, survive a new server instance, and reject rebinding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "specplanner-connect-"));
  let now = 0;
  const a = new WorkspaceConnections(dir, () => now);
  const b = new WorkspaceConnections(dir, () => now);
  try {
    const first = await a.create(); const second = await b.create();
    assert.deepEqual(await a.read(first), { connected: false });
    await Promise.all([a.bind(first, "/project/a"), b.bind(second, "/project/b")]);
    assert.deepEqual(await b.read(first), { connected: true, workspacePath: "/project/a" });
    assert.deepEqual(await a.read(second), { connected: true, workspacePath: "/project/b" });
    await assert.rejects(b.bind(first, "/project/b"), /already connected/);
    await a.bind(first, "/project/a");
    const personal = await a.create();
    assert.deepEqual(await b.bind(personal, null), { connected: true, workspacePath: null });
    const race = await a.create();
    const results = await Promise.allSettled([a.bind(race, "/a"), b.bind(race, "/b")]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    await assert.rejects(a.read("../file"), /Invalid/);
    now = 600_000;
    await assert.rejects(a.read(first), /expired/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("malformed connection records cannot bypass expiry or replace an existing binding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "specplanner-connect-invalid-"));
  const connections = new WorkspaceConnections(dir, () => 0);
  try {
    const id = await connections.create();
    const requestPath = join(dir, `${id}.request.json`);
    const workspacePath = join(dir, `${id}.workspace.json`);
    for (const request of [{}, { expiresAt: null }, { expiresAt: "later" }, { expiresAt: -1 }]) {
      await writeFile(requestPath, JSON.stringify(request));
      await assert.rejects(connections.read(id), { name: "ZodError" });
      await assert.rejects(connections.bind(id, "/project/a"), { name: "ZodError" });
      await assert.rejects(readFile(workspacePath), { code: "ENOENT" });
    }
    await writeFile(requestPath, JSON.stringify({ expiresAt: 600_000 }));
    for (const binding of [{}, { workspacePath: "" }, { workspacePath: 42 }, { workspacePath: "/project/a", connected: false }]) {
      const content = JSON.stringify(binding);
      await writeFile(workspacePath, content);
      await assert.rejects(connections.read(id), { name: "ZodError" });
      await assert.rejects(connections.bind(id, "/project/a"), { name: "ZodError" });
      assert.equal(await readFile(workspacePath, "utf8"), content);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("empty + launch connects the existing panel without a second open or global workspace mutation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "specplanner-entrypoint-"));
  const previous = process.env.SPECPLANNER_DATA_DIR;
  const previousWorkspace = process.env.SPECPLANNER_WORKSPACE;
  process.env.SPECPLANNER_DATA_DIR = dir;
  delete process.env.SPECPLANNER_WORKSPACE;
  const server = createServer("<html></html>");
  const client = new Client({ name: "entrypoint-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    const project = join(dir, "repository"); await mkdir(join(project, ".git"), { recursive: true });
    await server.connect(st); await client.connect(ct);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result));
      return result.structuredContent as any;
    };
    const opened = await call("open_planner", {});
    assert.equal(opened.workspacePath, null);
    assert.ok(opened.connectionRequestId);
    const requestId = opened.connectionRequestId;
    assert.equal((await call("workspace_connection", { requestId })).connected, false);
    await call("connect_workspace", { requestId, workspacePath: project });
    assert.equal((await call("workspace_connection", { requestId })).workspacePath, await realpath(project));
    assert.equal((await call("workspace_info", {})).configured, false);
    assert.equal((await call("open_planner", { workspacePath: null })).connectionRequestId, undefined);
    assert.equal((await call("open_planner", { workspacePath: project })).connectionRequestId, undefined);
  } finally {
    await client.close(); await server.close();
    if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous;
    if (previousWorkspace === undefined) delete process.env.SPECPLANNER_WORKSPACE; else process.env.SPECPLANNER_WORKSPACE = previousWorkspace;
    await rm(dir, { recursive: true, force: true });
  }
});
