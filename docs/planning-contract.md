# Planning record and writing contract

SpecPlanner keeps planning artifacts in the selected repository so a later implementer can recover the requirements and reasons without the original conversation. This contract explains the document roles and the implementation choices that support them. The complete agent writing policy is returned by `planning_instructions`, even before a change exists. Its maintained source is `src/writing-policy.ts` in the development repository.

## Authoritative records

| Record | Responsibility |
| --- | --- |
| `openspec/specs/<capability>/spec.md` | Accepted baseline behavior and acceptance scenarios |
| Active change `proposal.md` | Problem, intended outcome, scope and non-goals |
| Active change `specs/<capability>/spec.md` | Proposed additions, changes or removals to the baseline contract |
| Active change `design.md` | Consequential decisions, their reasons, alternatives considered, tradeoffs, superseded decisions and open questions |
| Active change `tasks.md` | Ordered implementation work with exact links to requirements/decisions and verifiable results |
| Change verification files | Observed checks, commands, outcomes, relevant revision/build and limitations |
| `openspec/changes/archive/` | Historical proposals, decisions, tasks and evidence after verified closeout |

An active change is a proposal to change the baseline, not evidence that the behavior already exists. OpenSpec archive applies reviewed specification changes to the baseline and retains the change's other artifacts. Contradictions between the baseline, an active design and code must be reconciled explicitly.

Chat messages, drawings and local review comments inform these records. Accepted decisions and their reasons must be incorporated into repository files. The private review store is not portable with a checkout. Preserve original comments as evidence and write their interpretation in English. Do not fabricate acceptance or retroactively rewrite a requirement to match a failing implementation.

## Decisions behind the workflow

- Use one packaged `specplanner` skill to select context, draft or revise artifacts, verify task coverage and close out a change. Keep the writing policy in one runtime source so both hosts receive the same rules. The release includes the skill and its examples; a consumer does not need this repository's AGENTS.md.
- Use the pinned official OpenSpec templates and validator. They provide artifact syntax and structural checks. They do not prove that user intent was preserved, rationale is adequate, or implementation satisfies the plan. Those comparisons remain explicit review work.
- Keep exact requirements and decision reasons in their owning files. Tasks link to those sections rather than reproducing the contracts. This reduces repetition without making a summary the only implementation reference.
- Preserve ambiguity. Record the unresolved decision and its implementation impact; do not invent details to make a plan look complete. Independent tasks can proceed within the user's authorization.
- Keep workspace routing, revision checks, write locks, archive confirmation and implementation authorization in code and host boundaries. Skills cannot grant access or turn a planning request into permission to implement or publish.
- Delegate model work to the host agent; SpecPlanner does not embed a model runtime or manage model credentials. Codex is the currently implemented host-agent integration. This does not impose an executor choice on consumer projects. Do not add model calls to UI reads, drawing gestures, prose filters or validation. A deterministic banned-word check would miss vague contracts and can reject valid technical wording. Review against concrete source requirements instead.

## Reading without unnecessary repetition

### Project configuration

This repository uses the official `spec-driven` schema selected in `openspec/config.yaml`. Its proposal, specs, design and tasks already match the record roles above. Keep the official templates and artifact graph; an independent schema would duplicate them without adding a needed artifact or dependency. Revisit that choice only when the workflow needs a structural change, then verify creation, instructions, task tracking and archive together.

The config holds short shared context, artifact-specific `rules` and separate `operations.apply` / `operations.archive` guidance. Shared context carries project identity, language and pointers to the maintained writing contract. Rules carry the relevant stage's requirements, including decision IDs, exact task references and affected-host verification. The full writing policy remains in `src/writing-policy.ts` and is returned by SpecPlanner; it is not copied into every rule. OpenSpec's [configuration contract](https://openspec.dev/docs/configuration/config-yaml) defines which fields reach each phase.

These settings apply to development of this repository. The installed plugin reads the selected repository's own config; it does not copy this project's technology, test commands or host requirements into another project. A config edit is picked up by the next instruction request without rebuilding the plugin. Existing document content and each change's recorded schema are not rewritten by a config edit. Rules guide drafting and review; structural validation cannot prove compliance with the prose rules.

Subscription access is an authentication and billing choice, separate from the coding agent. The owner's preference for an existing OpenAI/ChatGPT subscription is recorded in project context; it does not mean every project must use Codex CLI. A consumer such as Factory can select Pi or Codex through its own verified executor integration. Do not infer transferable credentials, native sessions, model entitlement or unlimited quota from that preference. Missing access must remain explicit rather than trigger an unapproved provider or API-billing fallback. This clarification does not add a Pi integration to SpecPlanner.

### Conditional reads

Inventories return metadata. Documents, instructions and boards support revision-based reuse. The caller may omit unchanged content only while the complete previous content remains available. Losing conversation context requires a fresh read.

`planning_instructions` takes neither `id` nor `artifact` for shared guidance, or both for official artifact or apply/archive operation instructions. Whole-response revisions include workspace identity, requested artifact or operation and policy. `knownContextRevision` reuses the exact project context across phases; phase-specific instructions, templates, rules and operation guidance remain present. `knownWritingPolicyRevision` reuses the complete policy across phases.

The [context contracts](closeout-and-context.md#context-contracts) define board cache identity, exact comment-field pagination, size limits and continuation arguments. The panel reconstructs complete originals; agents can retrieve the selected evidence they need. Reuse reduces repeated payloads without removing source content.

## Readiness and limits

A ready plan accounts for source requirements, exceptions, accepted decisions, tasks and acceptance checks, with blocking questions resolved. A completed task has evidence for its stated result. A verified closeout additionally reconciles implementation, dependencies and baseline specification changes before archive.

The writing policy and skill support those reviews; they do not guarantee that every future model output is correct or free of filler. Report missing facts and failures. Preserve longer text when shortening would lose a contract, exception or reason.

Prior document snapshots are retained privately, but the reader does not expose arbitrary historical snapshot selection. A comment's quote preserves its exact selected text. Use version control for shared document history; private snapshots and comments are not a substitute for recording accepted decisions in the repository.
