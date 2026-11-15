# Tasks

## 1. Runtime and root ownership

- [x] 1.1 Implement [Explicit planning root](specs/planning-integration/spec.md#requirement-explicit-planning-root) following [D1](design.md#d1-select-the-planning-repository-explicitly); test store-only, malformed config, local precedence and nested initialization without outside writes; document the selection contract.
- [x] 1.2 Pin and package OpenSpec 2.0.0 under [D4](design.md#d4-release-both-hosts-together); verify the lockfile, copied runtime, licenses and Orca size limits.

## 2. Guidance and task evidence

- [x] 2.1 Implement [Complete operation guidance](specs/planning-integration/spec.md#requirement-complete-operation-guidance) following [D3](design.md#d3-keep-one-workflow-skill); test operation-specific guidance and context invalidation; update the skill and measure instruction payloads.
- [x] 2.2 Implement [Located task evidence](specs/planning-integration/spec.md#requirement-located-task-evidence) following [D2](design.md#d2-use-public-operation-json); test multi-file tracking, blank descriptions, missing evidence and invalid paths; preserve reviewed archive behavior.

## 3. Acceptance and installed hosts

- [x] 3.1 Verify [Shared host runtime](specs/planning-integration/spec.md#requirement-shared-host-runtime) and [D4](design.md#d4-release-both-hosts-together): run check, test, build and isolated package verification; compare 0.4.1 and 0.5.0 fixtures, obtain independent review and demonstrate a failing guard mutation. Save results and limitations in verification.md.
- [x] 3.2 Install 0.5.0 globally in Orca and Codex; verify actual Orca OpenSpec execution and new Codex tool/skill discovery, preserving existing project data. Record exact package identity and distinguish actual-host evidence from stand-in tests.
