import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { connectOrca, orcaClient } from "../src/orca-client.js";
import { boardSchema } from "../src/board-model.js";
import type { OrcaFrame, OrcaHost, OrcaRequestContext, OrcaWorker } from "../src/orca-contract.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

/** Tests shipped worker bytes against a host stand-in, separately from actual Orca verification. */
export async function verifyOrcaPackage(installed: string, workspace: string, data: string, mcp: Client) {
  const manifest = JSON.parse(await readFile(join(installed, "orca-plugin.json"), "utf8"));
  const nativeHtml = await readFile(join(installed, manifest.contributes.panels[0].entry), "utf8");
  assert.match(nativeHtml, /src="\.\/orca-panel\.js"/);
  const nativeScript = await readFile(join(installed, "dist/orca-panel.js"), "utf8");
  const registry: { __specplannerFontAssets?: Record<string, string> } = {};
  const fontScripts = [...nativeHtml.matchAll(/src="\.\/(orca-fonts\/\d+\.js)"/g)];
  assert.ok(fontScripts.length > 0);
  for (const script of fontScripts) {
    const source = await readFile(join(installed, "dist", script[1]), "utf8");
    assert.ok(Buffer.byteLength(source) < 16 * 1024 * 1024);
    runInNewContext(source, registry, { timeout: 1000 });
  }
  const fonts = registry.__specplannerFontAssets;
  assert.ok(fonts, "The packaged font scripts must initialize the asset registry");
  const references = [...nativeScript.matchAll(/globalThis\.__specplannerFontAssets\["([^\"]+)"\]/g)];
  assert.ok(references.length > 0, "The panel must reference its bundled fonts");
  assert.deepEqual(Object.keys(fonts).sort(), [...new Set(references.map(match => match[1]))].sort(), "Bundle exactly the fonts referenced by the panel");
  for (const [, path] of references) {
    assert.match(fonts[path], /^data:font\/woff2;base64,/);
    assert.equal(Buffer.from(fonts[path].split(",")[1], "base64").subarray(0, 4).toString("ascii"), "wOF2");
  }
  const worker = await import(pathToFileURL(join(installed, manifest.main)).href) as { default: (orca: OrcaWorker) => Promise<void>; deactivate: () => Promise<void> };
  const previous = process.env.SPECPLANNER_DATA_DIR;
  process.env.SPECPLANNER_DATA_DIR = data;
  const handlers = new Map<string, (input: unknown, context: OrcaRequestContext) => Promise<unknown>>();
  const storage = new Map<string, unknown>();
  const frame: OrcaFrame = { plugin: { request: (name, input) => handlers.get(name)!(input, { panel: { id: "package-verification" }, signal: new AbortController().signal }) }, on: () => ({ dispose() {} }) };
  try {
    await worker.default({
      host: { call: (async (name: string) => name === "workspace.readContext" ? { workspaceId: "package" } : { workspaces: [{ id: "package", path: workspace, hostId: "local" }], truncated: false }) as OrcaHost["call"] },
      storage: { async get(key) { return storage.get(key); }, async set(key, value) { storage.set(key, value); } },
      panels: { handle(name, handler) { handlers.set(name, handler); return { dispose() { handlers.delete(name); } }; } },
    });
    const app = orcaClient(frame, await connectOrca(frame));
    const before = boardSchema.parse((await mcp.callTool({ name: "read_board", arguments: { workspacePath: workspace } })).structuredContent);
    assert.deepEqual(boardSchema.parse((await app.callServerTool({ name: "read_board" })).structuredContent), before);
    const saved = await app.callServerTool({ name: "save_board", arguments: { expectedRevision: before.revision, scene: before.scene } });
    assert.ok(!saved.isError, JSON.stringify(saved));
    const after = boardSchema.parse((await mcp.callTool({ name: "read_board", arguments: { workspacePath: workspace } })).structuredContent);
    assert.equal(after.revision, before.revision + 1);
    assert.equal((await mcp.callTool({ name: "save_board", arguments: { workspacePath: workspace, expectedRevision: before.revision, scene: before.scene } })).isError, true);
    const created = await app.callServerTool({ name: "create_change", arguments: { id: "orca-package-check" } });
    assert.ok(!created.isError, JSON.stringify(created));
    const listed = await mcp.callTool({ name: "list_changes", arguments: { workspacePath: workspace } });
    assert.match(JSON.stringify(listed.structuredContent), /orca-package-check/);
    console.log("PASS: shipped Orca worker, official OpenSpec runtime, shared MCP/Orca board storage and cross-host stale-write rejection (host stand-in).");
  } finally {
    await worker.deactivate();
    if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous;
  }
}
