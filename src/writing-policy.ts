// Project-specific writing guidance, informed by the linked Unslop skill.
// Kept in the release so planning does not depend on fetching mutable remote instructions.
export const writingPolicy = {
  version: 2,
  reference: "https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md",
  instructions: `Write all generated planning artifacts in English. Preserve original user comments in their original language.

Prefer concise, concrete prose. Remove filler, rhetorical framing, vague claims, decorative language, and repeated explanations. Use stable technical names and complete sentences. Do not impose a word limit or shorten text merely to reduce its length.

Completeness takes precedence over brevity. Assume the implementer has no access to the planning conversation. Preserve every requirement, constraint, exception, dependency, decision rationale that affects implementation, and acceptance criterion. Preserve exact identifiers, interfaces, data formats, units, limits, ordering, state transitions, ownership, authorization rules, failure behavior, retry and concurrency behavior, compatibility requirements, and migration or rollback details whenever they affect this change. Include both what must happen and what must not happen.

Do not replace concrete behavior with phrases such as 'handle appropriately', 'follow the existing pattern', or 'use standard validation'. Name the behavior or cite an exact accessible file, symbol, requirement, and relevant version. Define unfamiliar terms. Cross-references must identify their target; a short summary or a diagram must not be the only source of implementation-critical details.

Do not invent missing requirements or silently resolve ambiguity. Separate confirmed decisions, assumptions requiring confirmation, and open questions. State which questions block implementation. Ask the owner to resolve them before treating the plan as ready.

Write checkable requirements and acceptance scenarios with the trigger, relevant preconditions, actor, expected result, and applicable failure cases. Keep OpenSpec's required artifact structure, normative language, requirement identifiers, and scenario syntax. A style edit must not weaken MUST/SHALL into SHOULD/MAY or remove a condition, exception, number, or prohibition.

After drafting, compare the text against the source requirements, decisions, comments, and earlier version. Check each implementation-relevant fact still has an explicit place. Remove repetition only when the remaining statement has the same scope and can be found from every affected task. Keep useful examples and rationale when removing them would force the implementer to guess. If a detail cannot be simplified without loss, keep the longer explanation.

Treat repository artifacts as the durable planning record. The proposal explains the problem, intended outcome, scope and non-goals. Specifications define observable requirements and scenarios. The design records consequential decisions, alternatives actually considered, reasons, tradeoffs and conditions for revisiting them. Tasks link to exact requirement/scenario and decision sections and state a verifiable result; reference the contract instead of copying it into every task. Keep OpenSpec's official structure. Add detail where it belongs rather than creating a second competing plan.

Before calling a plan ready, trace each source requirement and accepted review decision to its specification or design section, implementation task and acceptance check. Use a short coverage table when those links are otherwise hard to follow. Record unresolved conflicts and blocking questions with an owner if known. Do not invent agreement, alternatives, evidence, owners or dates. Promote accepted chat and review decisions, their reasons and substantive changes into the repository artifacts. Local comments, drawings and chat summaries are supporting evidence, not the sole record of a decision. When a decision changes, retain its earlier rationale and explain what supersedes it and why.

During implementation, update the plan when the authorized design changes. Mark a task complete only after its stated result is verified. Record the command or check, outcome, relevant revision/build and evidence path, plus limitations. A checked task is not proof that the whole change is accepted or authorization to archive it. Keep planning readiness, implementation completion and verified closeout distinct.

This is writing guidance, not proof of semantic completeness. OpenSpec validation does not establish that all user intent was preserved. Present unresolved questions and substantive changes for review. Never describe a shorter document as complete solely because it passes validation.`,
};
