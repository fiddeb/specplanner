import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { verifyOrcaPackage } from "./verify-orca-package.js";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "specplanner install "));
const existingInstallation = process.env.SPECPLANNER_VERIFY_INSTALL;
const installed = existingInstallation ?? join(temporary, "plugin with spaces");
const client = new Client({ name: "specplanner-install-test", version: "1.0.0" });
try {
  if (!existingInstallation) await cp(new URL(`releases/specplanner-${manifest.version}/`, root), installed, { recursive: true });
  const installedManifest = JSON.parse(await readFile(join(installed, "plugin.json"), "utf8"));
  assert.equal(installedManifest.skills, "./skills/");
  const skillDirectory = join(installed, installedManifest.skills, "specplanner");
  const skill = await readFile(join(skillDirectory, "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: specplanner\n/);
  for (const match of skill.matchAll(/\]\(([^)]+)\)/g)) await readFile(join(skillDirectory, match[1]));
  assert.match(await readFile(join(skillDirectory, "agents/openai.yaml"), "utf8"), /value: "specplanner"/);
  assert.match(await readFile(join(installed, "LICENSE"), "utf8"), /MIT License/);
  const licenseManifest = JSON.parse(await readFile(join(installed, "licenses/manifest.json"), "utf8")) as { name: string; version: string; packagePath: string; notices: { sha256: string }[] }[];
  const bundledPackages: string[] = JSON.parse(await readFile(new URL("dist/bundled-packages.json", root), "utf8"));
  if (!existingInstallation) for (const path of bundledPackages) assert.ok(licenseManifest.some(pkg => pkg.packagePath === path), `Missing bundled license: ${path}`);
  for (const pkg of licenseManifest) {
    assert.ok(pkg.notices.length > 0, `Missing notices for ${pkg.name}`);
    for (const notice of pkg.notices) {
      const text = await readFile(join(installed, "licenses", `${notice.sha256}.txt`), "utf8");
      assert.equal(createHash("sha256").update(text).digest("hex"), notice.sha256);
    }
  }
  assert.match(await readFile(join(installed, "THIRD_PARTY_NOTICES.txt"), "utf8"), /Excalidraw/);
  const workspace = join(temporary, "repository");
  await mkdir(join(workspace, ".git"), { recursive: true });
  const config = JSON.parse(await readFile(join(installed, "mcp.json"), "utf8"));
  const launch = config.mcpServers.specplanner;
  assert.equal(launch.type, "stdio");
  const resolve = (value: string) => value.replaceAll("${PLUGIN_ROOT}", installed);
  const transport = new StdioClientTransport({ command: process.execPath, args: launch.args.map(resolve), cwd: resolve(launch.cwd), env: { PATH: process.env.PATH ?? "", SPECPLANNER_DATA_DIR: join(temporary, "board-data"), SPECPLANNER_WORKSPACE: workspace } });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some(tool => tool.name === "open_planner"));
  const policyOnly = await client.callTool({ name: "planning_instructions", arguments: { workspacePath: workspace } });
  assert.ok(!policyOnly.isError);
  assert.equal((policyOnly.structuredContent as { result: { specplannerWritingPolicy: { version: number } } }).result.specplannerWritingPolicy.version, 2);
  const result = await client.callTool({ name: "open_planner", arguments: {} });
  assert.ok(!result.isError);
  assert.equal((result.structuredContent as { connected: boolean }).connected, true);
  const secondWorkspace = join(temporary, "second repository");
  await mkdir(join(secondWorkspace, ".git"), { recursive: true });
  const secondPanel = await client.callTool({ name: "open_planner", arguments: { workspacePath: secondWorkspace } });
  assert.ok(!secondPanel.isError);
  assert.equal((secondPanel.structuredContent as { workspacePath: string }).workspacePath, await realpath(secondWorkspace));
  const fallbackInfo = await client.callTool({ name: "workspace_info", arguments: {} });
  assert.equal((fallbackInfo.structuredContent as { path: string }).path, await realpath(workspace));
  const original = await client.callTool({ name: "read_board", arguments: {} });
  assert.equal((original.structuredContent as { revision: number }).revision, 0);
  const saved = await client.callTool({ name: "save_board", arguments: { expectedRevision: 0, scene: { elements: [] } } });
  assert.ok(!saved.isError);
  assert.equal((saved.structuredContent as { revision: number }).revision, 1);
  const conflict = await client.callTool({ name: "save_board", arguments: { expectedRevision: 0, scene: { elements: [] } } });
  assert.equal(conflict.isError, true);
  const current = await client.callTool({ name: "read_board", arguments: {} });
  assert.equal((current.structuredContent as { revision: number }).revision, 1);
  const proposedScene = { elements: [{ id: "agent-step", type: "rectangle", x: 100, y: 100, width: 160, height: 100, roughness: 0 }] };
  const proposed = await client.callTool({ name: "propose_board", arguments: { baseRevision: 1, summary: "Add an agent step", scene: proposedScene } });
  assert.ok(!proposed.isError);
  const proposalId = (proposed.structuredContent as { result: { id: string } }).result.id;
  const unchanged = await client.callTool({ name: "read_board", arguments: {} });
  assert.equal((unchanged.structuredContent as { revision: number }).revision, 1);
  const proposals = await client.callTool({ name: "list_board_proposals", arguments: {} });
  const proposalItems = (proposals.structuredContent as { result: { items: Record<string, unknown>[] } }).result.items;
  assert.equal(proposalItems.length, 1);
  assert.equal("scene" in proposalItems[0], false);
  const selectedProposal = await client.callTool({ name: "read_board_proposal", arguments: { id: proposalId } });
  assert.deepEqual((selectedProposal.structuredContent as { result: { scene: unknown } }).result.scene, proposedScene);
  const applied = await client.callTool({ name: "apply_board_proposal", arguments: { id: proposalId } });
  assert.ok(!applied.isError);
  assert.equal((applied.structuredContent as { revision: number }).revision, 2);
  const repeated = await client.callTool({ name: "apply_board_proposal", arguments: { id: proposalId } });
  assert.equal(repeated.isError, true);
  const historical = await client.callTool({ name: "read_board", arguments: { revision: 1 } });
  assert.equal((historical.structuredContent as { revision: number }).revision, 1);
  assert.deepEqual((historical.structuredContent as { scene: unknown }).scene, { elements: [] });
  for (const [name, args] of [
    ["workspace_info", {}],
    ["create_change", { id: "sample-plan" }],
    ["read_change", { id: "sample-plan" }],
    ["planning_instructions", { id: "sample-plan", artifact: "proposal" }],
    ["validate_change", { id: "sample-plan" }],
  ] as const) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
    if (name === "planning_instructions") {
      const payload = (result.structuredContent as { result: { template: string; specplannerWritingPolicy: { version: number; instructions: string } } }).result;
      assert.ok(payload.template);
      assert.equal(payload.specplannerWritingPolicy.version, 2);
      assert.match(payload.specplannerWritingPolicy.instructions, /Completeness takes precedence over brevity/);
    }
  }
  assert.match(await readFile(join(workspace, "openspec/changes/sample-plan/.openspec.yaml"), "utf8"), /spec-driven/);
  await writeFile(join(workspace, "openspec/changes/sample-plan/proposal.md"), "# Sample proposal\n");
  await mkdir(join(workspace, "openspec/specs/existing"), { recursive: true });
  await writeFile(join(workspace, "openspec/specs/existing/spec.md"), "# Existing requirements\n");
  const info = await client.callTool({ name: "list_project_documents", arguments: { workspacePath: workspace, category: "specification" } });
  assert.ok((info.structuredContent as { result: { items: { path: string }[] } }).result.items.some(item => item.path === "specs/existing/spec.md"));
  const existing = await client.callTool({ name: "read_project_document", arguments: { workspacePath: workspace, path: "specs/existing/spec.md" } });
  assert.ok(!existing.isError);
  assert.equal((existing.structuredContent as { result: { content: string } }).result.content, "# Existing requirements\n");
  const documentArgs = { id: "sample-plan", path: "proposal.md" };
  const readDocument = await client.callTool({ name: "read_document", arguments: documentArgs });
  assert.ok(!readDocument.isError);
  const document = (readDocument.structuredContent as { result: { revision: string; identity: string } }).result;
  const comment = await client.callTool({ name: "add_comment", arguments: { ...documentArgs, expectedIdentity: document.identity, revision: document.revision, start: 2, end: 8, text: "Clarify this section." } });
  assert.ok(!comment.isError);
  const edit = await client.callTool({ name: "save_document", arguments: { ...documentArgs, expectedIdentity: document.identity, expectedRevision: document.revision, content: "# Updated proposal\n" } });
  assert.ok(!edit.isError);
  const stale = await client.callTool({ name: "save_document", arguments: { ...documentArgs, expectedIdentity: document.identity, expectedRevision: document.revision, content: "Stale edit" } });
  assert.equal(stale.isError, true);
  assert.equal((edit.structuredContent as { result: { comments: unknown[] } }).result.comments.length, 1);
  await writeFile(join(workspace, "openspec/changes/sample-plan/tasks.md"), "- [x] Verify isolated package behavior\n");
  await writeFile(join(workspace, "openspec/changes/sample-plan/verification.md"), "Packaged MCP round trip passed.\n");
  await mkdir(join(workspace, "openspec/changes/sample-plan/specs/package-startup"), { recursive: true });
  await writeFile(join(workspace, "openspec/changes/sample-plan/specs/package-startup/spec.md"), "## ADDED Requirements\n\n### Requirement: Portable startup\nThe plugin SHALL start from a directory containing spaces.\n\n#### Scenario: Isolated startup\n- **WHEN** the package is installed in a directory containing spaces\n- **THEN** tool discovery succeeds\n");
  const preview = await client.callTool({ name: "archive_change", arguments: { workspacePath: workspace, action: "preview", id: "sample-plan", dependsOn: [] } });
  assert.ok(!preview.isError, JSON.stringify(preview));
  const planned = (preview.structuredContent as { result: { token: string; blockers: { total: number }; destination: string } }).result;
  assert.equal(planned.blockers.total, 0, JSON.stringify(preview));
  const applyArgs = { workspacePath: workspace, action: "apply", token: planned.token, verification: { summary: "Reviewed saved isolated package verification.", evidencePaths: ["verification.md"] }, dependenciesReviewed: true, specDiffsReviewed: true };
  const archived = await client.callTool({ name: "archive_change", arguments: applyArgs });
  assert.ok(!archived.isError, JSON.stringify(archived));
  assert.equal((archived.structuredContent as { result: { outcome: string } }).result.outcome, "archived");
  assert.match(await readFile(join(workspace, "openspec/specs/package-startup/spec.md"), "utf8"), /Portable startup/);
  assert.match(await readFile(join(workspace, planned.destination, ".openspec.yaml"), "utf8"), /spec-driven/);
  assert.equal(await readFile(join(workspace, planned.destination, "verification.md"), "utf8"), "Packaged MCP round trip passed.\n");
  const repeatedArchive = await client.callTool({ name: "archive_change", arguments: applyArgs });
  assert.ok(!repeatedArchive.isError);
  assert.equal((repeatedArchive.structuredContent as { result: { outcome: string } }).result.outcome, "archived");
  const archivedReview = await client.callTool({ name: "read_document", arguments: { workspacePath: workspace, ...documentArgs, archiveName: planned.destination.split("/").at(-1) } });
  assert.equal((archivedReview.structuredContent as { result: { comments: unknown[] } }).result.comments.length, 1);
  const resource = await client.readResource({ uri: (tools.find(tool => tool.name === "open_planner")!._meta as { ui: { resourceUri: string } }).ui.resourceUri });
  assert.ok("text" in resource.contents[0]);
  const html = resource.contents[0].text;
  assert.match(html, /lang="en"/);
  assert.match(html, /SpecPlanner/);
  assert.ok(!/<script[^>]+src=/.test(html.split("<script>")[0]), "UI must not depend on separate script assets");
  console.log("PASS: isolated installation, stdio handshake, tool discovery, tool call, board save/read/conflict handling, official OpenSpec creation/instructions/validation, document editing/comment retention/conflict rejection, proposal review/apply/history, compact inventories, official archive preview/sync/apply/retry, retained archived reviews, and bundled English UI resource.");
  await verifyOrcaPackage(installed, workspace, join(temporary, "board-data"), client);
  console.log("Host installation, native rendering and chat delivery are verified separately; these tests use stdio and an Orca host stand-in.");
} finally {
  await client.close();
  await rm(temporary, { recursive: true, force: true });
}
