import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OpenSpecWorkspace, changeId } from "./openspec.js";
import { DocumentStore } from "./document-store.js";
import { ArchiveService } from "./archive.js";
import { digest, filesUnder, page, relativeFile, textPage, type PageInput, type TextInput } from "./context.js";
export type DocumentReadInput = TextInput & { knownCommentsRevision?: string; commentsCursor?: string; commentsLimit?: number; archiveName?: string };

export class ContextReader {
  constructor(readonly workspace: OpenSpecWorkspace, readonly data: string) {}
  private async scope(query: string) { return `${(await this.workspace.identity()).path}/${query}`; }
  async changes(input: PageInput) { return page(await this.workspace.list(), input, await this.scope("changes")); }
  async projectDocuments(category: "project" | "specification" | "archive" | "all", input: PageInput) {
    return page((await this.workspace.projectIndex()).filter(document => category === "all" || document.category === category), input, await this.scope(`project-documents/${category}`));
  }
  async change(id: string, input: PageInput) {
    const root = await this.workspace.checkTree(); changeId(id);
    const files = await filesUnder(join(root, "openspec/changes", id));
    if (!files.length) throw new Error("Active change does not exist or has no files.");
    return { id, documents: page(files, input, await this.scope(`change/${id}`)), review: await this.reviews(id, files.map(file => file.path)), next: "Fetch selected files with read_change_file, or read_document for Markdown with exact review comments. Content is never included in this manifest." };
  }
  async reviews(id: string, paths: string[]) {
    const files = await filesUnder(join(this.data, `workspace-${(await this.workspace.identity()).id}`, "documents"));
    const prefixes = paths.map(path => `${digest(`${id}/${path}`)}/comments/`);
    const comments = files.filter(file => prefixes.some(prefix => file.path.startsWith(prefix)));
    return { comments: comments.length, revision: digest(JSON.stringify([await this.scope(`reviews/${id}`), comments])) };
  }
  async file(id: string, path: string, input: TextInput) {
    const root = await this.workspace.checkTree(); changeId(id); relativeFile(path);
    const files = await filesUnder(join(root, "openspec/changes", id));
    const file = files.find(file => file.path === path);
    if (!file) throw new Error("File is not in the selected change.");
    if (file.bytes > 1_000_000) throw new Error("Text file exceeds the 1 MB read limit; use repository file tools for this evidence.");
    const buffer = await readFile(join(root, "openspec/changes", id, path));
    const content = buffer.toString("utf8");
    if (!Buffer.from(content).equals(buffer)) throw new Error("Binary file: use repository file tools; archive preserves its original bytes.");
    return { id, path, ...textPage(content, input, await this.scope(`file/${id}/${path}`)) };
  }
  async projectDocument(path: string, input: DocumentReadInput) {
    const document = await this.workspace.readProjectDocument(path);
    const archived = /^changes\/archive\/([^/]+)\/(.+\.md)$/.exec(path);
    if (archived) {
      const id = await new ArchiveService(this.workspace, this.data).originalChange(archived[1]);
      if (id) return { ...await this.document(id, archived[2], { ...input, archiveName: archived[1] }), path, originalChangeId: id };
    }
    return { path, ...textPage(document.content, input, await this.scope(`project/${path}`)), reviewHistory: archived ? "Unknown original change ID. Use read_document with the original id and archiveName to retrieve retained comments." : undefined };
  }
  async document(id: string, path: string, input: DocumentReadInput) {
    const document = await new DocumentStore(this.workspace, this.data).read(id, path, input.archiveName);
    const scope = await this.scope(`document/${id}/${input.archiveName ?? "active"}/${path}`);
    const scopePrefix = `${digest(scope)}:`;
    const commentsRevision = `${scopePrefix}${digest(JSON.stringify(document.comments))}`;
    const sameScope = input.knownCommentsRevision?.startsWith(scopePrefix);
    const contentUnchanged = !!sameScope && input.knownRevision === document.revision;
    const commentsUnchanged = !input.commentsCursor && input.knownCommentsRevision === commentsRevision;
    const content = textPage(document.content, { ...input, knownRevision: contentUnchanged ? document.revision : undefined }, scope, document.revision);
    const { items, ...commentsPage } = page(document.comments, { cursor: input.commentsCursor, limit: input.commentsLimit }, scope);
    return { path, ...content, unchanged: contentUnchanged && commentsUnchanged, contentUnchanged, commentsUnchanged, commentsRevision,
      comments: commentsUnchanged ? undefined : items, commentsPage: commentsUnchanged ? { ...commentsPage, hasMore: false, nextCursor: null } : commentsPage };
  }
}
