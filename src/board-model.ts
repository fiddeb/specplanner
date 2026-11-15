import { z } from "zod";

export const sceneSchema = z.object({
  elements: z.array(z.object({
    id: z.string().min(1).max(200),
    type: z.enum(["rectangle", "diamond", "ellipse", "text", "line", "arrow", "freedraw", "frame"]),
    x: z.number().finite(), y: z.number().finite(),
    width: z.number().finite(), height: z.number().finite(),
  }).passthrough()).max(2000),
}).refine(value => new Set(value.elements.map(element => element.id)).size === value.elements.length, "Element IDs must be unique.").refine(value => JSON.stringify(value).length <= 2_000_000, "The board exceeds the 2 MB limit.");
export const boardSchema = z.object({ revision: z.number().int().nonnegative(), scene: sceneSchema });
export type Scene = z.infer<typeof sceneSchema>;
export type Board = z.infer<typeof boardSchema>;
export const emptyBoard = (): Board => ({ revision: 0, scene: { elements: [] } });

export const proposalSchema = z.object({
  id: z.string().uuid(), baseRevision: z.number().int().nonnegative(),
  summary: z.string().min(1).max(4000), scene: sceneSchema,
});
export type BoardProposal = z.infer<typeof proposalSchema>;
export const proposalSummarySchema = proposalSchema.omit({ scene: true }).extend({ elementCount: z.number().int().nonnegative() });
export type ProposalSummary = z.infer<typeof proposalSummarySchema>;
export function proposalSummary({ id, baseRevision, summary, scene }: BoardProposal): ProposalSummary {
  return { id, baseRevision, summary, elementCount: scene.elements.length };
}
