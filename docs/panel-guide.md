# Using the planner panel

Follow [README](../README.md) to install the plugin and select a repository. Both hosts use the same Plan, Board and Decisions views. Tabs retain drafts; closing or reopening the panel can discard unsaved work. Panels bound to the same repository share saved data.

## Documents and comments

Plan lists active changes and the project library. Existing active-change Markdown is editable. Project guidance, baseline specifications and archived documents are read-only. Creating a change scaffolds metadata; the agent writes its proposal, design, specifications and tasks through repository tools. Decisions points to each change's `design.md`; it has no separate decision store.

Choose a document, then use **Edit / select text** and **Save document**. Saves require the content revision and change identity read by that editor. A conflict retains the draft. **Reload saved** asks before discarding document edits. Visited document drafts survive switching files; changing the active change, creating another change and refreshing are disabled while document or comment drafts exist.

Save edits before commenting. Select a passage in the reader and choose **Comment on selection**, or use **Add document comment** without a selection. The reader anchors only exact, unique matches in the Markdown source. If formatting or repeated text prevents an exact match, select the source in **Edit / select text**. The panel rejects ambiguous anchors instead of guessing.

Comments retain original text and language, selected quotes, UTF-16 offsets, creation time and the saved revision. **Earlier version** identifies comments on previous content; edits do not silently re-anchor them. The agent can read comments through `read_document`. Accepted decisions and their reasons belong in repository artifacts, as defined in the [planning contract](planning-contract.md). Comment resolution, a snapshot-history browser and new-document authoring in the panel are not implemented.

## Drawing and proposals

The board uses official Excalidraw with Helvetica text, zero roughness, rounded shapes and straight arrows by default. Save explicitly with **Save board**. Old saved revisions remain available, and concurrent saves from the same revision cannot both succeed. **Reload saved** asks before discarding drawing edits.

Saves accept at most 2,000 elements and 2,000,000 serialized JSON characters. Image and embedded-content tools are disabled; unsupported elements or invalid scenes are rejected without clearing the editor. Proposals use the same scene validation.

Open **Discuss & proposals**, enter a request and save drawing changes before preparing or sending it. Orca uses **Prepare drawing request** and **Prepare review request** to produce text for copying into Codex. An MCP Apps host uses **Request drawing** or **Discuss changes** to call its message API; a failed handoff leaves copyable text. Check the chat before retrying after a timeout. Moving a shape never calls a model.

The request identifies the workspace and exact saved revision. The agent reads that revision and the latest board, then submits a complete replacement through `propose_board`. Proposal creation leaves the saved board unchanged. Choose **Refresh proposals**, open a proposal and inspect its drawing before **Apply to board**. Unsaved drafts and stale base revisions prevent application. Successful application saves a new revision; competing or repeated applications cannot publish twice. **Back to drawing** keeps the editor mounted. Proposal dismissal and automatic retention cleanup are not implemented.

A standalone browser preview stores its board in localStorage and has no agent connection. It cannot send requests or read server proposals. Its cross-tab revision check is best-effort; the atomic write guarantee belongs to the file-backed store used by the installed integrations.

## Project connections and closeout

For MCP Apps, `open_planner` should receive this chat's trusted `workspacePath`. An empty launch without a configured default creates a separate connection request for the panel. The panel asks the agent to call `connect_workspace` and polls for up to two minutes. Requests expire after ten minutes, persist across server instances and cannot be rebound to another workspace. Explicit project or personal-board opens skip this handshake. Failed automatic connection leaves manual repository entry and personal storage available. Saved connection records must contain a valid expiry and workspace binding; malformed records fail explicitly.

The Orca panel binds to the selected local repository through the host API and retains that binding across focus changes and idle worker restarts. Save drafts and reopen the panel to select another project. Remote repositories are rejected. Choosing a repository after using a personal board asks before discarding its unsaved drawing; saved personal data remains separate.

Closeout requires an archive preview, dependency and exact specification-diff review, saved verification evidence and explicit application. Document/comment drafts block preview and application. The panel locks editing and change navigation while applying and retains the result after the active change disappears. See [closeout and recovery](closeout-and-context.md) for conflicts, interrupted operations and retained reviews.
