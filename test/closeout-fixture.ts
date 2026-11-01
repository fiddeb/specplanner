import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenSpecWorkspace } from "../src/openspec.js";
import { ArchiveService } from "../src/archive.js";

export const delta = "## ADDED Requirements\n\n### Requirement: Durable input\nThe system SHALL retain accepted input until its result is stored.\n\n#### Scenario: Worker stops\n- **WHEN** the worker stops before storing a result\n- **THEN** retain the original input\n";
export async function fixture(run: (context: { root: string; data: string; workspace: OpenSpecWorkspace; archive: ArchiveService; put: (path: string, content: string | Buffer) => Promise<void>; change: (id: string, specs?: string | null) => Promise<void> }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "specplanner-closeout-"));
  const root = join(directory, "repository"), data = join(directory, "data");
  await mkdir(join(root, ".git"), { recursive: true });
  const workspace = new OpenSpecWorkspace(root);
  const put = async (path: string, content: string | Buffer) => { await mkdir(join(root, "openspec", path, ".."), { recursive: true }); await writeFile(join(root, "openspec", path), content); };
  const change = async (id: string, specs: string | null = delta) => {
    await put(`changes/${id}/.openspec.yaml`, "schema: spec-driven\ncreated: 2026-10-01\n");
    await put(`changes/${id}/proposal.md`, "## Why\nPrevent lost tasks.\n\n## What Changes\nRetain inputs.\n\n## Capabilities\n### New Capabilities\n- delivery: Durable input\n\n## Impact\nTask execution.\n");
    await put(`changes/${id}/design.md`, "# Design\nStore input before acknowledgement.\n");
    await put(`changes/${id}/tasks.md`, "## 1. Implementation\n- [x] 1.1 Implement input storage\n- [x] 1.2 Verify retry behavior\n");
    await put(`changes/${id}/verification.md`, "# Verification\nInput persistence and worker-failure tests passed in an isolated environment.\n");
    if (specs !== null) await put(`changes/${id}/specs/delivery/spec.md`, specs);
  };
  try { await run({ root, data, workspace, archive: new ArchiveService(workspace, data), put, change }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
export const confirmation = { verification: { summary: "Reviewed the implementation and saved worker-failure test results.", evidencePaths: ["verification.md"] }, dependenciesReviewed: true, specDiffsReviewed: true };
