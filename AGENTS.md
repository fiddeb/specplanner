# SpecPlanner development

Read README.md before changing the architecture. Keep all application code in TypeScript.
Use official Excalidraw and OpenSpec packages with pinned versions. SpecPlanner delegates model work to the host agent; do not embed a model runtime or manage model credentials in the plugin. Codex is the currently implemented host-agent integration. This describes SpecPlanner's implementation, not an executor restriction for consumer projects.
Keep subscription access separate from agent choice. Follow the owner's model-access preference in openspec/config.yaml; do not silently switch providers or introduce separate API billing. A different host-agent integration requires its own implementation and verification before being described as supported.
Keep authorization, project boundaries, revision checks, and implementation handoff outside prompts.
Do not commit credentials or local planning sessions.
Run `npm run check`, `npm test`, and `npm run build` for code changes.
Report host integration separately from local protocol/build tests.

## Error prevention and verification

- First consider whether simpler code, stronger types, fewer states, or shared boundary validation can eliminate the failure risk. Keep authorization, workspace and revision checks in the shared implementation used by every entrypoint.
- Inspect existing verification before adding tests. Extend a related case when it exercises the same behavior; keep cases separate when they need independent setup or failure diagnosis.
- Test observable behavior and concrete failure risks. Avoid assertions that mirror the implementation or lock internal calls, incidental ordering or counts. A clear test name can explain the purpose without an additional comment.
- Let type checking, lint and builds enforce the rules they cover. Remove overlapping tests only after confirming that the replacement runs and checks the same files or generated artifacts. Source checks do not necessarily cover JavaScript stored in strings or generated at runtime.
- Preserve automated protection against authorization failures, data loss, retry errors, concurrency faults and previously fixed bugs. Exercise detailed behavior in the owning layer and retain integration checks for wiring, transport and packaging.
- Do not require a new test for every task. Choose acceptance checks according to the change and its risks: existing tests, static checks, a build, or a documented manual check with steps and observed results. A passing build alone does not establish runtime behavior. Run the required project checks above for code changes.

## Code comments

- Prefer clear names and structure over comments that narrate ordinary code. Keep explanations of rationale, external constraints, tradeoffs, safety boundaries, concurrency and contracts or invariants that types cannot express.
- Update or remove stale comments and unused lint suppressions when touching the relevant code. Explain necessary suppressions and enable unused-suppression reporting when a linter supports it.
- Require useful information, not quotas or separate justifications for every test and comment. Preserve comments that prevent a plausible maintenance error.

## Language

Write all project content in English: UI copy, accessibility labels, design documents, OpenSpec artifacts, diagram labels, generated review summaries, code comments, documentation, commit messages, and release notes. Swedish user feedback must be understood and incorporated into English output. Preserve the user's original comments as authored when storing review history; write interpretations and resulting changes in English.

## Planning prose

Apply the writing policy in `src/writing-policy.ts` when drafting or revising planning artifacts. It is based on [Unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md), with completeness taking precedence over brevity. Remove verbal padding, never implementation-relevant information. Assume the implementer cannot see the conversation. Keep requirements, exceptions, exact contracts, rationale, and acceptance criteria explicit. Mark missing decisions as open questions instead of guessing or hiding them behind abstractions. Preserve OpenSpec syntax and requirement strength. Compare revisions against the source requirements before claiming they preserve meaning.

Keep the consumer workflow in `skills/specplanner/SKILL.md` and the record boundaries in `docs/planning-contract.md` consistent with that policy. Accepted decisions and reasons belong in repository artifacts. Tasks must identify their requirements, consequential decisions and acceptance checks; chat or private review history must not be the only record.

## Workspace routing

Pass the current chat's project directory explicitly as `workspacePath` on SpecPlanner tool calls. Do not infer it from the server process working directory or let one chat mutate a server-wide workspace. Use trusted project context or a user's explicit selection. Preserve personal storage when no repository is selected.
