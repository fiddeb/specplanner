# Planning integration

## Purpose

Keep planning documents, implementation guidance and task evidence tied to an explicitly selected repository across SpecPlanner hosts.

## ADDED Requirements

### Requirement: Explicit planning root
SpecPlanner SHALL use the selected repository as its planning root. It SHALL reject a config-only OpenSpec tree that resolves to another repository or cannot resolve, before creating local planning directories. Existing local specs or changes SHALL retain local precedence. An explicit create in an unconfigured repository SHALL initialize that repository; read operations SHALL NOT initialize it.

#### Scenario: Store-only project
- **WHEN** a selected repository has only an OpenSpec config declaring an external or unknown store
- **THEN** planning fails without creating local changes or modifying the store, with a diagnostic identifying the resolution problem or requiring explicit store-repository selection

#### Scenario: Unconfigured nested repository
- **WHEN** a user creates a change in an explicitly selected repository with no local OpenSpec configuration or planning tree
- **THEN** the change is created inside that repository, without following a parent tree or global default

#### Scenario: Existing local planning tree
- **WHEN** a selected repository already has local specs or changes and also declares a store
- **THEN** its local tree remains the planning root

### Requirement: Complete operation guidance
SpecPlanner SHALL expose official apply and archive instructions with project context and operation guidance. Revision reuse MAY omit unchanged context or writing policy only when the caller supplies its matching revision. Instructions and task completion SHALL NOT grant implementation or archive authorization.

#### Scenario: Apply and archive guidance
- **WHEN** the project config defines context, artifact rules and operation guidance
- **THEN** each operation receives its official instructions and its own guidance, without substituting artifact rules

#### Scenario: Reused project context
- **WHEN** the caller supplies a matching context revision from an earlier artifact
- **THEN** the operation omits only that unchanged context and retains its operation guidance; changing either invalidates the relevant revision

### Requirement: Located task evidence
Task status SHALL use official checkbox counts and expose each described pending task's relative source file and one-based line number. Missing or unreadable tracking evidence SHALL NOT be reported complete. Paths outside the selected change SHALL be rejected.

#### Scenario: Multiple task files
- **WHEN** a schema tracks several task files with completed, pending and description-free checkboxes
- **THEN** progress counts all official checkboxes and described pending tasks identify the exact file and line

#### Scenario: Missing evidence
- **WHEN** no tracked checkboxes exist or a tracking file is unreadable
- **THEN** task status is unknown and archive remains blocked without sufficient evidence

### Requirement: Shared host runtime
The Codex and native Orca packages SHALL ship the same pinned official OpenSpec runtime and SpecPlanner workflow skill. Upgrading SHALL preserve existing board revisions, documents and review histories. Host verification SHALL be reported separately from protocol and package tests.

#### Scenario: Local package upgrade
- **WHEN** both hosts install the same SpecPlanner release
- **THEN** new connections use that release's runtime and existing project data remains readable with stale-write checks intact
