// Narrow structural contracts for Orca's documented host API. No Orca runtime dependency.
export type OrcaWorkspace = { id: string; path: string; hostId: string | null };
export interface OrcaHost {
  call(name: "workspace.readContext", input: Record<string, never>): Promise<{ workspaceId?: string } | null>;
  call(name: "workspace.list", input: Record<string, never>): Promise<{ workspaces: OrcaWorkspace[]; truncated: boolean }>;
}
export type OrcaRequestContext = { panel: { id: string }; signal: AbortSignal };
export interface OrcaWorker {
  host: OrcaHost;
  storage: OrcaStorage;
  panels: { handle(name: string, handler: (input: unknown, context: OrcaRequestContext) => Promise<unknown>): { dispose(): void } };
}
export interface OrcaStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: { session: string; workspacePath: string | null; workspaceId: string | null }): Promise<unknown>;
}
export interface OrcaFrame {
  plugin: { request(name: string, input?: unknown, options?: { timeoutMs?: number }): Promise<unknown> };
  on(name: "theme", handler: (theme: { colorScheme: "light" | "dark" }) => void): { dispose(): void };
}
export type OrcaBinding = { session: string; workspacePath: string | null };
export const uploadChunkSize = 8192;
export const downloadChunkSize = 32_768;
export const transferLimit = 4_100_000;
