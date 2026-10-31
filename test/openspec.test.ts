import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenSpecWorkspace, changeId } from "../src/openspec.js";

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
    assert.ok(instructions.specplannerWritingPolicy.instructions.includes("Completeness takes precedence over brevity"));
    assert.ok("template" in instructions, "Official OpenSpec template remains available");
    const validation = await workspace.validate("test-plan");
    assert.ok(validation);
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
