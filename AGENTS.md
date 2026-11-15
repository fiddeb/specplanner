# SpecPlanner development

Read README.md before changing the architecture. Keep all application code in TypeScript.
Use official Excalidraw and OpenSpec packages with pinned versions. SpecPlanner delegates model work to the host agent; do not embed a model runtime or manage model credentials in the plugin. Codex is the currently implemented host-agent integration. This describes SpecPlanner's implementation, not an executor restriction for consumer projects.
Keep subscription access separate from agent choice. Follow the owner's model-access preference in openspec/config.yaml; do not silently switch providers or introduce separate API billing. A different host-agent integration requires its own implementation and verification before being described as supported.
Keep authorization, project boundaries, revision checks, and implementation handoff outside prompts.
Do not commit credentials or local planning sessions.
Run `npm run check`, `npm test`, and `npm run build` for code changes.
Report host integration separately from local protocol/build tests.

## Language

Write all project content in English: UI copy, accessibility labels, design documents, OpenSpec artifacts, diagram labels, generated review summaries, code comments, documentation, commit messages, and release notes. Swedish user feedback must be understood and incorporated into English output. Preserve the user's original comments as authored when storing review history; write interpretations and resulting changes in English.

## Planning prose

Apply the writing policy in `src/writing-policy.ts` when drafting or revising planning artifacts. It is based on [Unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md), with completeness taking precedence over brevity. Remove verbal padding, never implementation-relevant information. Assume the implementer cannot see the conversation. Keep requirements, exceptions, exact contracts, rationale, and acceptance criteria explicit. Mark missing decisions as open questions instead of guessing or hiding them behind abstractions. Preserve OpenSpec syntax and requirement strength. Compare revisions against the source requirements before claiming they preserve meaning.

Keep the consumer workflow in `skills/specplanner/SKILL.md` and the record boundaries in `docs/planning-contract.md` consistent with that policy. Accepted decisions and reasons belong in repository artifacts. Tasks must identify their requirements, consequential decisions and acceptance checks; chat or private review history must not be the only record.

## Workspace routing

Pass the current chat's project directory explicitly as `workspacePath` on SpecPlanner tool calls. Do not infer it from the server process working directory or let one chat mutate a server-wide workspace. Use trusted project context or a user's explicit selection. Preserve personal storage when no repository is selected.
