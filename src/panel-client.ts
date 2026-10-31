import type { App } from "@modelcontextprotocol/ext-apps";
export type PanelClient = Pick<App, "callServerTool" | "sendMessage">;
export function bindWorkspace(app: PanelClient, workspacePath: string | null): PanelClient {
  return {
    callServerTool: (params, options) => app.callServerTool({ ...params, arguments: { ...params.arguments, workspacePath } }, options),
    sendMessage: (params, options) => app.sendMessage(params, options),
  };
}
