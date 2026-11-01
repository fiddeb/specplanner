import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { OpenSpecWorkspace } from "./openspec.js";

// Document saves, comment publication and archive share one cross-process lock.
export async function acquireWorkspaceWrite(workspace: OpenSpecWorkspace) {
  const lock = join(await workspace.checkTree(), "openspec/.specplanner-write-lock");
  try { await mkdir(lock); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Another SpecPlanner write is in progress. Retry after it finishes; never remove an active lock."); throw error; }
  return async () => { await rm(lock, { recursive: true }); };
}
