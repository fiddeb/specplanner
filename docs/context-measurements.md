# Context measurements: 0.1.8 and 0.2.0

Measurements count actual UTF-8 bytes in JSON-serialized MCP call results, including content and structuredContent. They are response-size measurements, not token counts or universal model-context savings. Host serialization and tokenization can differ. Requests, transport headers, browser rendering and implementation execution are excluded. Tool discovery is reported separately.

Both runs generate the same disposable synthetic corpus: 30 active changes with completed checklists and saved verification, 24 new capabilities absent from baseline specs, and 60 archived documents. The supplied production example repository was not opened or modified. The baseline starts the installed 0.1.8 server read-only; the new run uses the source server. Each receives explicit temporary workspace paths and private temporary storage.

The sequence orients, chooses change-00, reads its proposal/reviews, repeats workspace/document status three times, and reviews closeout inputs. The 0.1.8 server has no archive preview: its final phase gathers its available workspace/change/validation inputs. The 0.2.0 final phase additionally simulates real spec sync/archive and reads the original design, task list, delta and exact proposed main spec. Its selected-change phase separately reads saved verification. Thus this compares a practical orientation/review workflow on the same original information, not equivalent archive functionality. No archive is applied by the benchmark.

| Phase | 0.1.8 response bytes | 0.2.0 response bytes | Calls before / after |
| --- | ---: | ---: | ---: |
| Orientation | 11,252 | 1,076 | 1 / 2 |
| Selected change | 21,805 | 6,429 | 2 / 3 |
| Three repeated status checks | 46,545 | 3,258 | 6 / 6 |
| Archive inputs / preview | 29,603 | 9,139 | 3 / 5 |
| Total | 109,205 | 19,902 | 12 / 16 |

The workflow returns **81.8% fewer response bytes**, using four additional targeted calls. Full requirements, tasks, dependency rationale and evidence remain available and are read explicitly; they have not been replaced with summaries. 0.1.8 returned every selected Markdown body twice and repeated the workspace library; 0.2.0 returns a manifest, selected originals, independent conditional document/comment status and a bounded preview. Summary/file hashes increase metadata for an individual small read but avoid retransmitting complete content during status checks.

Tool discovery grows from **14,876** to **20,953 bytes**, reflecting the added archive, listing, status and targeted-file schemas. Including one discovery plus the measured sequence gives **124,081 → 40,855 bytes**, a **67.1% reduction**. Discovery amortization depends on the host; it must not be ignored for short sessions.

A separate drafting-instruction pair measures a full request followed by a repeated request for the same artifact. It is excluded from the workflow totals above. Both versions make two calls. 0.1.8 returns **34,834 bytes**; 0.2.0 returns **9,149 bytes**, using knownRevision for its second call. Full original instructions and writing policy are still returned when needed. knownWritingPolicyRevision can additionally avoid repeating unchanged static guidance across different artifacts; that optimization is tested but not included in this byte comparison.

Reproduce from the source repository:

```sh
node --import tsx scripts/measure-context.ts before /absolute/path/to/0.1.8/dist/server.js
node --import tsx scripts/measure-context.ts after
```

Raw per-call results: [before](context-before.json), [after](context-after.json). The corpus and call sequence are defined in [measure-context.ts](../scripts/measure-context.ts). Temporary projects are deleted after each run. Counts vary if descriptions/contracts change; rerun after modifying them. The raw records contain no production documents, comments, credentials or local workspace paths.

The chosen scope avoids a workspace-wide semantic cache: every read observes files again, cursor revisions detect changed lists, and comments have their own revision. This spends filesystem/CLI work and more targeted round trips to reduce repeated context. Large files and trees fail with explicit inspection limits rather than being silently shortened. Native-host tool presentation and cache refresh remain unverified; protocol byte counts do not establish installed-host behavior.
