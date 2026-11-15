# SpecPlanner 0.3.0 review and validation

Historical evidence for the named release. For current setup, support and verification, see [README](../../README.md) and [0.5.0 verification](../validation-0.5.0.md).

Reviewed on 2026-11-11 against the 0.2.0 source at `bd5ac52b6742837820eab7db00abbaf402b95e6e`. Version 0.3.0 is a local package candidate. It is suitable for source review and controlled local evaluation; native host integration and remaining dependency findings prevent an unconditional release-readiness claim. No commit, push, public release, or installed-plugin replacement is part of this validation.

## Correctness changes

- Archive dependencies now use exact original change IDs from archive associations or successful matching receipts. Suffix matches and ambiguous dated filenames cannot satisfy unrelated dependencies.
- Review history uses change identity as well as document path. Reusing a name, including identical Markdown bytes, cannot attach old comments or accept an old panel's save/comment request. Archive previews also reject replacement generations.
- Review associations are recorded only after observing the archive. Failed attempts cannot reserve a later change's history. Interrupted operations require identity evidence as well as matching content before claiming success.
- Existing legacy snapshots and comments remain intact. Concurrent first reads adopt an unambiguous owner; ambiguous reuse fails explicitly. Known original IDs resolve dated-name ambiguity. A separate independent probe verified v0.2 receipts without new identity metadata.
- Context and archive review scans inspect comments directly instead of traversing all retained document revisions. A regression fixture with more than 64 MB of snapshots remains readable and previewable.

The independent correctness/architecture review reported no remaining Required or Critical findings in these changes after correction. This is a code review, not an exhaustive security audit.

## Token and payload measurements

`scripts/measure-efficiency.ts` runs actual MCP calls against temporary repositories. The baseline is the previously built 0.2.0 standalone server; the comparison uses the current source server. Fixtures contain five proposals with 101 elements each, and a 160,600-character document with 23 original comments. Both document runs verify exact text and comment count; the current run also verifies that fetching a selected proposal returns the exact submitted scene. IDs, temporary paths, timestamps, and hashes can slightly change token counts between runs.

Token counts use tiktoken 0.12.0 with `o200k_base` on compact JSON for each actual MCP request/result, including text and structured content. These measure payload size, not a host's billed usage: prompt framing, tool filtering, caching, model-specific tokenization, and panel-only calls vary by host. [Raw aggregate results](efficiency-0.3.0.json) record bytes, calls, request tokens, and response tokens.

| Operation | 0.2 response tokens | 0.3 response tokens | Difference |
| --- | ---: | ---: | ---: |
| Submit five drawing proposals | 68,013 | 337 | 99.5% fewer |
| List those five proposals | 67,923 | 296 | 99.6% fewer |
| Read long document and all 23 comments (four calls) | 50,442 | 38,761 | 23.2% fewer |
| Fetch one complete selected proposal | Already repeated in submission/list | 13,600 | One explicit detail call |

The document reader transfers 23 comment records instead of 63; all originals remain unchanged. It sends slightly more request metadata to protect identity and reuse comment revisions. Discovery grows from 4,800 to 5,164 tokens for the complete unfiltered tool list because of the detail endpoint and identity contracts. Proposal submission still sends the complete scene: the five requests cost about 68,000 tokens in either version. Small typed scene edits could reduce that input cost, but require a separate conflict/validation design and are not implemented here.

Reproduce the raw captures:

```sh
npx tsx scripts/measure-efficiency.ts /path/to/0.2.0/dist/server.js /tmp/specplanner-before.json
npx tsx scripts/measure-efficiency.ts current /tmp/specplanner-after.json
```

Count each `captures[].request` and `captures[].result` after compact JSON serialization with the encoding above. Compare like phases; `selected proposal` is an additional current-version phase. The existing `knownWritingPolicyRevision` contract also avoids repeating unchanged writing policy across different artifacts. That pre-existing optimization is not included in these change measurements.

## Local verification

- `npm run check`, `npm test` (54 passing tests), and `npm run build` passed on Node 26.10.0.
- A clean temporary source copy passed `npm ci`, type checks, all 54 tests, build, and standalone package verification on Node 22.13.0. The supported runtime is Node 22.13+ within 22.x, or Node 24+.
- Standalone verification starts the bundled stdio server from an installation directory containing spaces. It covers tool discovery, workspace isolation, board revisions, compact proposal listing/full-detail fetch/application, document identity and revision checks, official OpenSpec creation/instructions/validation, archive simulation/spec sync/application/retry, retained archived reviews, and loading the bundled panel resource.
- Packaging includes the project's MIT license plus third-party notices for 233 retained bundle/runtime package locations. The verifier checks bundled-package notice coverage and content hashes. Upstream package notices and embedded asset licenses are included; omitted upstream license files have pinned source URLs and checked hashes in `licenses/vendor-sources.json`.
- An isolated mutation inverted the document-save identity guard. The reused-name regression failed with `Missing expected rejection`, proving that it detects the stale write. The disposable source was restored; the working source was never mutated.
- A disposable browser harness using the real MCP server displayed 20 proposal summaries, loaded the twenty-first, fetched/rendered its scene, applied it to saved revision 1, and disabled reapplication of the outdated proposal. Desktop and 390 px layouts were inspected. The browser console contained no errors. Run `npx tsx scripts/preview-closeout.ts --board` to repeat with synthetic data.
- CI and weekly Dependabot configuration are present. Remote GitHub execution is not established by these local checks; it requires pushing the files and observing the jobs.

## Dependency assessment

