# SpecPlanner

A planning plugin for Codex: OpenSpec documents, review comments, and an Excalidraw board beside the conversation.

## Development

Node.js 22 or later. Run `npm ci`, `npm run check`, `npm test`, and `npm run build`.
`npm start` runs the MCP server over stdio. Configure a local MCP client to launch `node /absolute/path/to/specplanner/dist/server.js`.

The plugin exposes `open_planner`, `read_board`, an app-only `save_board`, and workspace/OpenSpec tools, with a bundled React and Excalidraw panel through MCP Apps. A thread entrypoint is declared for hosts supporting OpenAI conversation panels. Actual installation and right-panel rendering in the desktop app must be verified; metadata alone does not prove host support.

## Agreed direction

- TypeScript for server, UI, and integration code; React and CSS for the panel.
- Codex is the agent. No Pi runtime or separate model credentials.
- Official `@excalidraw/excalidraw`, not the Factory fork.
- Sans-serif text, roughness zero, rounded boxes, and orderly straight connectors. Manual free drawing remains available.
- Official OpenSpec CLI with a pinned version; spec files remain in the selected repository's `openspec/` directory.
- Review comments and boards have persistent revisions. Never silently replace a newer revision.
- Implementation starts from an explicitly chosen reviewed version.
- One plugin package; project data lives outside the installed plugin.

## Next milestones

1. Verify local installation, MCP tool calls, and the native conversation panel in the actual desktop host.
2. Verify repository-scoped boards and OpenSpec in the installed panel.
3. Verify document editing and revision-aware comments in the installed panel.
4. Verify drawing proposals and chat handoff in the installed host, then transfer selected document content to the board.
5. Exercise the full planning-to-implementation handoff.

The current panel supports repository-scoped drawing boards, OpenSpec change creation, document reading, and strict validation. Existing Markdown documents can be edited and reviewed with comments anchored to saved revisions. Drawing proposals can be reviewed and explicitly applied. Agent proposals for document edits remain unimplemented.

## Local plugin discovery

A repo-scoped marketplace is included in `.agents/plugins/marketplace.json`. Open this repository as a project in the desktop app, restart the app, and look for the `specplanner-local` source in the Plugins Directory. Build and install dependencies before attempting installation. The marketplace has been registered and the plugin installed and enabled with the bundled Codex CLI. Conversation-panel placement remains unverified.

