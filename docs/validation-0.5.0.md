# SpecPlanner 0.5.0 verification

Historical upgrade and closeout evidence. See [0.5.1 verification](validation-0.5.1.md) for the release, current dependency corrections and CI/installation results.

## Closeout assessment, 2026-11-15

The OpenSpec 2 upgrade is committed on `main` at `f8024cbea746d0602bdf2ad568b84222671a2c57` and archived under `openspec/changes/archive/2026-11-15-upgrade-openspec-2/`. Its four requirements are now the baseline at `openspec/specs/planning-integration/spec.md`, which passed strict validation after archiving. No active changes remain at this assessment.

Subsequent local maintenance is uncommitted. It adds stricter TypeScript checks, test/comment guidance, a shared validated panel-connection schema, and assertions for actual tool discovery, invalid-change findings and complete font references. `npm run check` passed; `npm test` passed all 68 tests; `npm run verify:package` passed its build and isolated stdio/Orca host-stand-in checks. A mutation accepting a connection record without an expiry passed type checking but failed the malformed-record regression.

The tested local release matches `dist/`: MCP server SHA-256 `a702e4471ca3ce5af43761d21d5f7eeaa4abd4ac19dab68eae7b095a05fd9593`; Orca worker SHA-256 `c6a15465e764dd26bd3085085d0e9f1f31760e79a37c7b41ccd26e4425fe4e7b`. These identify the maintenance build, not the installed upgrade build. Actual-host checks below predate the maintenance changes; installation, remote CI execution and public publication of that build are not established.

## Original upgrade evidence

The following records the upgrade from official OpenSpec 1.14.2 to 2.0.0, compared with SpecPlanner 0.4.1. These checks were collected before Git integration. Keep their historical test counts and build identities distinct from the current assessment above.

### Accepted behavior

- Planning remains in the explicitly selected repository. Config-only store declarations are resolved before initialization; an external or unresolved root cannot be shadowed by creating local changes. Config filename precedence, malformed YAML, explicit store-repository selection, existing local precedence, parent trees and global defaults have regression coverage.
- `planning_instructions` accepts `apply` and `archive`, preserving official operation guidance and project context. Context/policy revision reuse does not omit changed guidance. These are agent instructions; they do not grant UI access or implementation/archive permissions.
- Task status uses public OpenSpec apply JSON, including multi-file source paths, one-based lines and counts for description-free checkboxes. Missing or unreadable evidence stays unknown. Compact remaining counts include blank checkboxes even though the described-task list omits them.
- The separately named SpecPlanner skill remains the only bundled workflow skill. No upstream-generated skills or commands needed migration; no global `openspec update` was run. Existing board and review formats were retained.

The rationale and acceptance tasks remain in the archived change identified above. Official references: [2.0 migration](https://openspec.dev/docs/upgrade-to-2), [root selection and stores](https://openspec.dev/docs/stores), [configuration](https://openspec.dev/docs/configuration/config-yaml).

### Local verification

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

### Actual Orca host

Orca 1.4.259 loaded the packaged 0.5.0 worker temporarily in development mode with the existing approved capabilities. Its real panel-request transport created an OpenSpec 2 test change, strictly validated the upgrade plan, read task counts and retained the saved board at revision 0 across worker restart. The test change was removed. The HTML panel rendered connected at version 0.5.0 with no reported render errors. No document edits or user board changes were needed.

An attempted request for agent-only `planning_instructions` through the panel was correctly refused. That tool remains model-only; operation instructions passed through MCP in the migration test. Package/host-stand-in tests are reported separately above. The archived upgrade verification records global 0.5.0 installation in both hosts, a connected non-development Orca panel with complete task status, and fresh Codex skill/MCP discovery. Its installed MCP server SHA-256 was `79c9f19c9b4feced264b212264b355858d81adeee558e48fcaaa7b2788d811e3`. Codex desktop conversation-panel placement and light-theme rendering remain unverified; remote Orca repositories are unsupported.

### Token impact

[Measured payloads](efficiency-0.5.0.json) use actual MCP results and `o200k_base`. The three subsequent artifact-instruction responses were 4,446 tokens on 0.4.1 and 4,492 on 0.5.0; tool discovery was 5,478 and 5,485. Skill text increased from 1,074 to 1,152 tokens to cover store selection and operation instructions. Unchanged-response and large-comment-preview behavior remains intact. Temporary paths and revision hashes cause small fluctuations. These fixture counts are not billed tokens or a forecast of total model cost; new operation payload sizes were not benchmarked.

## Recovery and limits

The retained 0.4.1 package can be reinstalled and reads the tested persisted formats. It lacks the new root protection and operation options; do not use it to initialize store-only projects. External-store pointer routing remains deliberately unsupported: explicitly select the store repository. Existing local planning trees retain OpenSpec's documented precedence. The upgrade required no data conversion or global skill migration. The later archive was explicitly authorized and preserved all six original change files.

The latest recorded dependency assessment is the dated [0.4.0 audit summary](history/validation-0.4.0.md#dependencies-and-remaining-limitations), with detailed findings in [0.3.0](history/validation-0.3.0.md#dependency-assessment). Those are historical reports, not a fresh audit of the OpenSpec 2 lockfile. Transient Orca transfers do not survive worker restart; inspect saved revisions before retrying an unknown outcome. Old closed-panel bindings and archive previews have no automatic retention cleanup. See [storage and recovery contracts](closeout-and-context.md#concurrency-preservation-and-recovery) for filesystem and history limitations.
