// Disposable browser harness with the real MCP server and official CLI. No production project is opened.
import { build } from "esbuild";
import { createServer as httpServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { delta } from "../test/closeout-fixture.js";

const directory = await mkdtemp(join(tmpdir(), "specplanner-closeout-preview-"));
const workspacePath = join(directory, "repository");
process.env.SPECPLANNER_DATA_DIR = join(directory, "private-data");
await mkdir(join(workspacePath, ".git"), { recursive: true });
const put = async (path: string, content: string) => { await mkdir(join(workspacePath, "openspec", path, ".."), { recursive: true }); await writeFile(join(workspacePath, "openspec", path), content); };
await put("changes/delivery/.openspec.yaml", "schema: spec-driven\ncreated: 2026-10-01\n");
await put("changes/delivery/proposal.md", "# Reliable delivery\n\nThe worker **MUST** retain every accepted input.\n\n## Dependencies\nNo preceding changes are required.\n");
await put("changes/delivery/design.md", "# Design\nPersist input before acknowledgement.\n");
await put("changes/delivery/tasks.md", "- [x] Implement reliable delivery\n- [x] Verify worker failures\n");
await put("changes/delivery/verification.md", "# Verification\nDisposable preview fixture only: the worker-failure checks passed.\n");
await put("changes/delivery/specs/delivery/spec.md", delta);
await put("README.md", "# Preview workspace\nThis disposable project can be safely archived during visual checks.\n");
for (let i = 0; i < 24; i++) await put(`changes/delivery/notes/note-${String(i).padStart(2, "0")}.md`, `# Note ${i}\nOriginal planning rationale ${i}.\n`);
const server = createServer("<html></html>");
const client = new Client({ name: "closeout-preview", version: "1" });
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st); await client.connect(ct);
await build({ stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { Plan } from "./src/plan.tsx";
import "./src/panel.css";
const app = {sendMessage:async()=>({isError:true}),callServerTool: async params => {
  const response = await fetch("/tool", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(params)});
  if(!response.ok) throw new Error(await response.text());
  return await response.json();
}};
createRoot(document.getElementById("root")).render(<main className="planner"><header>SpecPlanner · Disposable MCP closeout preview</header><div className="plan-view"><Plan app={app}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, outfile: join(directory, "preview.js"), bundle: true, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' } });
const js = await readFile(join(directory, "preview.js")); const css = await readFile(join(directory, "preview.css"));
const http = httpServer(async (request, response) => {
  try {
    if (request.url === "/tool" && request.method === "POST") {
      if (request.headers["content-type"] !== "application/json" || request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) { response.writeHead(403); response.end(); return; }
      let body = "";
      for await (const chunk of request) { body += chunk; if (body.length > 1_000_000) throw new Error("Preview request too large"); }
      const input = JSON.parse(body);
      // Leave enough time for the browser test to verify that edits/navigation lock during apply.
      if (input.name === "archive_change" && input.arguments?.action === "apply") await new Promise(resolve => setTimeout(resolve, 2000));
      const result = await client.callTool({ name: input.name, arguments: { ...input.arguments, workspacePath } });
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(result)); return;
    }
    if (request.url === "/preview.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); return; }
    if (request.url === "/preview.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html lang="en" data-embedded="true"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpecPlanner closeout preview</title><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/preview.js"></script></html>');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
http.listen(0, "127.0.0.1", () => console.log(`Closeout preview: http://127.0.0.1:${(http.address() as { port: number }).port} (pid ${process.pid})`));
const stop = () => { http.close(); void client.close().then(() => server.close()).finally(() => rm(directory, { recursive: true, force: true })).finally(() => process.exit()); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
