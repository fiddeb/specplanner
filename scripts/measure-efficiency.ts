// Synthetic fixtures only. Optional arguments: baseline server.js, capture output.json.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "../src/server.js";
import { fullText } from "../src/panel-reading.js";

const baseline = process.argv[2] !== "current" ? process.argv[2] : undefined;
const directory = await mkdtemp(join(tmpdir(), "specplanner-efficiency-"));
const workspacePath = join(directory, "repository");
process.env.SPECPLANNER_DATA_DIR = join(directory, "data");
const content = "The worker SHALL retain accepted input until its result has been stored.\n".repeat(2200);
await mkdir(join(workspacePath, ".git"), { recursive: true });
await mkdir(join(workspacePath, "openspec/changes/delivery"), { recursive: true });
await writeFile(join(workspacePath, "openspec/changes/delivery/proposal.md"), content);
const server = createServer("<html></html>");
const client = new Client({ name: "efficiency-measurement", version: "1" });
const captures: { phase: string; request: unknown; result: unknown }[] = [];
async function call(name: string, args: Record<string, unknown>, phase?: string) {
  const request = { name, arguments: { ...args, workspacePath } };
  const result = await client.callTool(request);
  assert.ok(!result.isError, JSON.stringify(result));
  if (phase) captures.push({ phase, request, result });
  return result.structuredContent as Record<string, unknown>;
}
const element = (i: number) => ({ id: `review-element-${i}`, type: "rectangle", x: i % 10 * 220, y: Math.floor(i / 10) * 160, width: 180, height: 100, angle: 0, strokeColor: "#1b1b1f", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, index: `a${i.toString(36)}`, roundness: { type: 3 }, seed: 100000 + i, version: 1, versionNonce: 200000 + i, isDeleted: false, boundElements: null, updated: 1794355200000, link: null, locked: false });
try {
  if (baseline) await client.connect(new StdioClientTransport({ command: process.execPath, args: [baseline], env: { PATH: process.env.PATH ?? "", SPECPLANNER_DATA_DIR: process.env.SPECPLANNER_DATA_DIR! } }));
  else {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
  }
  const discovery = await client.listTools();
  const original = (await call("read_document", { id: "delivery", path: "proposal.md" })).result as { revision: string; identity?: string };
  for (let i = 0; i < 23; i++) await call("add_comment", { id: "delivery", path: "proposal.md", revision: original.revision, expectedIdentity: original.identity, start: 0, end: 0, text: `Review ${i}: ` + "Specify retry limits, idempotency behavior, and recovery after a worker failure. ".repeat(12) });
  const document = await fullText((tool, args) => {
    // Reproduce the 0.2 panel, which requested the first comment page on every text slice.
    if (baseline && Number(args.offset) > 0) delete args.knownCommentsRevision;
    return call(tool, args, "document");
  }, "read_document", { id: "delivery", path: "proposal.md" });
  assert.equal(document.content, content); assert.equal(document.comments.length, 23);
  const scene = { elements: Array.from({ length: 101 }, (_, i) => element(i)) };
  let selectedId = "";
  for (let i = 0; i < 5; i++) {
    const result = (await call("propose_board", { baseRevision: 0, summary: `Add planning step ${i}`, scene }, "proposal")).result as { id: string };
    selectedId = result.id;
  }
  await call("list_board_proposals", {}, "list");
  if (!baseline) {
    const selected = (await call("read_board_proposal", { id: selectedId }, "selected proposal")).result as { scene: unknown };
    assert.deepEqual(selected.scene, scene);
  }
  const rows = captures.map(item => ({ phase: item.phase, requestBytes: Buffer.byteLength(JSON.stringify(item.request)), responseBytes: Buffer.byteLength(JSON.stringify(item.result)) }));
  const report = { mode: baseline ? "0.2 baseline" : "current", fixture: { documentCharacters: content.length, comments: 23, proposals: 5, elementsPerProposal: 101 }, exactOriginalsVerified: true, rows };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify({ report, discovery, captures }));
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
