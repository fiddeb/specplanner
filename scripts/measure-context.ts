import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// A reproducible synthetic project; never opens or changes the user's example repository.
const mode = process.argv[2] ?? "after";
const baselineServer = process.argv[3];
if (!["before", "after"].includes(mode)) throw new Error("Choose before or after.");
if (mode === "before" && !baselineServer) throw new Error("Pass the installed 0.1.8 dist/server.js path as the third argument.");
const directory = await mkdtemp(join(tmpdir(), "specplanner-context-"));
const workspacePath = join(directory, "repository");
process.env.SPECPLANNER_DATA_DIR = join(directory, "data");
await mkdir(join(workspacePath, ".git"), { recursive: true });
const put = async (path: string, content: string) => {
  const target = join(workspacePath, "openspec", path);
  await mkdir(join(target, ".."), { recursive: true }); await writeFile(target, content);
};
const requirement = (i: number) => `### Requirement: Reliable delivery ${i}\nThe system SHALL retain every accepted input until its result has been stored.\n\n#### Scenario: Worker failure\n- **WHEN** the worker stops before storing the result\n- **THEN** retain the input and retry using the same identifier\n`;
for (let i = 0; i < 30; i++) {
  const id = `change-${String(i).padStart(2, "0")}`;
  await put(`changes/${id}/.openspec.yaml`, "schema: spec-driven\ncreated: 2026-10-01\n");
  await put(`changes/${id}/proposal.md`, `## Why\nPreserve task inputs.\n\n## What Changes\n${"Keep task identifiers stable across retries. ".repeat(40)}\n\n## Capabilities\n### New Capabilities\n- delivery-${i}: Reliable delivery\n\n## Impact\nTask execution.\n`);
  await put(`changes/${id}/design.md`, `# Design\n${"Persist inputs before acknowledging acceptance. ".repeat(60)}\n`);
  await put(`changes/${id}/tasks.md`, `## 1. Implementation\n${Array.from({ length: 20 }, (_, n) => `- [x] 1.${n + 1} Implement and verify delivery condition ${n + 1}`).join("\n")}\n`);
  await put(`changes/${id}/verification.md`, `# Verification\n${"The isolated task retry and persistence checks passed. ".repeat(40)}\n`);
  if (i < 24) await put(`changes/${id}/specs/delivery-${i}/spec.md`, `## ADDED Requirements\n\n${requirement(i)}`);
}
await put("README.md", "# Project guidance\nKeep accepted inputs.\n");
for (let i = 0; i < 60; i++) await put(`changes/archive/2026-09-01-old-${i}/proposal.md`, `# Archived change ${i}\n${"Historical rationale. ".repeat(30)}`);
const server = createServer("<html></html>");
const client = new Client({ name: "context-measurement", version: "1" });
const [ct, st] = InMemoryTransport.createLinkedPair();
const rows: { phase: string; tool: string; bytes: number; textBytes: number }[] = [];
async function call(phase: string, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: { workspacePath, ...args } });
  if (result.isError) throw new Error(JSON.stringify(result));
  rows.push({ phase, tool: name, bytes: Buffer.byteLength(JSON.stringify(result)), textBytes: Buffer.byteLength(JSON.stringify(result.content)) });
  return result.structuredContent as any;
}
try {
  if (mode === "before") await client.connect(new StdioClientTransport({ command: process.execPath, args: [baselineServer], env: { PATH: process.env.PATH ?? "", SPECPLANNER_DATA_DIR: join(directory, "data") } }));
  else { await server.connect(st); await client.connect(ct); }
  const discoveryBytes = Buffer.byteLength(JSON.stringify(await client.listTools()));
  await call("orientation", "workspace_info");
  if (mode === "after") await call("orientation", "list_changes");
  await call("selected change", "read_change", { id: "change-00" });
  const document = (await call("selected change", "read_document", { id: "change-00", path: "proposal.md" })).result;
  if (mode === "after") await call("selected change", "read_change_file", { id: "change-00", path: "verification.md" });
  for (let i = 0; i < 3; i++) {
    await call("repeated status", "workspace_info");
    await call("repeated status", "read_document", { id: "change-00", path: "proposal.md", ...(mode === "after" ? { knownRevision: document.revision, knownCommentsRevision: document.commentsRevision } : {}) });
  }
  if (mode === "before") {
    // 0.1.8 has no archive preview: gather its available exact inputs instead.
    await call("archive inputs (preview unavailable)", "workspace_info");
    await call("archive inputs (preview unavailable)", "read_change", { id: "change-00" });
    await call("archive inputs (preview unavailable)", "validate_change", { id: "change-00" });
  } else {
    const preview = (await call("archive preview", "archive_change", { action: "preview", id: "change-00" })).result;
    // Review the exact remaining dependency/task/delta context and proposed main spec.
    await call("archive preview", "read_change_file", { id: "change-00", path: "design.md" });
    await call("archive preview", "read_document", { id: "change-00", path: "tasks.md" });
    await call("archive preview", "read_document", { id: "change-00", path: "specs/delivery-0/spec.md" });
    await call("archive preview", "archive_change", { action: "read", token: preview.token, path: "specs/delivery-0/spec.md", version: "after" });
  }
  const workflowRows = [...rows];
  const instructions = (await call("drafting instructions (separate)", "planning_instructions", { id: "change-00", artifact: "proposal" })).result;
  await call("drafting instructions (separate)", "planning_instructions", { id: "change-00", artifact: "proposal", ...(mode === "after" ? { knownRevision: instructions.revision } : {}) });
  const instructionRows = rows.slice(workflowRows.length);
  const report = { mode, baseline: mode === "before" ? "installed 0.1.8 server (read-only)" : "0.2.0 source server", fixture: { activeChanges: 30, newCapabilities: 24, archivedDocuments: 60 }, discoveryBytes, rows: workflowRows, calls: workflowRows.length, totalBytes: workflowRows.reduce((sum, row) => sum + row.bytes, 0), instructions: { calls: instructionRows.length, totalBytes: instructionRows.reduce((sum, row) => sum + row.bytes, 0), rows: instructionRows } };
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
