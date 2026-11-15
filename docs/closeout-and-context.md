# Change closeout and bounded context (0.3.0)

The pinned official OpenSpec 1.14.2 CLI performs spec application and archiving. SpecPlanner adds an explicit review boundary, bounded reads, and observed outcomes. It exposes neither arbitrary commands nor validation-bypass flags. The supplied example repository was not opened or modified.

## State and authority

| State | Evidence | What it does not establish |
| --- | --- | --- |
| Planning artifacts complete | Official schema output files exist | Document correctness or completed implementation |
| Implementation tasks complete | Official parser reports all tracked checkboxes checked, including nested tasks | Tests ran or requirements were implemented |
| Implementation verified | Explicit caller assessment identifies saved evidence at the reviewed revision | SpecPlanner independently executed or proved those checks |
| Archived | Actual specs and complete archived change match the reviewed fingerprints | Later external edits preserve that state |

Missing tasks and verification are **unknown**. Candidate evidence filenames are discovery hints. Unknown tasks require explicit acknowledgement; incomplete tasks block application until finished or explicitly revised. Validation and checked tasks never invoke archive automatically.

Every archive call requires an absolute `workspacePath` from trusted current-project context. Archive does not accept the environment default. Other tools retain explicit workspace routing, legacy environment fallback and personal-storage behavior. Tool visibility remains host metadata rather than server authentication; normal filesystem access controls still apply.

## Review and archive

1. Orient with `workspace_info` and `list_changes`, then select a change using `change_status` and the `read_change` manifest. Read relevant original documents and exact review comments. Use `read_change_file` for metadata/text evidence and `read_project_document` for current specs or archived documents. The agent runs implementation checks through its authorized development tools; SpecPlanner does not execute arbitrary test commands.
2. Call `archive_change` with `action: "preview"`, `workspacePath` and `id`. Supply `dependsOn` after reviewing proposal/design dependencies. These are caller declarations: dependencies in prose are not extracted by guessing. Omission is reported as unknown; an explicit empty list is a reviewed declaration, not automatic proof that dependencies do not exist.
3. Preview hashes the complete regular-file OpenSpec tree and workspace review comments. It copies the tree into a temporary repository, verifies the copy and source fingerprints, and runs `openspec archive <id> --json --yes` there using the pinned CLI. The real repository is unchanged. The simulation exercises actual delta validation, requirement merging, scenario-loss checks, capability retirement and archive naming. No `--skip-specs` or `--no-validate` option is exposed.
4. Inspect blockers, remaining tasks, saved evidence, delta paths, affected main specs and destination. The `inspect` action provides paginated `files`, `tasks`, `evidence`, `deltaSpecs`, `planningArtifacts`, `overlaps`, `blockers`, `specs` and `diagnostics`. `read` with the spec path and `version: "before"` or `"after"` returns exact current/proposed text. `read` path `$diagnostics` provides bounded complete CLI diagnostics. Original change inputs remain accessible through document/file tools.
5. Any other active change affecting the same capability path is conservatively reported as an overlap, even for disjoint requirements. Supply an `overlapOrder` containing this change and every overlapping active change exactly once. Only the first may proceed. Review all affected originals before choosing the order. Archive predecessors, reconcile remaining deltas against current main specs, and preview again. Declared dependencies must have archive evidence and no longer be active; absent or active dependencies block application. Filenames, dates and task completion do not determine semantic precedence. CLI conflicts remain blocked instead of being resolved through silent replacement.
6. Explicitly call `action: "apply"` with `token`, `dependenciesReviewed: true`, `specDiffsReviewed: true`, and `verification: { summary, evidencePaths }`. Evidence paths must identify saved files in the selected change. The assessment records actual implementation verification performed by the caller. Review confirmations refer to exact dependency context and both sides of every spec change, including potentially newer main-spec wording. Unknown tasks also require `unknownTasksAcknowledged: true`.
7. Under the shared write lock, application rechecks source/comment fingerprints, date and destination, then invokes the same official CLI in the selected real repository. Success requires the proposed spec fingerprints, all original change-file fingerprints at the archive destination, and absence of the active change. No other action invokes this step.

The CLI's local `YYYY-MM-DD-<id>` convention is retained. Already date-prefixed names are not prefixed again. Archive-name validation allows the prefix added to a 100-character active ID. Existing destinations, including empty directories, are never replaced. All original change files are retained, including `.openspec.yaml`, verification artifacts, other formats and binary evidence. Metadata warnings remain available in diagnostics.

