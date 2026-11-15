import { z } from "zod";

export const workspaceBindingSchema = z.strictObject({ workspacePath: z.string().min(1).nullable() });
export const workspaceConnectionSchema = z.discriminatedUnion("connected", [
  z.strictObject({ connected: z.literal(false) }),
  workspaceBindingSchema.extend({ connected: z.literal(true) }),
]);
export type WorkspaceConnection = z.infer<typeof workspaceConnectionSchema>;
