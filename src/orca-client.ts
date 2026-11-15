import { z } from "zod";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PanelClient } from "./panel-client.js";
import { downloadChunkSize, transferLimit, uploadChunkSize, type OrcaBinding, type OrcaFrame } from "./orca-contract.js";

export async function connectOrca(frame: OrcaFrame, personal = false): Promise<OrcaBinding> {
  return z.object({ session: z.string().uuid(), workspacePath: z.string().nullable() }).parse(await frame.plugin.request("planner.connect", { personal }));
}
export function orcaClient(frame: OrcaFrame, binding: OrcaBinding): PanelClient {
  return {
    messageDelivery: "copy",
    async callServerTool(params) {
      const payload = JSON.stringify({ name: params.name, arguments: params.arguments });
      if (payload.length > transferLimit) throw new Error("The request exceeds the native panel transfer limit.");
      const { id } = z.object({ id: z.string().uuid() }).parse(await frame.plugin.request("planner.begin", { session: binding.session, length: payload.length }));
      try {
        for (let offset = 0; offset < payload.length; offset += uploadChunkSize) {
          await frame.plugin.request("planner.append", { id, offset, text: payload.slice(offset, offset + uploadChunkSize) });
        }
        const { length } = z.object({ length: z.number().int().min(1).max(transferLimit) }).parse(await frame.plugin.request("planner.execute", { id }, { timeoutMs: 60_000 }));
        let response = "";
        while (response.length < length) {
          const { text } = z.object({ text: z.string().min(1).max(downloadChunkSize) }).parse(await frame.plugin.request("planner.read", { id, offset: response.length }));
          response += text;
          if (response.length > length) throw new Error("Invalid native panel response length.");
        }
        return CallToolResultSchema.parse(JSON.parse(response));
      } finally {
        // Cleanup failures must not turn a successfully saved revision into an apparent failure.
        await frame.plugin.request("planner.release", { id }).catch(() => {});
      }
    },
    async sendMessage() { return { isError: true }; },
  };
}
