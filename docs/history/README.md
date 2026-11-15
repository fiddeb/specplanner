# Verification history

These records describe the versions and checks named in each report. Their test counts, dependency findings, installation commands and unfinished work are historical. Use the [current README](../../README.md) for setup and [0.5.1 verification](../validation-0.5.1.md) for current evidence and limitations.

| Record | Retained evidence |
| --- | --- |
| [0.2.0 validation](validation-0.2.0.md) | Reviewed archive, bounded context, failure recovery and browser closeout checks |
| [0.3.0 validation](validation-0.3.0.md) | Review identity, license packaging, dependency assessment and pre-native Orca design constraints |
| [0.4.0 validation](validation-0.4.0.md) | Native Orca adapter, offline fonts, actual editing/proposal/restart flows and package limits |
| [0.4.1 validation](validation-0.4.1.md) | Planning skill, bounded comment fields, revision reuse and installed skill discovery |
| [0.1.8 to 0.2.0 measurements](context-measurements.md) | Byte-count method, reproduction commands and raw [before](context-before.json)/[after](context-after.json) captures |
| [0.3.0 measurements](efficiency-0.3.0.json) | Proposal and document payload token counts |
| [0.4.1 measurements](efficiency-0.4.1.json) | Repeated boards, shared instruction context and large review selections |
| [0.4.1 planning evaluation](planning-evaluation-0.4.1.json) | Synthetic writing/readiness outputs and description-only skill selection; no live model-routing claim |

Earlier host checks were recorded in the former README. On 2026-10-15, Codex CLI listed the local 0.1.0 plugin as installed and enabled, and its cached package passed isolated stdio verification. This did not establish native conversation-panel support. Before 0.2.0, a mocked MCP reader preview was inspected at 1280 px and in a 390 px iframe for formatted reading, navigation and draft retention. The 0.3.0 report retains the subsequent real-server MCP browser history inside Orca. These observations do not extend actual-host coverage to newer builds.

Current user behavior is documented in the [panel guide](../panel-guide.md); storage and recovery contracts are in [closeout and context](../closeout-and-context.md).
