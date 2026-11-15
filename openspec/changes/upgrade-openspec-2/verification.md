# Verification

## Result

Implementation and local installation passed. All six implementation tasks are complete. This evidence was collected before Git integration. The change remains active; no archive, remote CI run or public publication was performed. Validation does not substitute for the tests and host evidence below.

## Tested build

- SpecPlanner 0.5.0, official OpenSpec 2.0.0; baseline SpecPlanner 0.4.1 / OpenSpec 1.14.2.
- Checkout: main with pre-existing and current uncommitted work, based on bd5ac52b6742837820eab7db00abbaf402b95e6e.
- Final MCP server SHA-256: `79c9f19c9b4feced264b212264b355858d81adeee558e48fcaaa7b2788d811e3`. Release and installed Codex cache bytes match.
- Final Orca package content hash: `97aee05f37c1b954ffd3a158f3c7ab1d9a48f9fd37018927f25de467cbbba21b`; installed with retained approval, development loading removed.
- macOS arm64, Node 26.10.0, Orca 1.4.259. No independent CI evidence for other Node versions or operating systems is claimed.

## Acceptance evidence

| Tasks / contract | Evidence and result |
| --- | --- |
| 1.1 / Explicit planning root / D1 | `test/openspec.test.ts`: missing and registered stores, malformed YAML, config.yaml precedence, explicit store repository, existing local tree, nested repo and global-default isolation passed. An isolated inversion of the root guard failed the store-only regression as intended. |
| 1.2 / Shared host runtime / D4 | Lockfile pins 2.0.0; package build, licenses and Orca validation passed. Runtime and UI assets fit the native file/count/size limits. Only OpenSpec and its required transitive graph changed. |
| 2.1 / Complete operation guidance / D3 | Operation tests preserve official apply/archive output, operation guidance and context invalidation. Fresh Codex discovery exposes 23 tools with policy-only and apply/archive instruction schemas. Skill lint has zero findings. |
| 2.2 / Located task evidence / D2 | Multi-file tasks preserve file and one-based line; counts include description-free checkboxes. Unknown evidence stays unknown; completed and pending escaping paths are rejected. Both MCP status and archive preview count blank remaining tasks correctly. |
| 3.1 / Migration acceptance / D4 | `npm run check`, all 67 tests, build and isolated package verification passed after the final code edits. Independent review found the blank-checkbox summary bug; correction and path guard hardening passed re-review. The comparative process-replacement test passed for both release and final installed Codex cache, including exact reviews, board revision, archive and rollback reads. |
| 3.2 / Installed hosts / D4 | Orca's real worker created a disposable OpenSpec 2 change, validated this change, read task counts and preserved board revision 0 across restart. The test change was removed. Global native plugin 0.5.0 is installed, non-development, with its connected Plan panel visible; the final installed worker displayed complete task status (6/6) for this change. Codex plugin 0.5.0 is globally enabled; a fresh app-server finds its skill and MCP server. Existing chat connections retain their previous server until reconnected. |

The [release verification record](../../../docs/validation-0.5.0.md), [migration comparison](../../../docs/migration-0.5.0.json) and [token measurements](../../../docs/efficiency-0.5.0.json) contain scope, method and limitations. Detailed local logs are `/private/tmp/specplanner-050-tests.log`, `specplanner-050-package.log`, `specplanner-050-mutation.log`, `specplanner-050-native-flow.json`, `specplanner-050-cache-migration.json`, `specplanner-050-skill-discovery.json` and `specplanner-050-codex-mcp-discovery.json` in the same temporary directory. These logs are supporting local evidence; durable outcomes are recorded here and in the linked reports.

## Source comparison

The user authorized upgrading for a sole-user project while retaining both Orca and Codex, global availability, token efficiency and durable reasons for decisions. [D1](design.md#d1-select-the-planning-repository-explicitly) resolves ownership without silently splitting the planning record. [D2](design.md#d2-use-public-operation-json) removes internal API coupling and preserves exact task evidence. [D3](design.md#d3-keep-one-workflow-skill) keeps one workflow and all operation guidance; [D4](design.md#d4-release-both-hosts-together) ties both installations to the tested runtime. Each has corresponding requirements and acceptance tasks. Original review text remains unchanged; generated artifacts are English. No requirement was removed to shorten a prompt.

## Limits and recovery

External store pointers require explicit selection of the store repository. Task-status checks now spawn the bounded official CLI; latency was not benchmarked. The four-artifact token fixture increased subsequent instruction responses by 46 tokens and discovery by 7; new operation payload sizes were not benchmarked. Codex desktop conversation-panel placement and Orca light-theme rendering remain unverified. Reinstalling the retained 0.4.1 package restores the old runtime and can read the tested stored formats, but lacks the root protection and apply/archive tool options.
