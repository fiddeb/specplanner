// Project-specific writing guidance, informed by the linked Unslop skill.
// Kept in the release so planning does not depend on fetching mutable remote instructions.
export const writingPolicy = {
  version: 1,
  reference: "https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md",
  instructions: `Write all generated planning artifacts in English. Preserve original user comments in their original language.

Prefer concise, concrete prose. Remove filler, rhetorical framing, vague claims, decorative language, and repeated explanations. Use stable technical names and complete sentences. Do not impose a word limit or shorten text merely to reduce its length.

Completeness takes precedence over brevity. Assume the implementer has no access to the planning conversation. Preserve every requirement, constraint, exception, dependency, decision rationale that affects implementation, and acceptance criterion. Preserve exact identifiers, interfaces, data formats, units, limits, ordering, state transitions, ownership, authorization rules, failure behavior, retry and concurrency behavior, compatibility requirements, and migration or rollback details whenever they affect this change. Include both what must happen and what must not happen.

Do not replace concrete behavior with phrases such as 'handle appropriately', 'follow the existing pattern', or 'use standard validation'. Name the behavior or cite an exact accessible file, symbol, requirement, and relevant version. Define unfamiliar terms. Cross-references must identify their target; a short summary or a diagram must not be the only source of implementation-critical details.

Do not invent missing requirements or silently resolve ambiguity. Separate confirmed decisions, assumptions requiring confirmation, and open questions. State which questions block implementation. Ask the owner to resolve them before treating the plan as ready.

Write checkable requirements and acceptance scenarios with the trigger, relevant preconditions, actor, expected result, and applicable failure cases. Keep OpenSpec's required artifact structure, normative language, requirement identifiers, and scenario syntax. A style edit must not weaken MUST/SHALL into SHOULD/MAY or remove a condition, exception, number, or prohibition.

After drafting, compare the text against the source requirements, decisions, comments, and earlier version. Check each implementation-relevant fact still has an explicit place. Remove repetition only when the remaining statement has the same scope and can be found from every affected task. Keep useful examples and rationale when removing them would force the implementer to guess. If a detail cannot be simplified without loss, keep the longer explanation.

This is writing guidance, not proof of semantic completeness. OpenSpec validation does not establish that all user intent was preserved. Present unresolved questions and substantive changes for review. Never describe a shorter document as complete solely because it passes validation.`,
};
