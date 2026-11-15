# SpecPlanner

Plan and review software with **Codex**, in either **Orca** or a **Codex MCP Apps host**. SpecPlanner combines OpenSpec documents, revision-aware review comments, and an official Excalidraw drawing board.

One repository and one versioned package contain both integrations. Codex is the agent in both; SpecPlanner runs no model and needs no separate model credentials. Both panels share the same React views, planning tools, storage format, and revision checks.

## Host support

| Capability | Codex / MCP Apps | Native Orca plugin |
| --- | --- | --- |
| Agent tools | MCP stdio server | Configure the same MCP server for Codex in Orca |
| Interactive UI | MCP Apps panel; placement depends on the host | Native sidebar HTML panel and Node worker |
| Project selection | Explicit `workspacePath` from this chat; manual entry fallback | Selected local Orca repository, resolved through the host API |
| Drawings, proposals, documents, reviews and archive | Shared planning core | Same planning core, called in memory |
| Drawing requests and discussion | Host message API, with copy fallback | Prepare a message to copy into Codex |
| No selected repository | Explicit personal board | Explicit personal board |
| Remote repositories | Run MCP on the repository's machine | Local repositories only in this release |

The native Orca panel does not register MCP tools for an agent. Orca currently reserves plugin `mcpServers` contributions; configure the included MCP server separately. There is no documented native API for sending to structured chats, so the Orca panel offers explicit copying.

## Download the release

