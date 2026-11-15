import { assert, mountWorker, mockHost, test } from 'orca/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run with `orca plugin test releases/specplanner-<version> --json` after packaging.
// Exercise the shipped bundle: Orca's build-less test loader rejects npm source imports.
test('shipped worker binds personal storage and enforces board revisions', async () => {
  const data = await mkdtemp(join(tmpdir(), 'specplanner-orca-kit-'));
  const previous = process.env.SPECPLANNER_DATA_DIR;
  process.env.SPECPLANNER_DATA_DIR = data;
  const main = await import(new URL('../dist/orca-worker.js', import.meta.url).href);
  const worker = await mountWorker(main, { host: mockHost({ capabilities: ['workspace:read', 'storage:own'] }) });
  try {
    const binding = await worker.request('planner.connect', { personal: true }) as { session: string; workspacePath: null };
    assert.equal(binding.workspacePath, null);
    async function call(name: string, args: Record<string, unknown> = {}) {
      const text = JSON.stringify({ name, arguments: args });
      const { id } = await worker.request('planner.begin', { session: binding.session, length: text.length }) as { id: string };
      try {
        for (let offset = 0; offset < text.length; offset += 8192) await worker.request('planner.append', { id, offset, text: text.slice(offset, offset + 8192) });
        const { length } = await worker.request('planner.execute', { id }) as { length: number };
        let response = '';
        while (response.length < length) response += (await worker.request('planner.read', { id, offset: response.length }) as { text: string }).text;
        return JSON.parse(response);
      } finally { await worker.request('planner.release', { id }); }
    }
    assert.equal((await call('read_board')).structuredContent.revision, 0);
    const saved = await call('save_board', { expectedRevision: 0, scene: { elements: [] } });
    assert.equal(saved.structuredContent.revision, 1);
    assert.equal((await call('save_board', { expectedRevision: 0, scene: { elements: [] } })).isError, true);
    assert.deepEqual(worker.refusals, []);
  } finally {
    await worker.deactivate();
    if (previous === undefined) delete process.env.SPECPLANNER_DATA_DIR; else process.env.SPECPLANNER_DATA_DIR = previous;
    await rm(data, { recursive: true, force: true });
  }
});