The panel exposes the same preview/review/apply sequence. It loads requested review pages and both sides of each proposed spec before enabling review confirmation. Document/comment drafts prevent preview and application. Archive requests lock document editing and change navigation until completion. The parent keeps the success receipt visible after the active change disappears.

## Concurrency, preservation and recovery

Document saves, comment publication and archive share `openspec/.specplanner-write-lock` across processes. Contending writes fail visibly, retaining UI drafts. Comment paths are resolved after lock acquisition, preventing publication during an archive. A crash can leave the lock behind; remove it only after confirming that no writer is active.

Previews and operation receipts live outside repositories in `workspace-<canonical-path-hash>/archive-previews/`. They persist reviewed manifests, exact proposed specs, CLI diagnostics and verification assessments across MCP server instances. Do not commit this local planning data. This release does not automatically clean up previews or provide a receipt browser. A changed local date requires a new preview before application.

Repeat calls with the same token and unchanged archived files and review identity are idempotent. An operation interrupted after CLI completion can be recognized from exact source/destination/spec fingerprints and the original change identity. A copy/remove archive interrupted before saving its identity binding requires manual reconciliation; matching bytes alone do not establish ownership. A token whose operation ran but no longer matches is not blindly replayed.

Results distinguish `archived`, `partial` and `failed`. `changed` and `remaining` are pages; continue through `inspect` sections `changes` and `remaining`. `$diagnostics` contains the command result/error. `result` returns the receipt plus a fresh observation of source presence, archived-file fingerprints, changed files and pending specs. Fresh continuation sections are `observedChanges` and `pendingSpecs`. Inspection failures explicitly mark the mutation set unknown. Reconcile partial changes against actual files and the preview before creating a new preview; do not blindly reapply uncertain deltas.

External editors do not honor the lock. Before/after fingerprints and the CLI's checks detect ordinary concurrent edits; changed evidence during the CLI yields a partial outcome while preserving its actual archived bytes. Node does not provide a repository-wide atomic compare-and-swap or an OS sandbox against malicious concurrent path swaps. Filesystem/process failures can require manual reconciliation. Results report observed state rather than promising an atomic multi-file transaction.

If final receipt storage fails after the CLI ran, the response still reports observed file changes with `receiptSaved: false` and recovery instructions. An intent-storage failure occurs before CLI execution and explicitly reports that no repository files were changed.

Original review text, language, quotes, UTF-16 offsets, revisions and snapshots remain in workspace-scoped storage. `read_document` accepts the original `id` plus `archiveName`. The project reader uses successful receipts to show archived comments automatically. For external archives without receipts, original review identity is reported as unknown; callers can supply the original ID explicitly through `read_document`.

## Context contracts

| Tool | Default | Explicit detail |
| --- | --- | --- |
| `workspace_info` | Identity and counts; inventories omitted | Listing tools; `knownRevision` checks this summary, not document bodies |
| `list_changes` | 20 sorted IDs | Cursor and limit up to 100 |
| `list_project_documents` | 20 project guidance entries | `specification`, `archive` or `all` category; cursor/limit |
| `read_change` | `documents` manifest page and review count; no bodies | Follow its page, then fetch relevant files |
| `change_status` | Separate planning/tasks/verification state and review counts | `knownRevision`; evidence/delta section pages; archive preview for remaining task text |
| `read_change_file` | Exact text slice, default 12,000 UTF-16 units | `nextOffset`, `expectedRevision`, `knownRevision` |
| `read_document` | Exact Markdown slice and original comments page | Independent text/comment continuation and revisions |
| `read_project_document` | Exact library text slice | Text and available archived-review continuation |
| `planning_instructions` | Full official artifact instructions and writing policy | `knownRevision`; reuse `knownWritingPolicyRevision` to omit only unchanged static policy across artifacts |
| `archive_change` | Explicit preview summary | Inspect/read/apply/result; no automatic application |
| `propose_board` | Receipt: ID, base revision, summary, element count | Original scene retained; fetch through `read_board_proposal` |
| `list_board_proposals` | Page of 20 proposal summaries | Cursor/limit up to 100; no scene bodies |
| `read_board_proposal` | Complete selected proposal | Explicit proposal ID and workspace |

