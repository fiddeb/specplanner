# SpecPlanner 0.5.1 verification

## Scope

This patch packages the existing Codex/MCP and native Orca integrations for external distribution. It includes the previously verified panel-connection validation, stricter static checks and documentation cleanup. Official Excalidraw 0.18.1 and OpenSpec 2.0.0 remain pinned. No model runtime, credential handling or new host integration is introduced.

Version strings in the server, worker and panels now come from `package.json`. The package includes its source commit and dirty-checkout status in `build-info.json`. Release archiving refuses uncommitted sources or a package from another commit. The downloadable archive contains its own Codex marketplace with a local `.` source, so installation does not require building the source repository. CI retains the archive and SHA-256 checksums for each supported Node version.

## Dependency corrections

The `npm audit` before publication reported eight affected package entries: two high, four moderate and two low, including parent entries. These were dependency advisories, not eight demonstrated SpecPlanner vulnerabilities. Exact overrides now select:

| Package | Before | Selected version | Reason |
| --- | --- | --- | --- |
| `body-parser` | 2.3.0 | 2.4.0 | Compressed-body crash correction |
| `hono` | 4.13.13 | 4.13.16 | Routing, middleware and validation corrections |
| `@hono/node-server` | 2.1.5 | 2.1.6 | Path parsing and WebSocket error handling |
| Converter's `nanoid` | 4.0.2 | 5.1.16 | ID-generator size/overflow corrections |
| `katex` | 0.16.47 | 0.18.2 | Prevent prototype-polluted settings from bypassing trust |

The converter uses the ESM `nanoid()` API without a caller-supplied size. The overridden copy produced 100 distinct default-length IDs in a local compatibility check. Mermaid calls `katex.renderToString`; both `mathml` and `htmlAndMathml` modes rendered a fractional expression, and an untrusted JavaScript link remained rejected. The existing 68-test suite and type checking passed after the HTTP dependency corrections. A subsequent npm installation reported zero known vulnerabilities. Final package, host and CI evidence is recorded below before publication. This is dependency remediation and compatibility verification, not a comprehensive security audit.

Reviewed upstream releases: [body-parser 2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0), [Hono 4.13.16](https://github.com/honojs/hono/releases/tag/v4.13.16), [node-server 2.1.6](https://github.com/honojs/node-server/releases/tag/v2.1.6), [nanoid 5.1.16](https://github.com/ai/nanoid/releases/tag/5.1.16), [KaTeX 0.18.2](https://github.com/KaTeX/KaTeX/releases/tag/v0.18.2). Lockfile review found only these five package-version changes; existing transitive versions already satisfy the updated ranges. The nanoid 3 override remains 3.3.18.

## Release acceptance

On macOS arm64 with Node 26.10.0, `npm run check`, all 68 existing tests and `npm run verify:package` passed after all dependency and runtime-version changes. The isolated package verifier exercised the self-contained marketplace, build provenance, licenses, real MCP stdio, official OpenSpec and the shipped Orca worker against a host stand-in. Orca's packaged worker test and manifest checks also passed. The archive command refused the dirty checkout before any tarball was created, as intended.

In the actual Orca 1.4.259 host, the approved 0.5.1 development load bound to the selected repository, created and strictly validated a disposable OpenSpec change, saved a document and original comment, rejected stale document and board writes, and retained the exact document/comment, unchanged board and original project binding after worker restart. The test change was removed. The connected dark panel rendered at 900 px with no capture errors and displayed version 0.5.1. This is actual host evidence, distinct from the test-kit stand-in. It does not establish light-theme coverage or a second person's installation.

The host-tested MCP server SHA-256 is `8d3877eeeecbd9723bea3e4fdad4d035c1b6afb97b7bf1e614ff38d05e71ca86`; the Orca worker SHA-256 is `a8892651cdfecc5593162bf7124e768f5d769edc199f541b3a2075b80d4ef80d`. Supporting local observations are in `/private/tmp/specplanner-051-native-flow.json` and `/private/tmp/specplanner-051-native.png`; those temporary files are not required to interpret the recorded outcomes.

The [candidate CI run](https://github.com/fiddeb/specplanner/actions/runs/43748787863) passed on Ubuntu for Node 22.13.0, 24 and 26 at source commit `8a8652f853fb2c07c5748c02cd553008bb0fbbfe`. Every job completed clean dependency installation, type checking, all 68 tests, package/build verification, npm audit with zero known vulnerabilities, guarded release archiving and artifact upload. The downloaded Node 24 archive passed its checksum; its server and worker hashes exactly match the host-tested bytes above. Later documentation-only commits retain those runtime hashes. The final release's `build-info.json` and `SHA256SUMS` identify its exact source revision and archive.

A clean extraction of the local archive into a separate directory containing spaces passed the complete installed-package verifier. Its self-contained marketplace installed and enabled SpecPlanner 0.5.1 in Codex. The actual cache copy passed the same isolated protocol/package checks and matched the server hash above. A fresh Codex app-server discovered the enabled `specplanner:specplanner` skill from the 0.5.1 cache and the SpecPlanner MCP server with 23 tools. No model invocation was used for discovery.

The same extracted archive installed in Orca as a standard non-development plugin. After removing the development load and approving the standard installation, its panel connected to the original project, displayed saved board revision 0 and version 0.5.1, and rendered without capture errors. Existing project data was retained. The source move from a development/release directory to an extracted archive requires Orca's normal approval, even when the requested capabilities are unchanged.

The public distribution is a GitHub release with a built tarball and checksums. GitHub's automatic source archives omit compiled assets and are not the installable package. Private vulnerability reporting is enabled on the repository. Publication and fresh installation do not establish Codex desktop panel placement or another person's machine; those remain outside the evidence above.

## Limits

The verified native-host environment is Orca on macOS with local repositories. Codex MCP protocol and skill discovery can be verified independently; Codex desktop conversation-panel placement remains unverified. Remote Orca repositories are unsupported. Light-theme rendering has not been established by earlier checks. Manual reconciliation can be needed after external filesystem races or interrupted archive identity binding. Keep repositories and private SpecPlanner data together in backups; see [storage and recovery](closeout-and-context.md).

Earlier upgrade, migration and host evidence remains in [0.5.0 verification](validation-0.5.0.md) and [verification history](history/README.md). Historical evidence does not automatically extend to this build.