The final `npm audit` on 2026-11-11 reports six affected dependency entries: two low, two moderate, and two high. These counts include parent packages and are not six independently demonstrated application vulnerabilities. The reviewed baseline reported fourteen entries, including ten high.

Three updates were isolated, their lockfile changes inspected, and tests run after each:

| Dependency | Before | After | Basis |
| --- | --- | --- | --- |
| fast-uri | 3.1.8 | 3.1.9 | [Upstream URI corrections](https://github.com/fastify/fast-uri/releases/tag/v3.1.9) |
| lodash-es | 4.17.21 | 4.18.1 | [Security corrections](https://github.com/lodash/lodash/releases/tag/4.18.0), followed by the [modular-build correction](https://github.com/lodash/lodash/releases/tag/4.18.1) |
| nanoid 3.x | 3.3.3 | 3.3.18 | Patched 3.x line, including [upstream loop correction](https://github.com/ai/nanoid/releases/tag/3.3.18) |

Exact overrides preserve the official pinned Excalidraw/OpenSpec versions while replacing lodash-es and the 3.x nanoid copy. Overrides require review when those upstream packages change.

Remaining findings:

- **High: body-parser 2.3.0.** The affected compressed HTTP-body path is in the installed dependency graph. The stdio production entrypoint does not retain body-parser in the esbuild bundle, and it is not among copied OpenSpec runtime packages. This reduces exposure in the shipped package but does not resolve the lockfile advisory. See [upstream advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- **High: nanoid 4.0.2 inside the Mermaid converter.** This separate copy remains bundled. Inspected converter calls use `nanoid()` without user-supplied sizes; the reported zero/negative/oversized size paths were not reproduced through SpecPlanner. Moving this copy to 5.x needs explicit compatibility and Mermaid import coverage; it was not forced as part of the 3.x patch. See [size handling advisory](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) and [integer-overflow advisory](https://github.com/advisories/GHSA-xwg4-73v4-xw9w).
- **Low: KaTeX 0.16.47.** The reported trust bypass requires pre-existing prototype pollution. No such combined path was demonstrated here; the vulnerable package is retained. A compatible upstream correction still needs review. See [upstream advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7).
- The remaining parent entries are Excalidraw, mermaid-to-excalidraw, and Mermaid. `npm audit fix --force` proposes an Excalidraw downgrade; that is not evidence of compatible behavior and was not applied.

## Remaining release work

1. Install this exact 0.3.0 package in the intended desktop host and verify native panel placement, + menu project binding, tool visibility enforcement, chat-message delivery, simultaneous project routing, and planning-to-implementation handoff. Local stdio and browser checks do not establish these host behaviors.
2. Resolve or explicitly accept the remaining dependency exposure with the affected Mermaid/KaTeX flows tested. The current review does not certify arbitrary untrusted diagram imports.
3. Observe CI on the remote repository before treating the Node 24/26 Linux jobs as verified. Local Node 22/26 runs were on macOS.

Review-history identity is local to the physical repository directory. Repository copies/restores and ambiguous legacy reuse can require manual reconciliation; the [compatibility contract](../closeout-and-context.md#compatibility-and-verification) describes these cases. Preserve both repository files and private SpecPlanner data when backing up or moving existing planning work.

## Orca plugin compatibility review (2026-11-15)

The same repository already supplied SpecPlanner inside Orca: Codex/MCP tool calls and a browser-hosted MCP Apps visual test were exercised on 2026-11-01, and the test host was restarted on 2026-11-06 using version 0.2.0 at `bd5ac52`. Recovered tool results show drawing persistence and document reading through the real server. The temporary browser host lived in chat scratch storage and loaded this project's code; it was not a separate SpecPlanner implementation. That existing integration must be preserved when adding native Orca support. The saved browser tab remains, but its old local test server was unreachable when inspected on 2026-11-15.

**Required for native Orca distribution:** the current package is a Codex/MCP App, not an Orca plugin. Running `orca plugin validate` against this repository exits 1 with `invalid_argument`: neither `orca-plugin.json` nor `orca-catalog.json` exists. The earlier local verification remains valid for its MCP target; it does not establish Orca compatibility.

The [Orca authoring guide](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-authoring.md) requires its own manifest and host integration. The proposed fit is an HTML panel retaining React/Excalidraw, backed by a `trusted-worker` for the existing filesystem and OpenSpec operations. Declare the actual capabilities and minimum host version, use the supported frame/worker APIs, and map Orca theme tokens. Keep the existing revision checks and domain services shared; this is integration work, not a new model runtime. A manifest rename alone cannot adapt the current MCP handshake or `sendMessage` calls.

Two contracts need explicit design before implementation:

- The documented panel/worker channel accepts 64 KiB inputs and 1 MiB answers. Existing scene payloads can approach 2,000,000 JSON characters and document saves 1,000,000 bytes. Preserve their semantics through bounded transfer/staging and revision checks; do not silently truncate or lower limits.
- The [host API](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-host-api.md) exposes workspace identity separately from paths and host IDs. Resolve and bind the intended workspace and execution host; a remote path must never be used as a local path. The documented terminal send operation does not establish a structured-chat send route. Selecting the intended Codex session and supporting structured chats remain open integration questions.

The guide still lists `contributes.mcpServers` as a reserved, unimplemented contribution. Do not assume the current `mcp.json` will register agent tools through an Orca manifest. Native validation, installed-panel tests, and a supported Codex handoff are required before calling this an Orca release. This review changed documentation only; no native adapter, installation, or publication was performed.