References: [plugin packaging](https://developers.openai.com/plugins/build/plugins), [local MCP configuration](https://developers.openai.com/plugins/deploy/desktop-only), [conversation panels](https://developers.openai.com/plugins/build/extensions).

## Language

English is the project and product language, including the interface, design documents, specifications, diagram labels, and release notes. Feedback can be given in Swedish; resulting content is written in English. Original user comments are retained unchanged for review history.

## Dependency updates and releases

Use exact dependency versions and commit the lockfile. The agreed maintenance workflow is a weekly dependency check that opens update pull requests, using Renovate or an equivalent repository service. Each SpecPlanner release ships a tested combination of OpenSpec, Excalidraw, and MCP dependencies. Dependency updates must not be merged automatically.

Before releasing an OpenSpec update, verify creation, reading, and validation of specifications, compatibility with existing projects, and any changes needed in the adapter or planning skill. Compatible updates can ship in a patch release. Changes to workflows or document formats require an explicit compatibility review and an appropriate release version.

Updating the plugin must not silently rewrite existing specifications. Any required migration is a separate, reviewable step with a diff.

Status: this is the agreed release policy. Scheduled checks and release automation have not yet been configured; OpenSpec is pinned to 1.14.2. Excalidraw is pinned to 0.18.1.

## Standalone package and verification

Run `npm run verify:package` to build `releases/specplanner-0.1.0/` and test it from a temporary installation directory containing spaces. The package bundles its JavaScript dependencies; only Node.js 22 or later is required at runtime. The test exercises the actual stdio handshake, discovery, tool call, and UI resource loading using only the shipped files. The official OpenSpec CLI and its runtime dependencies are copied into the release with their original package layout, including schemas and licenses.

For local installation testing:

1. Add this repository as a project in the desktop app.
2. Restart the app and open the Plugins Directory.
3. Select the `specplanner-local` source and install SpecPlanner if it is listed.
4. In a local chat, ask the agent to call `open_planner`.
5. Verify that the panel opens beside the conversation, reports a host connection, and supports switching between Plan, Board, and Decisions.

If the source or panel is unavailable, record the app version and the observed behavior. A successful stdio test does not establish that the desktop host supports the native panel entrypoint.

Verified locally: TypeScript checks, MCP protocol test, standalone package startup and tool/resource round trip, English panel rendering, and navigation among all three views in the in-app browser. Native plugin installation and conversation-panel rendering remain unverified: computer-use access to the Codex app is blocked by its safety policy. The browser check was a standalone preview, not an installed MCP App.

## Local installation status

The bundled Codex CLI successfully registered and installed the local plugin on 2026-10-15:

```sh
codex plugin marketplace add /absolute/path/to/specplanner --json
codex plugin add specplanner@specplanner-local --json
codex plugin list --marketplace specplanner-local --json
```

The marketplace points to `./releases/specplanner-0.1.0`, not the development tree. The installed copy is under `~/.codex/plugins/cache/specplanner-local/specplanner/0.1.0`. CLI listing confirmed `installed: true` and `enabled: true`. The full stdio verification also passed against this installed copy, using disposable repository and board data.

To repeat verification against an installed copy without replacing it:

```sh
SPECPLANNER_VERIFY_INSTALL=/absolute/path/to/installed/plugin npx tsx scripts/verify-package.ts
```

The current chat did not discover the new tools after installation. Restart the desktop app, reopen the chat, and ask to open SpecPlanner. If tools are still absent, inspect the plugin's enabled state and MCP startup errors. No production repository has been configured yet. Native panel rendering and chat-message delivery remain unverified; successful CLI installation and protocol tests do not establish those behaviors.

## Appearance

Use the host-provided MCP Apps theme and style variables for panel colors, typography, and control radii. Apply both initial host context and live theme changes. Standalone previews use neutral light/dark fallbacks based on the system preference; these approximate the host and do not verify its exact palette.

## Drawing board

The Board tab embeds official Excalidraw 0.18.1. New shapes use zero roughness, rounded corners, solid fills, and one-pixel strokes; new text uses Helvetica. Arrows default to straight segments. The Add example action demonstrates the same style with two labelled boxes and a connecting arrow. The panel itself uses host font and color tokens; diagram text currently uses Excalidraw's built-in Helvetica family.

Use Save board to persist changes. Switching panel tabs preserves the draft. Reload saved asks before discarding an unsaved draft. Unsupported image/embed elements and scenes larger than the configured limit are rejected on save, leaving the editor content intact.

In the installed MCP panel, the personal board is stored under `~/.local/share/specplanner/personal-board/`, or under `SPECPLANNER_DATA_DIR/personal-board/` when that environment variable is configured. When `SPECPLANNER_WORKSPACE` is configured, boards instead use `workspace-<SHA-256 of canonical repository path>/` in that data directory. Chats using the same repository share the board; conversation isolation is not implemented. Each save publishes an immutable revision file. Competing writes from the same revision cannot both succeed; older revisions remain available on disk. Agent-facing tools can read the board; save is advertised as app-only. Codex can submit drawing proposals; the panel previews them and advertises application as app-only.

The standalone browser preview uses separate localStorage and is clearly labelled. It does not communicate with the MCP server. Its revision check is best-effort across browser tabs; the atomic concurrency guarantee belongs to the MCP file store.

Verified: creating an example, manual save, browser reload retaining the scene and saved revision, persistence across store instances, stale-write rejection, concurrent writers, invalid scene rejection, and real stdio read/save/conflict calls from an isolated package. Native installed-panel rendering remains unverified.

### Dependency audit

Installing the pinned Excalidraw and OpenSpec versions reports 17 npm audit findings (2 low, 6 moderate, 9 high), including Mermaid-related packages, lodash-es, nanoid, and Sass/chokidar/braces. The automatic recommendation is a downgrade to 0.17.6, not a verified compatible patch. These findings remain unresolved and need dependency review before release. No public release or deployment has been made.

## Repository and OpenSpec connection

Pass the current Codex project's absolute directory as `workspacePath` to `open_planner` and subsequent tools. Codex obtains this path from the chat's project context; the server must not infer it from its own working directory, which is the plugin installation. The directory must contain `.git` (a directory or worktree file). The open result supplies the canonical directory to that panel, and the panel binds every tool call to it. There is no shared mutable workspace selection.

When no project directory is available, the panel offers an absolute repository-path field or the personal board. This is path entry, not a native OS folder picker. An optional `SPECPLANNER_WORKSPACE` remains a legacy default for calls that omit `workspacePath`; explicit paths override it, and explicit `null` selects the personal board. Changing repositories does not require changing environment variables or restarting the server. Open a panel for the desired project; already opened panels retain their own binding.

The Plan tab lists changes, creates a named change with the official `spec-driven` schema, reads Markdown documents, and runs strict validation. `planning_instructions` supplies official proposal, design, specs, or tasks instructions to Codex. Creating a change scaffolds metadata; Codex still writes the actual documents through its normal repository tools. The panel can edit existing Markdown documents and attach comments to selected text or the whole document.

OpenSpec runs through Node with fixed argument arrays, a timeout, bounded output, and telemetry disabled. Within the explicitly selected repository, creation establishes a local `openspec/changes/` directory so an ancestor root or global default store cannot capture the command. Other commands require that local directory. Symlinks in the OpenSpec tree are rejected. These checks are workspace boundaries for normal local use, not an OS sandbox against concurrent malicious filesystem changes. No tool exposes arbitrary shell commands, archive operations, or implementation execution.

Local tests cover the real pinned CLI, nested repository isolation, unsafe identifiers, symlink rejection, duplicate creation, document reading, and packaged stdio creation/instructions/validation. Native panel integration still requires host verification.

## Document editing and review

Open an existing document in Plan, edit its text, and choose **Save document**. Each read returns a SHA-256 content revision. Saving requires that revision to match the current file. A conflict retains the UI draft; **Reload saved** asks before discarding unsaved edits. Switching changes, creating another change, and refreshing are disabled while document or comment drafts exist. Tab switching keeps the editors mounted.

Select text in the document field and write a review comment, or leave no selection for a document-level comment. Save edits before commenting. Comments preserve the original language and text, the selected quote, UTF-16 selection offsets, creation time, and the exact saved revision. Older comments are labelled **Earlier version** and are never silently re-anchored. Codex can read these comments through `read_document`; writes are advertised as app-only tools. Tool visibility depends on host enforcement and is not a server authentication mechanism.

Snapshots and comments live outside the repository, under `SPECPLANNER_DATA_DIR/workspace-<hash>/documents/` (or the default local data directory). Markdown edits update the actual repository file. Content snapshots are retained, but a history browser, comment resolution, and new-document authoring in the UI are not implemented yet.

Plugin saves use an exclusive `openspec/.specplanner-write-lock` directory shared across server processes and atomic file replacement. Stale content is checked again immediately before replacement. External editors do not honor this lock: an external write in the final check/rename window is not covered by an atomic compare-and-swap guarantee. If a process crashes during a save, the lock may remain; after confirming no save process is running, remove that empty lock directory before retrying. The plugin does not automatically remove an unknown active lock.

Verified locally: comment persistence and original-language retention across restart, revision anchoring after edits, immutable snapshots, competing plugin writers, stale external edits, invalid selections/revisions, traversal and symlink rejection, plus real packaged stdio read/comment/save/conflict calls. The new editor's interaction and rendering in the installed native panel remain unverified.

## Drawing with Codex

Codex uses the existing conversation model; the plugin does not run another LLM. Ask in chat for a drawing, or use **Request drawing** below the board with a description. The installed panel sends a user message through MCP Apps `sendMessage`, identifying the workspace and saved board revision. The agent reads the scene with `read_board`, then calls `propose_board` with a base revision, an English summary, and the complete proposed Excalidraw scene. Existing content should be preserved unless the request calls for replacement. Proposal creation never changes the saved board.

Choose **Refresh proposals**, open a proposal, inspect its read-only drawing preview, and choose **Apply to board**. This saves a new board revision using the proposal stored on the server. Unsaved local changes disable application. Outdated proposals are disabled in the panel and rejected by the server. Repeated or competing applications cannot both publish a revision. Proposals are retained on disk; the panel labels them outdated when their base no longer matches. Dismissal/archive controls are not implemented yet.

After manual drawing changes, save the board, describe what you want to discuss, and choose **Discuss changes**. The message points Codex at that exact saved revision. `read_board` accepts an optional revision so later edits cannot change the referenced scene. This is an explicit handoff: moving a shape does not invoke the model. The discussion request asks for review before changes, but this prompt is not an authorization boundary for Codex's other repository tools.

The handoff uses the host's supported message API. If it fails or is rejected, the panel retains a prepared message to copy into chat; check whether it arrived before retrying after a timeout. The standalone browser preview has no MCP connection and therefore cannot request drawings, read server proposals, or send messages to Codex.

Verified locally: proposal persistence, unchanged board before application, stale/repeated/competing application rejection, exact revision reads, tool visibility metadata, and packaged stdio proposal/list/apply/history calls. Native preview interactions and host message delivery still require installed-host verification. App-only metadata relies on host enforcement and does not authenticate callers at the server.

## Planning writing policy

`planning_instructions` returns the official OpenSpec instructions unchanged in their original fields, plus `specplannerWritingPolicy`. The policy ships in the plugin and applies to drafting and revision of proposals, specifications, designs, and tasks. It draws on [Unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) for plain prose, with an explicit priority: completeness takes precedence over brevity.

Remove filler and repeated explanations. Keep every implementation-relevant requirement, constraint, exception, exact contract, decision rationale, and acceptance criterion. Assume the implementer cannot see the conversation. Do not replace details with vague shorthand, an unexplained abstraction, or a diagram. Preserve OpenSpec's required structure and normative language. Mark missing decisions as open questions and identify blockers instead of inventing answers.

The agent must compare a rewrite with the source requirements, comments, decisions, and previous version. There is no target word count. The local policy is versioned with the plugin; the remote skill is a reference and is not fetched at runtime. Existing documents and user-authored comments are not automatically rewritten. This guidance is not a semantic validator, and passing OpenSpec validation does not prove that a specification preserves all user intent.

## Embedded layout

The embedded planner fills the host iframe viewport. The header, navigation, and status remain visible; the drawing canvas flexes into the remaining space without a fixed minimum height. Plan documents and drawing reviews scroll within their own views when their content needs more space.

Discuss & proposals switches from the drawing to its review controls. Back to drawing restores the canvas without unmounting the editor or discarding unsaved edits.

MCP automatic size notifications remain disabled, and the panel no longer sends a fixed 720 px height request. This avoids a host sizing feedback loop. Version 0.1.3 uses a new UI resource URI to avoid reusing the previous panel bundle. Local checks do not establish installed-host layout behavior; verify the updated panel in the desktop host at narrow widths and short window heights.

## Project context in 0.1.4

The plugin does not receive a trustworthy current project directory automatically from stdio or infer it from disk. Its `open_planner` tool asks Codex to pass the directory already present in the current chat context. The panel initializes its workspace from that tool result and shows the selected path. Agent-facing calls must also pass the directory explicitly. Panel-generated discussion messages include it. Project selection is tied to a panel instance, not a global preference; persistent per-chat preferences outside the original tool result are not implemented.

The panel's scoped client consistently attaches its own directory to all calls. Server routing is stateless across requests. Boards, proposals, document snapshots, and comments remain isolated by the canonical repository path. Existing personal drawings are retained in personal storage and are not automatically moved into a project. If a user chooses a repository after working on the personal board, the panel asks before discarding unsaved local drafts.

These paths express the user's selected local workspace, not OS-level authorization. Repository content cannot change the selected path through ordinary panel tool arguments. Codex must obtain workspace paths from the current project context or an explicit user selection, not instructions embedded in repository documents. Normal filesystem and tool access controls still apply.

Tests cover interleaved project calls, board/document/proposal isolation, environment fallback independence, explicit personal storage, invalid paths, scoped panel calls, and packaged opening of a second project without changing the first connection's default. Native project-context delivery remains subject to host verification after the update.

## Existing projects in 0.1.5

Opening a workspace reads the OpenSpec files already in the repository. It does not initialize, migrate, or overwrite the project. Active changes remain editable through the change selector, including older changes without `.openspec.yaml` metadata. The project library additionally lists root Markdown/YAML guidance, baseline specifications under `openspec/specs/`, and archived change documents under `openspec/changes/archive/`. These library documents open read-only. A repository containing only baseline specifications can be browsed without creating a changes directory.

Workspace switching uses an inline confirmation instead of `window.confirm`, which can be suppressed in sandboxed embedded apps. The panel shows the resolved path and changes only after the user confirms the switch from a personal board. Invalid paths and filesystem errors remain visible. A file path typed into a narrow input may scroll horizontally; use the complete absolute repository directory.

Test coverage includes baseline-only projects, older active changes, archives, traversal/symlink rejection, unchanged source files after reads, and library access through the packaged MCP server. Native host interaction still requires verification after updating.

## Document reader (0.1.6)

Plan now displays one document at a time with rendered Markdown headings, lists, tables, and code. Wide panels show the document browser beside the reader; panels below 1000 px switch between browsing and reading. The reader fills the available host height and scrolls internally, without requesting iframe size changes. The introductory hero is removed to leave more room for documents.

Use **Edit / select text** for source editing and range comments. Visited documents retain unsaved drafts when switching between files. Save or explicitly discard drafts before changing the active change or refreshing. Existing project guidance, current specifications, and archived documents remain read-only. Rendering does not rewrite source files, execute embedded HTML, or fetch remote images.

Verified in a local mocked MCP preview at 1280 px and in a 390 px iframe: formatted reading, narrow document navigation, and draft preservation between files. Unit tests cover Markdown content preservation and unsafe markup. Installed Codex host sizing still needs verification after reopening the updated plugin.

## Reader review controls (0.1.7)

Active change documents now expose sticky comment actions above the reader. Select a passage with the pointer or keyboard and choose **Comment on selection** to open and focus the review form. Exact, unique text matches are anchored to the saved Markdown revision using UTF-16 offsets. Ambiguous text or selections spanning Markdown syntax require selecting the passage in **Edit / select text**; the UI blocks submission rather than guessing an anchor. Save document edits before commenting. Project guidance, baseline specifications, and archives remain read-only without review controls.

Selection matching is unit-tested, and document persistence and revision behavior remain covered by store and package tests. Native host selection interactions still require verification. This release does not fix workspace detection when opening through the + menu.

## Opening from the + menu (0.1.8)

A thread entrypoint invokes the server with empty arguments. When no explicit workspace or environment fallback exists, `open_planner` now creates a unique, expiring connection request for that panel. After connecting, the panel sends one visible message to the current chat asking Codex to call `connect_workspace` with the request ID and the trusted current project path. The panel polls `workspace_connection` and binds its tool client to the returned canonical directory. It does not open a second panel. This is an agent-assisted fallback, not direct host project discovery; it can consume an agent turn and depends on host message support and agent availability.

Connection records are local, persist across server instances, expire after ten minutes, and accept only one workspace. Concurrent panels have different requests; there is no global last-used project. Explicit project and personal-board opens skip the handshake. A null response means the chat has no project. The panel waits up to two minutes, then shows an error and manual repository selection. Closing the panel or selecting a workspace stops polling. Expired connection record files are retained locally under the plugin data directory.

Verified locally: the empty-argument launch/connection/poll sequence over MCP, independent simultaneous panels, competing bindings, expiry, and personal-board behavior. The actual + menu, host message delivery, and agent completion still require an installed-host test.
