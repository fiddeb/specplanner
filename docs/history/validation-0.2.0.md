# Validation of SpecPlanner 0.2.0

Historical evidence for the named release. For current setup, support and verification, see [README](../../README.md) and [0.5.1 verification](../validation-0.5.1.md).

Validated locally on 2026-11-01 using Node.js 26.10.0 and the pinned official OpenSpec CLI 1.14.2. Node.js 22 remains the declared runtime minimum; this run did not separately execute on Node.js 22.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 43 passed, 0 failed |
| `npm run build` (also invoked by package verification) | Passed |
| `npm run verify:package` | Passed from a temporary installation directory containing spaces |
| `git diff --check` | Passed |
| Context benchmark | 109,205 → 19,902 response bytes; 12 → 16 workflow calls |

The 17 archive regressions use temporary repositories and cover actual CLI sync/archive with and without deltas, task parsing/unknown tasks, missing verification, overlap/dependency order, newer scenario preservation, stale files/comments, collisions, idempotent and concurrent calls, concurrent comment/save publication, changes during the CLI, metadata/binary preservation, long IDs, cross-process storage, paginated archive sections, partial sync, receipt-storage failure after success, and combined operation/receipt failure with live diagnostics. Context and existing tests cover exact chunk reconstruction, independent comment revisions, external edits, original-language reviews, project isolation, Markdown safety, boards, connections, and SDK MCP contracts.

An independent read-only review found and resolved comment-lock serialization, UI draft loss during archive, subsequent manifest-page parsing, archive cursor scope/projection mismatches, and date-prefixed name-length validation. A final focused review also verified receipt-error handling and the separation of actual operation diagnostics from preview output. No Required/Critical finding remained in those reviewed paths.

A mutation experiment removed the comment-revision guard before archive. The regression `external file edits and new review comments invalidate preview tokens` failed as expected. The original source was restored exactly, and the final complete suite passed.

The disposable browser harness uses a real in-memory MCP client/server and the pinned CLI through a local HTTP proxy. In Orca's browser, checks covered a 30-file change, loading subsequent change-file pages, planning/tasks/unknown-verification display, exact before/after spec review, explicit assessment/evidence/review confirmations, and successful archive. During a deliberately delayed application, document editing, change navigation, and the archive button were observed disabled. The resulting receipt remained available, no active change remained, archive-library continuation worked, and the original archived proposal opened read-only. At a 390 × 844 viewport the page width remained 390 and no alert was present. Receipt details are collapsed by default and scroll within a bounded area to leave space for documents.

Package verification covers real stdio discovery and UI resources, official change creation/instructions/validation, compact inventories, document edits/comments/conflicts, boards/proposals/history, actual archive preview/sync/apply/retry, preserved metadata/evidence and archived original reviews. The release includes the contract and measurement documentation.

The production example repository was not opened or modified. The installed 0.1.8 cache was read only for baseline measurement; it was not upgraded. Native Codex plugin installation, installed MCP App sizing, host message delivery and host presentation of structured results remain unverified. Browser/build/protocol checks do not establish those integrations. Existing dependency-audit limitations in README remain unchanged.

See [behavior and limits](../closeout-and-context.md) and [measurement method and raw records](context-measurements.md). External filesystem writers remain outside the plugin lock; partial operations can require explicit reconciliation. Receipt storage must be restored before persistent recovery reads can resume; unpersisted live diagnostics must be preserved from the failing response.
