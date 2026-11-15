// Run after packaging: tsx scripts/verify-openspec-upgrade.ts <baseline-package> <candidate-package> <report.json>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [baselinePath, candidatePath, reportPath] = process.argv.slice(2).map(path => resolve(path));
if (!reportPath) throw new Error("Pass baseline, candidate and report paths.");
const temporary = await mkdtemp(join(tmpdir(), "specplanner-upgrade-"));
const workspacePath = join(temporary, "repository"), data = join(temporary, "data");
let client: Client | undefined;
async function connect(path: string) {
  if (client) await client.close();
  client = new Client({ name: "upgrade-verification", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(path, "dist/server.js")], env: { PATH: process.env.PATH ?? "", SPECPLANNER_DATA_DIR: data } }));
}
async function call(name: string, args: Record<string, unknown> = {}) {
  const response = await client!.callTool({ name, arguments: { workspacePath, ...args } });
  assert.ok(!response.isError, JSON.stringify(response));
  return response.structuredContent as Record<string, any>;
}
async function identity(path: string) {
  return { version: JSON.parse(await readFile(join(path, "package.json"), "utf8")).version,
    openspec: JSON.parse(await readFile(join(path, "node_modules/@fission-ai/openspec/package.json"), "utf8")).version,
    serverSha256: createHash("sha256").update(await readFile(join(path, "dist/server.js"))).digest("hex") };
}
try {
  await mkdir(join(workspacePath, ".git"), { recursive: true });
  await connect(baselinePath);
  await call("create_change", { id: "delivery" });
  const folder = join(workspacePath, "openspec/changes/delivery");
  const text = "## Why\nPreserve accepted input and its original review.\n";
  await writeFile(join(folder, "proposal.md"), text);
  await writeFile(join(folder, "design.md"), "# Design\nStore input before acknowledgement.\n");
  await writeFile(join(folder, "tasks.md"), "- [x] Verify persistence\n");
  await writeFile(join(folder, "verification.md"), "The synthetic upgrade round trip verified exact source, original comments and board revisions.\n");
  await mkdir(join(folder, "specs/delivery"), { recursive: true });
  await writeFile(join(folder, "specs/delivery/spec.md"), "## Purpose\nKeep accepted work available after a worker restart without losing its original input.\n\n## ADDED Requirements\n\n### Requirement: Durable input\nThe service SHALL retain accepted input until its result is stored.\n\n#### Scenario: Restart\n- **WHEN** the worker restarts before result storage\n- **THEN** the original input remains available\n");
  const scene = { elements: [{ id: "input", type: "text", x: 20, y: 20, width: 100, height: 20, text: "Preserve input" }] };
  await call("save_board", { expectedRevision: 0, scene });
  const oldDocument = (await call("read_document", { id: "delivery", path: "proposal.md" })).result;
  await call("add_comment", { id: "delivery", path: "proposal.md", expectedIdentity: oldDocument.identity, revision: oldDocument.revision, start: 7, end: text.length - 1, text: "Behåll originalet och skälet till beslutet." });
  const before = (await call("read_document", { id: "delivery", path: "proposal.md" })).result;
  const oldInstructions = (await call("planning_instructions", { id: "delivery", artifact: "proposal" })).result;
  assert.ok(oldInstructions.template);
  const oldValidation = (await call("validate_change", { id: "delivery" })).result;
  assert.equal(oldValidation.summary.totals.failed, 0);
  await connect(candidatePath);
  const after = (await call("read_document", { id: "delivery", path: "proposal.md" })).result;
  assert.equal(after.content, before.content); assert.equal(after.identity, before.identity);
  assert.equal(after.revision, before.revision); assert.deepEqual(after.comments, before.comments);
  assert.deepEqual((await call("read_board")).scene, scene);
  assert.equal((await call("read_board")).revision, 1);
  const rejected = await client!.callTool({ name: "save_board", arguments: { workspacePath, expectedRevision: 0, scene } });
  assert.equal(rejected.isError, true);
  assert.equal((await call("validate_change", { id: "delivery" })).result.summary.totals.failed, 0);
  const apply = (await call("planning_instructions", { id: "delivery", artifact: "apply" })).result;
  assert.equal(apply.tasks[0].line, 1); assert.equal(apply.tasks[0].sourcePath, await realpath(join(folder, "tasks.md")));
  await call("planning_instructions", { id: "delivery", artifact: "archive" });
  const preview = (await call("archive_change", { action: "preview", id: "delivery" })).result;
  assert.equal(preview.blockers.total, 0);
  const archive = (await call("archive_change", { action: "apply", token: preview.token, verification: { summary: "Verified exact baseline-to-candidate persisted state.", evidencePaths: ["verification.md"] }, dependenciesReviewed: true, specDiffsReviewed: true })).result;
  assert.equal(archive.outcome, "archived");
  const archiveName = preview.destination.split("/").at(-1);
  assert.equal(await readFile(join(workspacePath, preview.destination, "proposal.md"), "utf8"), text);
  await connect(baselinePath); // The previous release must still read persisted state after the upgrade.
  assert.deepEqual((await call("read_board")).scene, scene);
  const retained = (await call("read_document", { id: "delivery", archiveName, path: "proposal.md" })).result;
  assert.deepEqual(retained.comments, before.comments); assert.equal(retained.content, text);
  await writeFile(reportPath, JSON.stringify({ baseline: await identity(baselinePath), candidate: await identity(candidatePath), environment: { node: process.version, platform: platform(), arch: arch() },
    result: "pass", checks: ["baseline create/instructions/strict validation", "candidate validation and operation JSON", "exact board/document/review persistence across process replacement", "stale board write rejected", "candidate reviewed archive and source preservation", "baseline can read candidate archive and retained reviews after rollback"] }, null, 2) + "\n");
  console.log("PASS: baseline/candidate process replacement, persisted state, operations, reviewed archive and rollback reads.");
} finally { if (client) await client.close(); await rm(temporary, { recursive: true, force: true }); }
