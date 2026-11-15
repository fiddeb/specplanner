# SpecPlanner 0.5.0 verification

OpenSpec is upgraded from the pinned official 1.14.2 package to 2.0.0. The tested baseline is SpecPlanner 0.4.1. Both releases are local builds. This evidence was collected from the uncommitted checkout before Git integration; no public release was published.

## Accepted behavior

- Planning remains in the explicitly selected repository. Config-only store declarations are resolved before initialization; an external or unresolved root cannot be shadowed by creating local changes. Config filename precedence, malformed YAML, explicit store-repository selection, existing local precedence, parent trees and global defaults have regression coverage.
- `planning_instructions` accepts `apply` and `archive`, preserving official operation guidance and project context. Context/policy revision reuse does not omit changed guidance. These are agent instructions; they do not grant UI access or implementation/archive permissions.
- Task status uses public OpenSpec apply JSON, including multi-file source paths, one-based lines and counts for description-free checkboxes. Missing or unreadable evidence stays unknown. Compact remaining counts include blank checkboxes even though the described-task list omits them.
- The separately named SpecPlanner skill remains the only bundled workflow skill. No upstream-generated skills or commands needed migration; no global `openspec update` was run. Existing board and review formats were retained.

The rationale and acceptance tasks are recorded in the repository's `openspec/changes/upgrade-openspec-2/` change. Official references: [2.0 migration](https://openspec.dev/docs/upgrade-to-2), [root selection and stores](https://openspec.dev/docs/stores), [configuration](https://openspec.dev/docs/configuration/config-yaml).

## Local verification

Environment: macOS arm64, Node 26.10.0. At verification time, the existing CI matrix for Node 22.13, 24 and 26 had not run on a remote service for this change.

| Check | Observed result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 67 passed, zero failed |
| `npm run verify:package` | Build and isolated installation passed; real MCP stdio, official CLI, archive/review preservation, stale-write rejection and shipped Orca worker against a host stand-in |
| `orca plugin test releases/specplanner-0.5.0 --json` | Shipped-worker test passed |
| `orca plugin check` and `plugin inspect` | Valid package; HTML panel rendering is tested separately below |
| Skill linter | Zero errors or warnings; description unchanged |
| Strict validation of upgrade change | Passed without issues |
| Root-guard mutation | Inverted `!local` in an isolated source copy; store-only regression failed with “Missing expected rejection”; original source untouched |
| Independent review | Required remaining-count correction fixed in both compact status and archive preview; regression coverage added; re-review found no remaining Required/Critical issues |

The independent review requested model override `gpt-6.1-terra`; exact runtime deployment identity was not exposed. A second independent reviewer reproduced the same count discrepancy. Neither review substitutes for the tests or actual-host checks.

`scripts/verify-openspec-upgrade.ts` starts the 0.4.1 server, creates a plan, board revision and Swedish review comment, then starts 0.5.0 against the same repository and private data. It verifies exact document content, identities, revisions and original comments, validates the same change, reads operation JSON, rejects a stale board write and applies a reviewed archive. Restarting 0.4.1 can still read the board and archived original comments. See [machine-readable comparison](migration-0.5.0.json) for build hashes and outcomes. The fixture is synthetic and removed after the run.

Lockfile review was limited to OpenSpec and its changed transitive graph: the previous fast-glob traversal dependencies were removed; tinyglobby, its fdir/picomatch dependencies, brace-expansion and balanced-match were added. Other direct packages were not upgraded. The packaged license verifier passed for the shipped runtime and UI dependencies. This is compatibility verification, not a new comprehensive dependency security audit.

## Actual Orca host

Orca 1.4.259 loaded the packaged 0.5.0 worker temporarily in development mode with the existing approved capabilities. Its real panel-request transport created an OpenSpec 2 test change, strictly validated the upgrade plan, read task counts and retained the saved board at revision 0 across worker restart. The test change was removed. The HTML panel rendered connected at version 0.5.0 with no reported render errors. No document edits or user board changes were needed.

An attempted request for agent-only `planning_instructions` through the panel was correctly refused. That surface remains model-only; operation instructions passed through MCP in the migration test. Package/host-stand-in tests are reported separately above. Codex desktop conversation-panel placement, light-theme rendering and remote Orca repositories are not established by these checks. Final global installation and fresh Codex discovery are recorded in the upgrade change's verification artifact.

## Token impact

[Measured payloads](efficiency-0.5.0.json) use actual MCP results and `o200k_base`. The three subsequent artifact-instruction responses were 4,446 tokens on 0.4.1 and 4,492 on 0.5.0; tool discovery was 5,478 and 5,485. Skill text increased from 1,074 to 1,152 tokens to cover store selection and operation instructions. Unchanged-response and large-comment-preview behavior remains intact. Temporary paths and revision hashes cause small fluctuations. These fixture counts are not billed tokens or a forecast of total model cost; new operation payload sizes were not benchmarked.

## Recovery and limits

The retained 0.4.1 package can be reinstalled and reads the tested persisted formats. It lacks the new root protection and operation options; do not use it to initialize store-only projects. External-store pointer routing remains deliberately unsupported: explicitly select the store repository. Existing local planning trees retain OpenSpec's documented precedence. No data conversion, speculative content shortening, automatic archival or global skill migration was performed.
