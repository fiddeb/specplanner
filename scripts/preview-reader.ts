// Disposable in-memory MCP fixture for visual checks. Does not access repository documents.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "specplanner-reader-preview-"));
const sample = `# Reliable task execution

## Requirement: preserve failed tasks

The controller **MUST** keep the task record and its original input when execution fails. A retry must use the same task identifier.

### Scenario: the worker stops unexpectedly

- **Given** an accepted task with an assigned worker.
- **When** the worker stops before storing its result.
- **Then** the controller marks the attempt as failed and retains the input for review.

| Setting | Required behavior |
| --- | --- |
| Retry limit | At most 3 attempts |
| Timeout | 30 seconds per attempt |
| Final failure | Retain the record and notify the owner |

## Implementation tasks

- [x] Store the original task input.
- [ ] Verify retries with simultaneous worker failures.

### Open question

Who may request a retry after the automatic limit is reached? This decision blocks the authorization implementation.

\`\`\`typescript
const result = await retryTask({ taskId, expectedRevision });
\`\`\`
`;
await build({ stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { Plan } from "./src/plan.tsx";
import "./src/panel.css";
const content = ${JSON.stringify(sample)};
const app = { sendMessage: async()=>({}), callServerTool: async ({name, arguments:args}) => {
  let data;
  if(name === "workspace_info") data = {configured:true,name:"Reader preview",changes:["reliable-task-execution"],documents:[{path:"README.md",category:"project"}]};
  if(name === "read_change") data = {result:{id:args.id,documents:[{path:"proposal.md",content},{path:"tasks.md",content:"# Tasks\\n\\n- [ ] Confirm retry permissions"}]}};
  if(name === "read_project_document") data = {result:{path:args.path,content}};
  if(name === "read_document") data = {result:{path:args.path,content:args.path === "tasks.md" ? "# Tasks\\n\\n- [ ] Confirm retry permissions" : content,revision:"fixture",comments:[]}};
  if(name === "save_document") data = {result:{path:args.path,content:args.content,revision:"fixture-saved",comments:[]}};
  return {content:[],structuredContent:data};
}};
createRoot(document.getElementById("root")).render(<main className="planner"><header><span className="eyebrow">SPECPLANNER · READER PREVIEW</span></header><nav><button>Plan</button><button>Board</button></nav><div className="plan-view"><Plan app={app}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, outfile: join(directory, "preview.js"), bundle: true, format: "iife", platform: "browser", define: { "process.env.NODE_ENV": '"production"' } });
const js = await readFile(join(directory, "preview.js"));
const css = await readFile(join(directory, "preview.css"));
const server = createServer((request, response) => {
  if (request.url === "/preview.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); return; }
  if (request.url === "/preview.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
  response.setHeader("Content-Type", "text/html");
  if (request.url === "/narrow") { response.end('<html><body style="margin:0;background:#303030"><iframe title="Narrow reader" src="/" style="width:390px;height:740px;border:0"></iframe></body></html>'); return; }
  response.end('<!doctype html><html lang="en" data-embedded="true" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpecPlanner reader test</title><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/preview.js"></script></html>');
});
server.listen(0, "127.0.0.1", () => console.log(`Reader preview: http://127.0.0.1:${(server.address() as {port:number}).port}`));
