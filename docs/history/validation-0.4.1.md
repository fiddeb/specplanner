# SpecPlanner 0.4.1 review

Historical evidence for the named release. For current setup, support and verification, see [README](../../README.md) and [0.5.0 verification](../validation-0.5.0.md).

Reviewed the instructions, agent workflow, planning records, model-facing data contracts, shared core, packaging and relevant UI guidance. This extends the 0.3 and 0.4 reviews; it is not a new dependency security audit. All work remains local and uncommitted.

## Findings and changes

1. Required: large selected review quotes bypassed document response limits. A one-character document read could return nearly 1 MB through a comment. Comment fields now have bounded previews with scoped continuations. Full text stays in storage and the UI reconstructs it exactly.
2. Required: the installable package had no planning skill, and its README linked a policy source that was not shipped. The portable plugin now declares and packages the skill, examples, evaluations and MCP dependency metadata. Shared writing policy is accessible before a change exists. README distinguishes Codex skill discovery from native Orca panel installation and manual MCP configuration.
3. The writing policy now assigns document responsibilities, requires promotion of accepted chat/comment decisions into repository artifacts, preserves superseded rationale, and connects tasks to requirements, decisions and acceptance evidence. Open questions remain explicit. The Decisions view points to the actual design records instead of implying that a separate decision store exists.
4. Repeated board reads and repeated project context across artifact instructions can omit unchanged content using scoped revision tokens. Exact scenes, official templates, artifact rules and project context remain available on fresh reads. No new model runtime or automatic prose-rewriting call was introduced.

An independent reviewer found no remaining Required or Critical code issues in this scope after examining the changes and running nine targeted tests. The final distribution clarification from that review is reflected in README.

## Local verification

- `npm run check`: passed.
- `npm test`: 62 tests passed.
- `npm run verify:package`: passed; includes `npm run build`, an isolated installed directory, real MCP stdio, packaged skill references, policy access before change creation, official OpenSpec, archive and review retention, and an Orca host stand-in.
- `git diff --check`: passed.
- Mutation experiment: inverted the large-comment preview condition in an isolated copy. The new near-limit regression test failed. The working tree was never mutated for the experiment.
- Skill linter: 0 errors, 0 warnings, 0 info.
- Offline forward evaluation: three synthetic writing/readiness cases passed source comparison; six description-only trigger selections matched. [Preserved outputs](planning-evaluation-0.4.1.json) show the drafts and limitations. No claim of live end-to-end model behavior is inferred from them.

## Token measurements

Counts use `o200k_base` on compact JSON of actual MCP responses in disposable fixtures. [Raw summary and request counts](efficiency-0.4.1.json) include tool discovery. Reproduce captures with `tsx scripts/measure-planning.ts <capture.json> [baseline/dist/server.js]`; use the same tokenizer and compact serialization to count them.

| Operation | Before response tokens | After response tokens | Interpretation |
| --- | ---: | ---: | --- |
| Three unchanged reads of a 101-element board | 16,020 | 210 | Reuses a previously read complete scene |
| Three further artifact instructions sharing 5,439 context characters | 7,191 | 4,420 | Reuses exact project context and writing policy; artifact content remains |
| One review on an 880,000-character selection | 240,380 | 582 | Bounded preview; the complete quote costs additional reads when needed |
| First board read | 5,340 | 5,387 | Scoped cache metadata adds overhead |
| First artifact instructions | 2,965 | 3,292 | Stronger source-of-truth policy adds one-time context |

Tool discovery grew from 5,164 to 5,478 tokens. The skill is about 1,100 tokens when loaded. These costs are explicit: stronger guidance is not free, and the improvement is in avoiding repeated or irrelevant payloads. Counts exclude host framing, model reasoning, prompt-cache billing and UI-only traffic. They do not establish a fixed reduction in total model cost. The long-quote saving applies to initial inspection, not to reading the complete quote.

## Host boundaries and remaining limits

Separate host checks on Orca 1.4.259 confirmed a standard non-development 0.4.1 installation, connection to the selected repository, the saved board at revision 0, and the revised Decisions guidance. The captured panel reported no errors; no new font warnings appeared. The wider 0.4.0 native editing/archive flows were not repeated for this change. Native chat delivery and light-theme coverage remain outside these checks.

Codex's plugin list confirms 0.4.1 installed and enabled. A fresh local app-server `skills/list` request discovered `specplanner:specplanner` from the installed 0.4.1 package, with user scope, enabled status, and the declared SpecPlanner MCP dependency. This was a read-only discovery request, not a model completion or live trigger-selection test. Native Orca installation exposes the panel; the Codex plugin or an explicit skill loader exposes agent guidance. Already-running agent connections may retain the old server until restarted.

Writing guidance is not a semantic proof or a guarantee that all future output is free of filler. OpenSpec validation checks structure, not every source requirement or implementation claim. Exact historical document snapshot selection remains unavailable through the reader. Private comments and snapshots are not portable project truth; accepted decisions belong in repository files. Earlier dependency and host limitations remain documented in the preceding validation records.

# Skill review: specplanner

Mode: check. Path: skills/specplanner. Body: 33 lines. References: 1 prose file, 46 lines; evaluation and host metadata files also reviewed. Scripts: 0.
Assessment: verification incomplete. Files changed: no by the final review; the skill was created in this change.
Linter only: ran. Result: 0 errors, 0 warnings, 0 info.
Review total: 0 errors, 0 warnings, 1 info.

## Findings

| Sev | Rule | Location | Quote | Status | Fix |
| --- | --- | --- | --- | --- | --- |
| I | T2 | Model coverage | Exact runtime model ID unavailable | unverified | Record exact target models and live host trigger behavior when that information is available. The offline evaluator reported only the GPT-6 family. |

## Passed

M1 M2 M3 M4 M5 M6 M7 M8 S1 S2 S3 S5 S6 S8 C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 T1 T3.

## Not applicable

S4: prose reference is below 100 lines. S7 and X1 to X6: no bundled scripts.

Next step: Record exact model coverage and observe live skill selection; installed skill discovery passed, but the six offline trigger selections do not establish live routing.