Lists include `total`, `hasMore` and `nextCursor`. Cursors bind workspace, query/section, complete listing revision and position. Foreign or changed listings require a restart, never silent skipping. Archive `affectedSpecs` continues through section `specs`; other preview sections use their matching name. Text includes `total`, `offset`, `hasMore` and `nextOffset`; slices after offset zero require `expectedRevision`. UTF-16 units match editor/comment offsets and preserve Unicode when concatenated, including a split surrogate pair. Maximum text slices are 64,000 units. Files above 1 MB and binary evidence require repository file tools. Inspection rejects trees above 10,000 entries or 64 MB instead of returning an incomplete manifest. Symlinks and non-regular entries are rejected.

Writes retain the existing SHA-256 content revision and require `expectedIdentity` from the read result. Text/comment continuations should also send `expectedIdentity`, rejecting a replaced change even when the bytes are identical. The panel reuses `knownCommentsRevision` on later text slices; only explicit comment continuations fetch the remaining original comments. Conditional document reads send both `knownRevision` and workspace/document-bound `knownCommentsRevision`. Unchanged content with new comments omits only the content. If both match, the response is compact and marked unchanged. A foreign project's revision cannot suppress a document. Comments have a separate cursor that rejects concurrent changes. Status revisions include review fingerprints. No document cache is used: filesystem reads detect panel changes, direct agent edits and other processes.

Structured content is the data contract; full payloads are no longer serialized a second time in text blocks. Clients must expose MCP `structuredContent` to agents/panels. SDK and packaged stdio tests cover this contract; text-only legacy consumers require adaptation. The panel explicitly assembles only requested document/review pages instead of sending its entire library to the model.

## Compatibility and verification

Version **0.2.0** introduced these response contracts: `workspace_info` no longer contains `changes`/`documents`; `read_change.result.documents` is a manifest page; read tools return bounded content with explicit continuation. Client integrations must follow these contracts. The bundled panel, preview harnesses, tests and package verifier do so. These 0.2 contracts remain in effect; 0.3 additionally changes proposal responses/listings and requires document identity on writes. Update external clients along with the server. The panel resource URI and package versions are 0.3.0. No installed-cache replacement is performed.

Tests use temporary repositories and the real pinned CLI. Coverage includes delta/no-delta archive, unknown/incomplete tasks, missing verification, spec conflicts, overlaps/order/dependencies, collisions, retries, concurrent plugin writes, external changes before/during apply, binary/metadata preservation, long IDs, exact reviews, partial errors, workspace/symlink boundaries, compact/full reads, conditional revisions, stable pages and project isolation. Package verification includes preview/sync/apply/retry and archived reviews from an installation directory with spaces.

Independent review identified and corrected shared-lock, UI draft-loss, manifest-envelope, cursor-scope and archive-name defects. Regression checks cover these boundaries. See [context measurements](context-measurements.md) for measured bytes, calls and tradeoffs. Native installed-host sizing, message delivery and tool presentation remain separate from local browser/build/protocol verification.


Version **0.3.0** separates review history by physical change directory identity (device, inode, birth time) and original change ID. In-place edits and normal renames preserve that identity. SpecPlanner records an explicit association after an archive, including copy/remove operations. Creating a new directory with the same name creates a new history. Direct file edits keep SHA-256 content revisions. Old panel drafts and stale archive previews cannot target a replacement directory.

Legacy `documents/` records remain intact. The first unambiguous read records an immutable owner; concurrent reads agree on that owner. A known archive's authoritative original ID takes precedence over its date-prefixed filename. Ambiguous pre-existing reuse stops with an ownership error instead of silently attaching old comments to new work. Only comments count toward review inspection limits; retained revision snapshots are not scanned as comments.

This is local filesystem identity, not a portable project ID. Copying or restoring a repository directory can create a new identity; its original history remains on disk but is not automatically reattached. Back up the repository together with its private SpecPlanner data. Resolving ambiguous legacy ownership or interrupted copy/remove archives is currently a manual operation; preserve the original files and receipts before reconciliation. No automatic history merge is provided.

Dependency checks require exact recorded original IDs from archive bindings or successful matching receipts. Unknown dated external archives do not prove which original ID they came from, so they cannot automatically satisfy a dependency. A filename suffix alone never establishes completion.
