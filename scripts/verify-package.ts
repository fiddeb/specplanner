import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "specplanner install "));
const existingInstallation = process.env.SPECPLANNER_VERIFY_INSTALL;
const installed = existingInstallation ?? join(temporary, "plugin with spaces");
const client = new Client({ name: "specplanner-install-test", version: "1.0.0" });
try {
  if (!existingInstallation) await cp(new URL(`releases/specplanner-${manifest.version}/`, root), installed, { recursive: true });
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
  assert.equal((proposals.structuredContent as { result: unknown[] }).result.length, 1);
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
      assert.equal(payload.specplannerWritingPolicy.version, 1);
      assert.match(payload.specplannerWritingPolicy.instructions, /Completeness takes precedence over brevity/);
    }
  }
  assert.match(await readFile(join(workspace, "openspec/changes/sample-plan/.openspec.yaml"), "utf8"), /spec-driven/);
  await writeFile(join(workspace, "openspec/changes/sample-plan/proposal.md"), "# Sample proposal\n");
  await mkdir(join(workspace, "openspec/specs/existing"), { recursive: true });
  await writeFile(join(workspace, "openspec/specs/existing/spec.md"), "# Existing requirements\n");
  const info = await client.callTool({ name: "workspace_info", arguments: { workspacePath: workspace } });
  assert.ok((info.structuredContent as { documents: { path: string }[] }).documents.some(item => item.path === "specs/existing/spec.md"));
  const existing = await client.callTool({ name: "read_project_document", arguments: { workspacePath: workspace, path: "specs/existing/spec.md" } });
  assert.ok(!existing.isError);
  assert.equal((existing.structuredContent as { result: { content: string } }).result.content, "# Existing requirements\n");
  const documentArgs = { id: "sample-plan", path: "proposal.md" };
  const readDocument = await client.callTool({ name: "read_document", arguments: documentArgs });
  assert.ok(!readDocument.isError);
  const document = (readDocument.structuredContent as { result: { revision: string } }).result;
  const comment = await client.callTool({ name: "add_comment", arguments: { ...documentArgs, revision: document.revision, start: 2, end: 8, text: "Clarify this section." } });
  assert.ok(!comment.isError);
  const edit = await client.callTool({ name: "save_document", arguments: { ...documentArgs, expectedRevision: document.revision, content: "# Updated proposal\n" } });
  assert.ok(!edit.isError);
  const stale = await client.callTool({ name: "save_document", arguments: { ...documentArgs, expectedRevision: document.revision, content: "Stale edit" } });
  assert.equal(stale.isError, true);
  assert.equal((edit.structuredContent as { result: { comments: unknown[] } }).result.comments.length, 1);
  const resource = await client.readResource({ uri: (tools.find(tool => tool.name === "open_planner")!._meta as { ui: { resourceUri: string } }).ui.resourceUri });
  assert.ok("text" in resource.contents[0]);
  const html = resource.contents[0].text;
  assert.match(html, /lang="en"/);
  assert.match(html, /SpecPlanner/);
  assert.ok(!/<script[^>]+src=/.test(html.split("<script>")[0]), "UI must not depend on separate script assets");
  console.log("PASS: isolated installation, stdio handshake, tool discovery, tool call, board save/read/conflict handling, official OpenSpec creation/instructions/validation, document editing/comment retention/conflict rejection, proposal review/apply/history, and bundled English UI resource.");
  console.log("Desktop installation and native panel rendering still require verification in the host app.");
} finally {
  await client.close();
  await rm(temporary, { recursive: true, force: true });
}
