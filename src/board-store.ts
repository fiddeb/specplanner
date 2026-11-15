import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { boardSchema, emptyBoard, sceneSchema, proposalSchema, proposalSummary, type Board, type Scene } from "./board-model.js";
import { page, type PageInput } from "./context.js";

export class RevisionConflict extends Error {
  constructor() { super("The board has changed. Reload the saved version before saving again."); }
}
export class BoardStore {
  constructor(private readonly directory: string) {}
  async readRevision(revision: number): Promise<Board> {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision.");
    if (revision === 0) return emptyBoard();
    const board = boardSchema.parse(JSON.parse(await readFile(join(this.directory, `v${revision}.json`), "utf8")));
    if (board.revision !== revision) throw new Error("Board revision does not match its filename.");
    return board;
  }
  async propose(baseRevision: number, summary: string, scene: Scene) {
    const proposal = proposalSchema.parse({ id: randomUUID(), baseRevision, summary, scene });
    if ((await this.read()).revision !== baseRevision) throw new RevisionConflict();
    const directory = join(this.directory, "proposals");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `${proposal.id}.tmp`);
    await writeFile(temporary, JSON.stringify(proposal), { flag: "wx", mode: 0o600 });
    try { await link(temporary, join(directory, `${proposal.id}.json`)); }
    finally { await unlink(temporary); }
    return proposal;
  }
  async proposals(input: PageInput = {}) {
    const directory = join(this.directory, "proposals");
    let files: string[];
    try { files = await readdir(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") files = []; else throw error; }
    const selection = page(files.filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).sort(), input, `board-proposals:${this.directory}`);
    const items = [];
    for (const name of selection.items) items.push(proposalSummary(await this.proposal(name.slice(0, -5))));
    return { ...selection, items };
  }
  async proposal(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid proposal ID.");
    const proposal = proposalSchema.parse(JSON.parse(await readFile(join(this.directory, "proposals", `${id}.json`), "utf8")));
    if (proposal.id !== id) throw new Error("Proposal ID mismatch.");
    return proposal;
  }
  async applyProposal(id: string) {
    const proposal = await this.proposal(id);
    return this.save(proposal.baseRevision, proposal.scene);
  }
  async read(): Promise<Board> {
    let files: string[];
    try { files = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyBoard(); throw error; }
    const revisions = files.filter(file => /^v[1-9][0-9]*\.json$/.test(file)).map(file => Number(file.slice(1, -5)));
    if (!revisions.length) return emptyBoard();
    const revision = Math.max(...revisions);
    const board = boardSchema.parse(JSON.parse(await readFile(join(this.directory, `v${revision}.json`), "utf8")));
    if (board.revision !== revision) throw new Error("Board revision does not match its filename.");
    return board;
  }
  async save(expectedRevision: number, input: Scene): Promise<Board> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid revision.");
    const scene = sceneSchema.parse(input);
    if ((await this.read()).revision !== expectedRevision) throw new RevisionConflict();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const board = { revision: expectedRevision + 1, scene };
    const temporary = join(this.directory, `.pending-${randomUUID()}`);
    await writeFile(temporary, JSON.stringify(board), { flag: "wx", mode: 0o600 });
    try {
      // A hard link publishes a complete immutable revision atomically. Only one writer can win.
      await link(temporary, join(this.directory, `v${board.revision}.json`));
      return board;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RevisionConflict();
      throw error;
    } finally { await unlink(temporary); }
  }
}
