# Writing examples

These synthetic examples illustrate the policy. Preserve the official OpenSpec artifact structure; these are not replacement templates or universal project requirements.

## Replace a vague claim using known facts

Source: Accepted jobs must survive a worker crash. A durable write must finish before the API acknowledges a job. The team chose SQLite because there is one host and no database service to operate.

Weak text: "Leverage a robust persistence layer to seamlessly ensure reliable processing."

Specification:

```markdown
### Requirement: Durable job acceptance
The API SHALL acknowledge a job only after its durable write succeeds.

#### Scenario: Worker stops after acceptance
- **WHEN** a worker stops after the API acknowledges a job but before storing its result
- **THEN** the job remains available for processing
```

Design: "Use SQLite for accepted jobs. Deployment uses one host, and the team does not operate a database service. Revisit this decision if processing spans multiple hosts."

Task: "Implement durable acceptance and test worker termination against specs/jobs/spec.md, Requirement: Durable job acceptance. Follow design.md, Decision: SQLite storage. The test must show that the acknowledged job remains after restart."

The task references the contract. It does not copy the full specification.

## Preserve exceptions and uncertainty

Source: "Retry network failures at most three times with the same request ID. Never retry invalid credentials. We have not decided whether a timeout means the remote write failed."

Bad rewrite: "Retry failed requests safely."

Faithful rewrite: "Retry a network failure at most three times using the original request ID. Never retry invalid credentials. Open question: can a timed-out request have committed remotely? Resolve this before choosing timeout retry behavior."

Do not invent backoff intervals or assume that a timeout means failure. If "three times" is ambiguous about attempts versus retries, preserve the phrase and ask for that distinction before implementation.

## Preserve a changed decision and its reason

Original decision: "Write jobs to memory to avoid disk latency."

Accepted feedback: "The deployment restarts workers during upgrades; acknowledged jobs must survive."

Revised design: "Superseded: in-memory job storage, originally chosen to avoid disk latency. Use durable storage before acknowledging a job because upgrades restart workers. Measure the added acknowledgement latency; no latency budget has been agreed."

Update the linked specification and task. Keep the original review comment as authored, and record this accepted decision in the repository so another checkout can recover the reason.
