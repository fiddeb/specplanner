// Run: tsx scripts/measure-planning.ts <capture.json> [baseline/dist/server.js]
// Measures actual MCP payloads in disposable fixtures; no model calls or user data.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "../src/server.js";

if (!process.argv[2]) throw new Error("Pass an output JSON path and optionally a baseline server path.");
const temporary = await mkdtemp(join(tmpdir(), "specplanner-planning-measurement-"));
const workspacePath = join(temporary, "repository");
const previous = process.env.SPECPLANNER_DATA_DIR;
process.env.SPECPLANNER_DATA_DIR = join(temporary, "data");
const server = createServer("");
const client = new Client({ name: "planning-measurement", version: "1" });
const rows: { phase: string; request: unknown; result: unknown }[] = [];
async function call(phase: string, name: string, args: Record<string, unknown>) {
  const request = { name, arguments: { workspacePath, ...args } };
  const result = await client.callTool(request);
  assert.ok(!result.isError, JSON.stringify(result));
  rows.push({ phase, request, result });
  return result.structuredContent as Record<string, any>;
}
try {
  await mkdir(join(workspacePath, ".git"), { recursive: true });
  await mkdir(join(workspacePath, "openspec/changes/delivery"), { recursive: true });
  const context = Array.from({ length: 50 }, (_, i) => `Service ${i} retains accepted jobs until their results are stored and records the original request identifier.`).join("\n");
  await writeFile(join(workspacePath, "openspec/config.yaml"), `schema: spec-driven\ncontext: |\n${context.split("\n").map(line => `  ${line}`).join("\n")}\n`);
  await writeFile(join(workspacePath, "openspec/changes/delivery/.openspec.yaml"), "schema: spec-driven\n");
  if (process.argv[3]) await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(process.argv[3])], env: { PATH: process.env.PATH ?? "", SPECPLANNER_DATA_DIR: process.env.SPECPLANNER_DATA_DIR! } }));
  else { const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct); }
  const discovery = await client.listTools();
  const scene = { elements: Array.from({ length: 101 }, (_, i) => ({ id: `step-${i}`, type: "rectangle", x: i * 20, y: 20, width: 100, height: 60, version: 1, versionNonce: i, roughness: 0, strokeColor: "#111111", backgroundColor: "transparent" })) };
  await call("setup", "save_board", { expectedRevision: 0, scene });
  const board = await call("board first read", "read_board", {});
  assert.deepEqual(board.scene, scene);
  for (let i = 0; i < 3; i++) await call("board repeated", "read_board", { knownRevision: board.cacheRevision });
  const first = (await call("instructions first", "planning_instructions", { id: "delivery", artifact: "proposal" })).result;
  assert.equal(first.context, context);
  for (const artifact of ["design", "specs", "tasks"]) {
    const next = (await call("instructions other artifact", "planning_instructions", { id: "delivery", artifact, knownWritingPolicyRevision: first.writingPolicyRevision, knownContextRevision: first.contextRevision })).result;
    assert.ok(next.template);
    assert.ok(next.context === first.context || (next.contextUnchanged === true && next.contextRevision === first.contextRevision));
  }
  await call("instructions repeated", "planning_instructions", { id: "delivery", artifact: "proposal", knownRevision: first.revision });
  const originalText = "Retain accepted input.\n".repeat(40000);
  await writeFile(join(workspacePath, "openspec/changes/delivery/proposal.md"), originalText);
  const document = (await call("setup", "read_document", { id: "delivery", path: "proposal.md", limit: 1 })).result;
  const comment = (await call("setup", "add_comment", { id: "delivery", path: "proposal.md", expectedIdentity: document.identity, revision: document.revision, start: 0, end: originalText.length, text: "Behåll alla krav och undantag." })).result;
  assert.equal(comment.quote, originalText);
  const reviewed = (await call("large review selection", "read_document", { id: "delivery", path: "proposal.md", limit: 1, commentsLimit: 1 })).result;
  assert.ok(reviewed.comments[0].quote === originalText || (reviewed.comments[0].quotePage?.total === originalText.length && reviewed.comments[0].quotePage?.hasMore));
  await writeFile(process.argv[2], JSON.stringify({ fixture: { elements: 101, repeatedBoardReads: 3, contextCharacters: context.length, artifacts: 4 }, discovery, rows }, null, 2));
  console.log(JSON.stringify(rows.filter(row => row.phase !== "setup").map(row => ({ phase: row.phase, requestBytes: Buffer.byteLength(JSON.stringify(row.request)), responseBytes: Buffer.byteLength(JSON.stringify(row.result)) })), null, 2));
} finally {
  await client.close(); await server.close(); await rm(temporary, { recursive: true, force: true });
  if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous;
}
