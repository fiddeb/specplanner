# SpecPlanner 0.4.0 verification

Historical evidence for the named release. For current setup, support and verification, see [README](../../README.md) and [0.5.0 verification](../validation-0.5.0.md).

Date: 2026-11-15. Local Node: 26.10.0. Installed Orca: 1.4.259. No commit, public release, or remote publication was created.

## Delivered behavior

The same package supports Codex MCP Apps and a native Orca HTML panel with a trusted Node worker. Both reuse the planning server and React views. The native worker calls the server through the official MCP SDK's in-memory transport, not a second process or model. Agent tools still use the included stdio server.

Orca resolves local workspace IDs through the host API, binds each frame independently, and rechecks the canonical path before tool execution. Arbitrary tool arguments cannot override that binding. Explicit personal storage is separate. Remote host paths are rejected. Bindings persist in Orca's own plugin storage so an idle worker restart does not force the user to discard drafts or reconnect to the currently focused project.

Native requests are chunked below Orca's 64 KiB request limit and 1 MiB response limit, with transfer count/size bounds, expiration, panel ownership checks, and one execution per transfer. Timeouts never cause an automatic mutation replay. The core still applies document identities, board revisions and archive-token checks. The OpenSpec subprocess explicitly enables Node mode when the worker runs under Electron.

Orca handoff prepares copyable text. Its documented plugin API does not provide structured-chat delivery, and reserved MCP contributions do not register tools for Codex. These are explicit support limitations in the README and panel.

## Local checks

- `npm run check`: passed.
- `npm test`: 58 tests passed, including four native adapter tests.
- `npm run build`: passed.
- `npm run verify:package`: passed from an isolated installation path with spaces. Tests exercise actual stdio and the shipped native worker with a host stand-in; each sees the other's saved board and rejects stale writes. The shipped official OpenSpec runtime creates a change through the worker.
- Native tests cover large Unicode scenes, escaped/control characters across chunk boundaries, separate projects, attempted caller-path overrides, changed workspace paths, remote-host rejection, explicit personal storage, persisted bindings after worker restart/focus changes, transfer ownership, offsets, replay, expiration, allocation limits, aborts, and cancelled connection races.
- A mutation experiment inverted the cross-panel ownership condition. Two native tests failed; restoring the condition returned all four to green.
- Generated Orca 1.4.259 frame/worker types were assigned to the adapter's narrow structural contracts in a temporary TypeScript check; it passed. Generated files remain ignored under `.orca/`.
- Independent review found and verified fixes for idle-worker recovery, cancelled connection attempts, and Electron subprocess execution. No remaining concrete Required or Critical finding was reported.

## Orca tooling versus actual host integration

- `orca plugin validate` and `inspect` on the release: passed. Both manifests identify version 0.4.0.
- `orca plugin check` on the release: passed validation. Its `panels` array is empty for this HTML panel; this is **not** a rendering test.
- `orca plugin test releases/specplanner-0.4.0 --json`: passed the shipped worker test using Orca's official `mountWorker` kit. Its host is still a stand-in.
- Running `orca plugin test .` on raw npm source is unsupported by Orca's build-less test loader: it rejects bare `zod` and `react` imports. Use `npm test` for source and the release directory for the Orca test kit. The production entries are bundled.
- The first complete release exceeded Orca's 2,000-entry limit. Packaging now omits dependency source/declaration/map files while retaining runtime JS, package metadata, templates, schemas and licenses. The builder checks entry count, total bytes, the 10 MiB HTML entry limit, and the 16 MiB limit for individual scripts/WASM. With offline fonts included, the final package is about 46.8 MB (44.6 MiB), below Orca's 50 MiB limit, with 1,268 files.
- After explicit user approval, the release was loaded as `local.specplanner` in the actual Orca 1.4.259 desktop host. The native HTML panel opened and resolved the current repository correctly.
- The actual Electron worker created a disposable OpenSpec change and passed strict validation. The panel refreshed the change list, opened the document, edited and saved its Markdown, and stored a comment anchored to the new revision.
- A drawing proposal created through real MCP was refreshed, previewed and applied in the native panel. The saved board returned revision 1. The prepared copy-to-Codex message identified that revision and workspace; no chat message was sent.
- The worker was restarted while a document draft was open. The draft and workspace binding survived; saving after restart succeeded. A packaged MCP client then read the exact edited document, comment and board, and rejected stale document and board writes.
- Actual rendering was inspected at 900 px and 420 px in the current dark theme. Screenshots reported no frame errors. Orca declined the light-theme override while its window was visible, so light-theme and live theme-switch verification remain outstanding.
- The initial run exposed blocked Excalidraw font requests. Local font paths still registered its external fallback. The final native bundle resolves all 230 font sources through a packaged data-URL registry split into five files below 4 MiB. The app script is below 16 MiB. The package verifier checks every registry reference and WOFF2 header. Native reload and rendering succeeded with no new font warnings; log cursor `0c377bdd:3` remained unchanged through final verification.
- An intermediate single font-embedded script exceeded Orca's 16 MiB checked-file limit and rendered blank despite successful manifest validation. Splitting the asset registry fixed the observed failure, and packaging now rejects that case.
- The temporary plugin was unloaded after testing. `orca plugin list` confirmed it was absent. The disposable OpenSpec change, generated configuration, board/proposal and document/comment history were removed after verifying their exact fixture identities. No existing planning data was replaced.
- Codex MCP protocol/package checks passed. Native conversation-panel placement and message delivery in the Codex desktop host remain unverified.

## Permissions

The Orca manifest requests `workspace:read` and `storage:own`, and contributes the SpecPlanner panel. Its `trusted-worker` profile executes code in a Node process with the user's filesystem access. The approval command is tied to the particular development directory and access fingerprint; the user explicitly approved this access before activation. The temporary development loading was removed after verification.

## Dependencies and remaining limitations

No dependency version changed for dual-host support. Pinned OpenSpec 1.14.2 and Excalidraw 0.18.1 remain in place; earlier 0.3 fixes and MIT license work are retained. The 2026-11-15 npm audit reports eight affected dependency entries: two low, four moderate and two high. Compared with the November 11 record, Hono and its Node server now also have advisories. HTTP server paths are not exposed by these stdio/in-memory integrations; no claim of an advisory-free dependency tree is made. The earlier Mermaid/nanoid and KaTeX findings remain. Review updates separately rather than applying a bulk breaking downgrade suggested by npm audit.

The current native bridge holds transient transfers in memory. A worker restart during an operation reports failure or an unknown outcome; inspect the saved revision before retrying. Saved boards, document histories and immutable workspace bindings survive. Old closed-panel binding records remain in Orca's private plugin storage; automatic retention cleanup is not implemented. Multiple chats using the same canonical repository intentionally share planning data.

The final independent review found no remaining Required or Critical issues after the per-script size fix. Token-efficiency contracts and their fixture measurements are unchanged from [0.3](validation-0.3.0.md). See [the README](../../README.md) for current installation instructions and supported behavior.
