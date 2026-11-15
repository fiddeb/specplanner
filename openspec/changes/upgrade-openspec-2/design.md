# Design

## Context

The problem and scope are in [proposal.md](proposal.md). Every current document, review and archive path is rooted in the explicitly selected repository. The pre-upgrade create operation made `openspec/changes/` before invoking OpenSpec; in 2.0 that directory takes precedence over a store-only declaration.

## Goals / Non-Goals

Preserve one durable planning record and existing cross-host revision checks while using the official 2.0 contracts. Automatic cross-repository store selection, a store registry UI, upstream skill installation, and a second agent runtime are outside this change.

## Decisions

### D1: Select the planning repository explicitly

Keep `workspacePath` as the sole trusted repository selection. Before initializing a config-only tree, ask the official read-only `context --json` command which root it resolves. Reject another root or resolution failure before creating directories. Existing local `specs/` or `changes/` retain OpenSpec's documented precedence. With no local config or planning tree, an explicit create request initializes this selected repository even if a parent or global default exists; ordinary reads never initialize it.

Following store pointers automatically was considered, but would separate planning ownership from the existing review identity and archive boundary. A store repository can already be selected directly. Revisit automatic routing only with an explicit project-to-planning-root binding and corresponding review and archive identity design.

### D2: Use public operation JSON

Use `instructions apply --json` for progress and task locations. Preserve counts for every checkbox, including empty descriptions, and report unreadable tracking evidence as unknown. Return relative task paths and one-based line numbers. Reject paths outside the selected change. This removes the dependency on `dist/utils/task-progress.js`; a subprocess adds bounded latency but keeps schema and checkbox semantics owned by OpenSpec.

### D3: Keep one workflow skill

Retain the separately named `specplanner` skill in the plugin. OpenSpec's updater owns `openspec-*` skills, not this skill. No upstream-generated skills or commands exist here to migrate, so running a global updater would add no necessary behavior. Expose apply/archive through the existing instruction tool, retaining official guidance and project context while allowing revision reuse. Artifact rules are not substituted for operation guidance. Neither instructions nor an `all_done` status authorize implementation or archive.

### D4: Release both hosts together

Build version 0.5.0 from one checkout and install the same package in Codex and Orca. Package tests must exercise the copied runtime, notices and native size limits. The running Orca worker must execute OpenSpec 2 under Electron; a host stand-in alone is insufficient evidence. A new Codex connection must load the updated tools and skill.

## Risks / Trade-offs

- Official instructions and subprocess task reads may cost more tokens/time. Preserve unchanged-context reuse and measure the actual change; do not shorten official requirements to improve a metric.
- Store-only projects previously looked empty or were accidentally initialized locally. They now fail explicitly. Select the store repository; do not remove its pointer to bypass the error.
- Existing dirty work predates this upgrade. Preserve it, record tested package identity, and do not claim a committed release.

## Migration Plan

Compare the last working 0.4.1 package (OpenSpec 1.14.2) with 0.5.0 on isolated fixtures. Cover create, instructions, validation, located task progress, reviewed archive, persisted board/review compatibility and cross-host conflicts. Require check, test, build, package verification, independent review and a mutation test. Install locally only after these pass, then record actual host evidence separately.

Retain the 0.4.1 release for rollback. This upgrade does not rewrite existing documents or private storage. Reinstalling it restores the prior runtime, but it lacks the new root guard and operation tool options; do not use it to initialize store-only projects. Planning history remains in this change; archive requires a separately authorized reviewed closeout.
