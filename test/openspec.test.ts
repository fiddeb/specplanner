import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenSpecWorkspace, changeId } from "../src/openspec.js";
import { openSpecCommand } from "../src/openspec-command.js";
import { fixture } from "./closeout-fixture.js";
import { taskProgress } from "../src/openspec-tasks.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("official OpenSpec stays in the configured repo and reads generated planning files", async () => {
  const parent = await mkdtemp(join(tmpdir(), "specplanner-workspace-"));
  const root = join(parent, "nested-repo");
  try {
    await mkdir(join(parent, "openspec", "changes"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    const workspace = new OpenSpecWorkspace(root);
    assert.deepEqual(await workspace.list(), []);
    await assert.rejects(workspace.instructions("missing", "proposal"));
    await workspace.create("test-plan");
    assert.deepEqual(await workspace.list(), ["test-plan"]);
    await assert.rejects(readFile(join(parent, "openspec/changes/test-plan/.openspec.yaml")));
    const instructions = await workspace.instructions("test-plan", "proposal");
    assert.ok("template" in instructions, "Official OpenSpec template remains available");
    const validation = await workspace.validate("test-plan") as { items: { id: string; type: string; valid: boolean; issues: { level: string }[] }[]; summary: { totals: { items: number; passed: number; failed: number } } };
    assert.deepEqual(validation.summary.totals, { items: 1, passed: 0, failed: 1 });
    assert.equal(validation.items[0].id, "test-plan");
    assert.equal(validation.items[0].type, "change");
    assert.equal(validation.items[0].valid, false);
    assert.ok(validation.items[0].issues.some(issue => issue.level === "ERROR"), "An empty change must return validation findings");
    await writeFile(join(root, "openspec/changes/test-plan/proposal.md"), "# Proposal\n\nEnglish planning content.\n");
    assert.deepEqual((await workspace.read("test-plan")).documents, [{ path: "proposal.md", content: "# Proposal\n\nEnglish planning content.\n" }]);
    await assert.rejects(workspace.create("test-plan"));
    await symlink(parent, join(root, "openspec", "outside"));
    await assert.rejects(workspace.list(), /Symlinks/);
    await assert.rejects(workspace.create("another-plan"), /Symlinks/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("workspace and change identifiers reject unsafe inputs", () => {
  assert.throws(() => new OpenSpecWorkspace("relative"), /absolute/);
  for (const id of ["../outside", "/tmp/outside", "archive", "two--hyphens", "UPPER", "a/b"]) assert.throws(() => changeId(id));
  assert.equal(changeId("valid-plan"), "valid-plan");
});

test("config-only stores cannot be shadowed by initialization; malformed config also fails without writes", () => fixture(async ({ root, workspace, put }) => {
  for (const config of ["schema: spec-driven\nstore: specplanner-nonexistent-test-store\n", "schema: [broken\n"]) {
    await put("config.yaml", config);
    await assert.rejects(workspace.create("wrong-root"), /store|YAML|parse|declaration/i);
    await assert.rejects(readFile(join(root, "openspec/changes/wrong-root/.openspec.yaml")), { code: "ENOENT" });
    await assert.rejects(readFile(join(root, "openspec/changes")), { code: "ENOENT" });
    assert.equal(await readFile(join(root, "openspec/config.yaml"), "utf8"), config);
  }
}));

test("registered stores require explicit selection; local and config-only roots retain their documented precedence", () => fixture(async ({ root, workspace, put }) => {
  const home = join(root, "test-home"); const store = join(home, "store");
  await mkdir(join(store, ".git"), { recursive: true });
  await mkdir(join(store, "openspec/changes"), { recursive: true });
  await mkdir(join(store, "openspec/specs"), { recursive: true });
  await writeFile(join(store, "openspec/config.yaml"), "schema: spec-driven\n");
  const previous = process.env.HOME; process.env.HOME = home;
  try {
    await openSpecCommand(workspace.cli, root, ["store", "register", store, "--id", "test-store", "--yes", "--json"]);
    await promisify(execFile)(process.execPath, [workspace.cli, "config", "set", "defaultStore", "test-store"], { env: { ...process.env, OPENSPEC_NO_UPDATE_CHECK: "1", OPENSPEC_TELEMETRY: "0" } });
    const unconfigured = join(home, "unconfigured"); await mkdir(join(unconfigured, ".git"), { recursive: true });
    const explicitlySelected = new OpenSpecWorkspace(unconfigured);
    assert.deepEqual(await explicitlySelected.list(), []);
    await explicitlySelected.create("explicit-local");
    assert.deepEqual(await explicitlySelected.list(), ["explicit-local"]);
    assert.deepEqual(await new OpenSpecWorkspace(store).list(), []);
    await put("config.yml", "schema: spec-driven\nstore: test-store\n");
    await assert.rejects(workspace.list(), /external OpenSpec store/);
    await assert.rejects(workspace.create("misrouted"), /external OpenSpec store/);
    assert.deepEqual(await new OpenSpecWorkspace(store).list(), []);
    await assert.rejects(readFile(join(root, "openspec/changes")), { code: "ENOENT" });
    await new OpenSpecWorkspace(store).create("explicit-store");
    assert.deepEqual(await new OpenSpecWorkspace(store).list(), ["explicit-store"]);
    await put("config.yaml", "schema: spec-driven\n");
    await workspace.create("local-config"); // config.yaml takes precedence over config.yml.
    await put("config.yaml", "schema: spec-driven\nstore: test-store\n");
    await workspace.create("local-shape"); // A local planning shape wins over a pointer.
    assert.deepEqual(await workspace.list(), ["local-config", "local-shape"]);
    assert.deepEqual(await new OpenSpecWorkspace(store).list(), ["explicit-store"]);
  } finally { if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous; }
}));

test("public OpenSpec task progress locates custom multi-file tasks and counts blank descriptions", () => fixture(async ({ workspace, put, change }) => {
  await change("multi");
  await put("schemas/multi/schema.yaml", "name: multi\nversion: 1\ndescription: Multiple tracking files\nartifacts:\n  - id: work\n    generates: work/*.md\n    description: Work items\n    template: tasks.md\n    instruction: Describe work\n    requires: []\napply:\n  requires: [work]\n  tracks: work/*.md\n");
  await put("changes/multi/.openspec.yaml", "schema: multi\n");
  await put("changes/multi/work/a.md", "# Work\n\n- [x] Stored input\n- [ ] Keep retries durable\n- [ ]\n");
  await put("changes/multi/work/b.md", "- [X] Preserved original\n  + [~] Verify restart\n");
  const progress = await workspace.taskStatus("multi");
  assert.equal(progress.total, 5); assert.equal(progress.completed, 2); assert.equal(progress.status, "incomplete");
  assert.deepEqual(progress.pending, [{ path: "work/a.md", line: 4, description: "Keep retries durable" }, { path: "work/b.md", line: 2, description: "Verify restart" }]);
}));

test("unavailable or missing task evidence stays unknown and outside task paths are rejected", () => {
  const directory = "/repository/openspec/changes/example";
  assert.equal(taskProgress({ progress: { total: 0, complete: 0 }, tasks: [] }, directory).status, "unknown");
  assert.equal(taskProgress({ progress: { total: 1, complete: 1 }, tasks: [], unavailableTrackingFiles: [{ path: `${directory}/tasks.md`, reason: "EACCES" }] }, directory).status, "unknown");
  assert.throws(() => taskProgress({ progress: { total: 1, complete: 0 }, tasks: [{ description: "Outside", done: false, sourcePath: "/outside/tasks.md", line: 1 }] }, directory), /outside/);
  assert.throws(() => taskProgress({ progress: { total: 1, complete: 1 }, tasks: [{ description: "Outside completed", done: true, sourcePath: "../outside/tasks.md", line: 1 }] }, directory), /outside/);
});
