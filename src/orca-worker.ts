import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { version } from "./version.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";
import { OrcaBridge } from "./orca-bridge.js";
import type { OrcaWorker } from "./orca-contract.js";

let close: (() => Promise<void>) | undefined;
export default async function activate(orca: OrcaWorker) {
  const server = createServer("");
  const client = new Client({ name: "specplanner-orca", version });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const bridge = new OrcaBridge(orca.host, (name, args) => client.callTool({ name, arguments: args }), orca.storage);
  const handles = ["connect", "begin", "append", "execute", "read", "release"].map(action => {
    const name = `planner.${action}`;
    return orca.panels.handle(name, (input, context) => bridge.request(name, input, context));
  });
  const cleanup = setInterval(() => bridge.sweep(), 30_000);
  cleanup.unref();
  close = async () => { clearInterval(cleanup); handles.forEach(handle => handle.dispose()); await client.close(); await server.close(); };
}
export async function deactivate() { await close?.(); close = undefined; }
