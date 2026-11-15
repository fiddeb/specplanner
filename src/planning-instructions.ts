import { digest } from "./context.js";
import type { OpenSpecWorkspace } from "./openspec.js";
import { writingPolicy } from "./writing-policy.js";

export type PlanningInput = {
  id?: string; artifact?: "proposal" | "design" | "specs" | "tasks" | "apply" | "archive";
  knownRevision?: string; knownWritingPolicyRevision?: string; knownContextRevision?: string;
};
type PlanningResult = { revision: string; unchanged: true } | (Record<string, unknown> & {
  revision: string; unchanged: false; contextRevision?: string; contextUnchanged: boolean; writingPolicyRevision: string;
  specplannerWritingPolicy: (typeof writingPolicy & { revision: string; unchanged?: false }) | { version: number; revision: string; unchanged: true };
});

export async function planningInstructions(workspace: OpenSpecWorkspace | undefined, input: PlanningInput): Promise<PlanningResult> {
  if (!!input.id !== !!input.artifact) throw new Error("Provide both id and artifact, or omit both to read the shared planning policy.");
  if (input.id && !workspace) throw new Error("A repository workspacePath is required for artifact instructions.");
  const identity = workspace ? await workspace.identity() : null;
  const instructions: Record<string, unknown> = input.id && input.artifact ? await workspace!.instructions(input.id, input.artifact) : {};
  const revision = digest(JSON.stringify([identity, input.id, input.artifact, instructions, writingPolicy]));
  if (input.knownRevision === revision) return { revision, unchanged: true };
  const writingPolicyRevision = digest(JSON.stringify(writingPolicy));
  // Only repeated project context is omitted. Artifact rules, templates and dependencies remain exact.
  const contextRevision = typeof instructions.context === "string" ? digest(JSON.stringify([identity, instructions.context])) : undefined;
  const contextUnchanged = contextRevision !== undefined && contextRevision === input.knownContextRevision;
  if (contextUnchanged) delete instructions.context;
  return { ...instructions, revision, unchanged: false, contextRevision, contextUnchanged, writingPolicyRevision,
    specplannerWritingPolicy: input.knownWritingPolicyRevision === writingPolicyRevision
      ? { version: writingPolicy.version, unchanged: true, revision: writingPolicyRevision }
      : { ...writingPolicy, revision: writingPolicyRevision } };
}