Download `specplanner-0.5.1.tar.gz` and `SHA256SUMS` from [GitHub Releases](https://github.com/fiddeb/specplanner/releases/tag/v0.5.1). Use the built archive; GitHub's automatic source archives do not contain the compiled plugin.

On macOS:

```sh
shasum -a 256 -c SHA256SUMS
tar -xzf specplanner-0.5.1.tar.gz
```

On Linux, use `sha256sum -c SHA256SUMS`. The extracted directory contains both host integrations, a local Codex marketplace, runtime dependencies, license notices and `build-info.json` with the source commit. A supported Node.js installation is required; no npm install or build is needed in this directory. Orca on macOS is the verified native host; protocol/CI checks on Linux do not establish native Linux host support.

## Build and verify from source

Use Node.js 22.13+ in the 22.x line, or Node.js 24+.

```sh
npm ci
npm run check
npm test
npm run verify:package
```

`check` type-checks source, scripts and npm tests, and rejects unused declarations, implicit missing returns, missing override markers, switch fallthrough, unresolved side-effect imports, unreachable code and unused labels. The project has no separate linter.

`verify:package` builds `releases/specplanner-0.5.1/`, then tests the shipped files from an isolated directory with spaces in its name. `build-info.json` identifies the source commit and whether the checkout was dirty. After committing the release sources, rebuild/verify and run `npm run release:archive` to create the tarball and `SHA256SUMS`; it refuses a dirty or stale package. CI runs the checks on Node 22.13, 24 and 26 and retains an archive from each job.

With Orca installed, also run `orca plugin test releases/specplanner-0.5.1 --json` and `orca plugin check releases/specplanner-0.5.1 --json`. Use the packaged directory for Orca's test runner; use `npm test` for npm source tests.

Native Orca checks and their exact build identities are recorded separately from protocol/package tests. Codex desktop conversation-panel placement remains unverified.

Protocol and package tests cover real MCP stdio and the shipped Orca worker against a host stand-in, including shared storage and cross-host revision conflicts. See [0.5.1 verification](docs/validation-0.5.1.md) for release evidence and limitations.

## Use with Orca

Requires Orca **1.4.246 or later**. Download and extract the release above, then use its absolute directory:

```sh
orca plugin validate /absolute/path/to/specplanner-0.5.1 --json
orca plugin inspect /absolute/path/to/specplanner-0.5.1 --json
orca plugin install /absolute/path/to/specplanner-0.5.1 --json
orca plugin open local.specplanner --panel planner --json
```

Review the access shown by Orca and follow its exact approval command. SpecPlanner requests workspace metadata and its own storage, and runs a trusted Node worker with your account's filesystem access. The worker reads and writes planning files through the same validated core as the MCP server. The native panel includes Excalidraw font assets and works within Orca's network restrictions. The package is about 45 MiB, with each script kept below Orca's 16 MiB limit.

The installed plugin is available across projects and persists across Orca restarts. Orca keeps an installed copy, so editing or rebuilding the source does not update that copy. Re-run `orca plugin install` on the rebuilt release to install an update, and review any new approval request. Use `orca plugin dev load` only when developing the plugin.

Select a local Git repository in Orca before opening the panel. It binds to that repository and does not follow later focus changes. To change projects, save your drafts and reopen the panel in the desired workspace. A folder without `.git` is not a repository; the personal board remains available. Bindings survive idle worker restarts in Orca's plugin storage.

Configure Codex's MCP connection to launch:

```text
node /absolute/path/to/specplanner-0.5.1/dist/server.js
```

Install the same package as a Codex plugin below to make both the MCP tools and planning skill available to the agent. A native Orca install alone registers neither agent tools nor skills. If you configure MCP manually instead, also load `skills/specplanner/SKILL.md` from the release in your agent's skill loader, or explicitly ask the agent to read that file for the task. Pass the current chat's trusted absolute directory as `workspacePath` on every SpecPlanner tool call. Both connections must use the same local account and data directory to share boards and reviews.

## Use with Codex

The extracted release includes `plugin.json`, `mcp.json` and a marketplace that points to that same directory. With a Codex CLI supporting plugin marketplaces:

```sh
codex plugin marketplace add /absolute/path/to/specplanner-0.5.1 --json
codex plugin add specplanner@specplanner-local --json
codex plugin list --marketplace specplanner-local --json
```

Restart the host if needed to discover newly installed tools. Ask Codex to call `open_planner` with this chat's project directory as `workspacePath`. Any MCP client can use `dist/server.js`; interactive rendering additionally requires MCP Apps support. A successful CLI installation or tool call does not establish conversation-panel support.

For source development, the repository's marketplace instead points to `releases/specplanner-0.5.1/`; build it before registering the repository directory as a marketplace. Register the source checkout or the extracted release, according to which copy you intend to use.

If `specplanner-local` is already registered from another directory, run `codex plugin marketplace remove specplanner-local --json` before adding the chosen directory. This changes the marketplace registration; repository planning files and private boards/reviews remain in their existing locations.

References: [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins), [local MCP configuration](https://developers.openai.com/plugins/deploy/desktop-only), [Orca plugin authoring](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-authoring.md).

## Planning and review

- **Board:** draw manually, save revisions, ask Codex for a proposal, inspect it, and explicitly apply it. Proposals never modify the saved board automatically. Unsaved drafts and stale revisions prevent accidental replacement.
- **Plan:** create an OpenSpec change, read project guidance and specifications, edit existing Markdown, and add comments anchored to the saved content and change identity. Original comments retain their language and text.
- **Closeout:** inspect task status and an archive preview, review dependencies and specification diffs, supply verification evidence, and explicitly apply the reviewed archive. Implementation authorization remains outside prompts.
- **Decisions:** points to each change's `design.md` in Plan, where decisions and their reasons belong. Dedicated decision editing, new-document authoring in the UI, and agent document-edit proposals are not implemented.

See the [panel guide](docs/panel-guide.md) for editing, review comments, drawing proposals, draft handling and chat handoff.

All project content is English. Swedish feedback is incorporated into English output; original review comments remain unchanged. The [planning contract](docs/planning-contract.md) defines the durable record: proposals explain why, specifications define behavior, designs retain decisions and tradeoffs, and tasks link those contracts to acceptance checks. Accepted chat and review decisions must be incorporated into repository artifacts.

The Codex plugin install discovers the bundled [SpecPlanner skill](skills/specplanner/SKILL.md). Before drafting, revising or implementing a plan, it reads the complete writing policy through `planning_instructions`. That tool also works before a change exists. With a change selected, `artifact: "apply"` and `artifact: "archive"` provide OpenSpec 2 operation guidance; task status includes source files and one-based line numbers. SpecPlanner owns its separately named skill, so its installation does not run `openspec update` or install duplicate upstream skills or commands. Remove filler while retaining requirements, exceptions, rationale and open questions. Completeness takes precedence over brevity. Validation and task checkboxes do not establish semantic completeness or implementation correctness.

## Storage and boundaries

OpenSpec documents live in the explicitly selected repository's `openspec/` tree. For an external OpenSpec store, select that store repository itself. A config-only tree pointing elsewhere is rejected before initialization; existing local specs or changes retain local precedence. Creating a change in an unconfigured repository initializes that repository, without following a parent tree or global default. Drawings, immutable revisions, and review histories live in `~/.local/share/specplanner/`, keyed by the canonical repository path, with separate personal storage. The MCP server supports `SPECPLANNER_DATA_DIR` for custom deployments; the native worker normally uses the default location. Do not commit that data or credentials.

Every MCP call takes explicit `workspacePath`; `null` selects personal storage. Omission uses only the optional legacy `SPECPLANNER_WORKSPACE` default. The native adapter ignores caller-supplied paths, resolves workspace IDs through Orca, rejects remote hosts, and rechecks the original path before execution. No server-wide workspace selection is mutated.

Document writes require the saved revision and change identity. Drawing saves require the base revision. Archive uses a reviewed token and detects changed inputs. Both hosts share these checks. OpenSpec commands use fixed arguments, bounded output, timeouts, and disabled telemetry. Repository traversal and symlinks are rejected. These are local application boundaries, not an OS sandbox against concurrent hostile filesystem changes.

See [closeout, context and history contracts](docs/closeout-and-context.md) for details, including legacy history adoption and external-editor concurrency limits.

## Token efficiency

Both hosts use compact inventories, paginated proposal summaries, bounded review previews, selected document reads, and revision-based reuse. Repeated board reads omit unchanged scenes; artifact instructions can reuse unchanged project context and writing policy. Full originals remain retrievable. Orca's panel calls the core directly; UI reads and chunk transfers do not consume model tokens.

The [0.5 upgrade comparison](docs/efficiency-0.5.0.json) records the OpenSpec 2 payload impact. Earlier payload measurements and their methods are indexed in [verification history](docs/history/README.md). These are fixture-specific payload counts, not fixed reductions in total model cost.

## Maintenance and license

MIT for SpecPlanner's own code. Packages include third-party notices and retained license texts. Excalidraw **0.18.1** and OpenSpec **2.0.0** are pinned official packages. Updates require compatibility review and testing; no automatic merging or publishing is configured. CI is configured for Node 22.13, 24, and 26; weekly Dependabot checks take effect when hosted on GitHub. Local checks do not establish that remote jobs ran.

The [verification record](docs/validation-0.5.1.md) distinguishes local builds, CI, installed-host evidence, dependency checks and remaining limitations. Report bugs through [GitHub Issues](https://github.com/fiddeb/specplanner/issues); use the [security policy](SECURITY.md) for vulnerability reports.
