import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenSpecWorkspace } from "../src/openspec.js";

test("existing OpenSpec project exposes guidance, baseline specs and archives without initialization", async () => {
  const root = await mkdtemp(join(tmpdir(), "specplanner-existing-"));
  try {
    await mkdir(join(root, ".git"));
    const files = {
      "README.md": "# Existing project\n",
      "config.yaml": "schema: spec-driven\n",
      "specs/security/spec.md": "# Existing security requirements\n",
      "changes/archive/2026-10-01-release/proposal.md": "# Archived proposal\n",
      "changes/active-plan/proposal.md": "# Active proposal without metadata\n",
    };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, "openspec", path, ".."), { recursive: true });
      await writeFile(join(root, "openspec", path), content);
    }
    const workspace = new OpenSpecWorkspace(root);
    const before = await readdir(join(root, "openspec"), { recursive: true });
    const index = await workspace.projectIndex();
    assert.equal(index.length, 4);
    assert.equal(index.find(item => item.path === "specs/security/spec.md")?.category, "specification");
    assert.equal(index.find(item => item.path.includes("archive"))?.category, "archive");
    for (const item of index) assert.equal((await workspace.readProjectDocument(item.path)).content, files[item.path as keyof typeof files]);
    assert.deepEqual(await workspace.list(), ["active-plan"]);
    assert.equal((await workspace.read("active-plan")).documents.length, 1);
    assert.deepEqual(await readdir(join(root, "openspec"), { recursive: true }), before);
    for (const [path, content] of Object.entries(files)) assert.equal(await readFile(join(root, "openspec", path), "utf8"), content);
    await assert.rejects(workspace.readProjectDocument("../outside.md"));
    await assert.rejects(workspace.readProjectDocument("/etc/passwd"));
    await assert.rejects(workspace.readProjectDocument("changes/active-plan/proposal.md"));
    await symlink(root, join(root, "openspec/specs/outside"));
    await assert.rejects(workspace.projectIndex(), /Symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("baseline-only projects can be read without creating a changes directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "specplanner-baseline-"));
  try {
    await mkdir(join(root, ".git"));
    await mkdir(join(root, "openspec/specs/core"), { recursive: true });
    await writeFile(join(root, "openspec/specs/core/spec.md"), "# Core\n");
    const workspace = new OpenSpecWorkspace(root);
    assert.deepEqual(await workspace.list(), []);
    assert.equal((await workspace.projectIndex()).length, 1);
    assert.equal((await workspace.readProjectDocument("specs/core/spec.md")).content, "# Core\n");
    assert.deepEqual(await readdir(join(root, "openspec")), ["specs"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
