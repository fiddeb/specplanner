# Proposal

## Why

SpecPlanner 0.4.1 embeds OpenSpec 1.14.2. OpenSpec 2 adds store-aware root selection and a public task-location contract; adopting it without adapting initialization could silently redirect or split the project's planning record.

## What Changes

- Pin the official OpenSpec 2.0.0 runtime in SpecPlanner 0.5.0 and both installed host packages.
- Reject store-only redirection before creating a local planning directory. Require the planning repository to be selected explicitly.
- Expose official apply and archive instructions, including project operation guidance and reusable context.
- Read task progress and file/line locations from official JSON instead of importing an internal parser.
- Keep the single bundled SpecPlanner skill and durable English planning artifacts. Do not install duplicate OpenSpec commands or skills.

## Capabilities

### New Capabilities

- `planning-integration`: Explicit planning-root ownership, operation instructions and located task progress across both hosts. This is the first recorded baseline for these contracts.

### Modified Capabilities

None; this repository has no existing baseline specifications.

## Impact

The OpenSpec adapter, planning tool schema, bundled skill, dependency lock, release packaging and host installations change. Board and review storage formats stay compatible. External store pointers are rejected with guidance; select the store repository itself to work there. No public release or Git commit is part of this change.
