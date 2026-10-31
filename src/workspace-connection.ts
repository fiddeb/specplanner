import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { join } from "node:path";

// A capability identifies one panel, not a server-wide or most-recent workspace.
export class WorkspaceConnections {
  constructor(private readonly directory: string, private readonly now = () => Date.now()) {}
  private file(id: string, suffix: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid workspace connection request.");
    return join(this.directory, `${id}.${suffix}.json`);
  }
  async create() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const requestId = randomUUID();
    await writeFile(this.file(requestId, "request"), JSON.stringify({ expiresAt: this.now() + 10 * 60_000 }), { flag: "wx", mode: 0o600 });
    return requestId;
  }
  private async check(id: string) {
    const request = JSON.parse(await readFile(this.file(id, "request"), "utf8"));
    if (this.now() >= request.expiresAt) throw new Error("Workspace connection expired. Reopen SpecPlanner to try again.");
  }
  async read(id: string): Promise<{ connected: boolean; workspacePath?: string | null }> {
    await this.check(id);
    try { return { connected: true, ...JSON.parse(await readFile(this.file(id, "workspace"), "utf8")) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { connected: false }; throw error; }
  }
  async bind(id: string, workspacePath: string | null) {
    await this.check(id);
    const temporary = this.file(randomUUID(), "pending");
    await writeFile(temporary, JSON.stringify({ workspacePath }), { flag: "wx", mode: 0o600 });
    try { await link(temporary, this.file(id, "workspace")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await this.read(id);
      if (existing.workspacePath !== workspacePath) throw new Error("This panel is already connected to another workspace.");
    }
    finally { await unlink(temporary); }
    return this.read(id);
  }
}
