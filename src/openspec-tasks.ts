import { isAbsolute, relative, join, sep } from "node:path";
import { z } from "zod";

const applyResult = z.object({
  progress: z.object({ total: z.number().int().nonnegative(), complete: z.number().int().nonnegative() }),
  tasks: z.array(z.object({ description: z.string(), done: z.boolean(), sourcePath: z.string(), line: z.number().int().positive() })),
  unavailableTrackingFiles: z.array(z.object({ path: z.string(), reason: z.string() })).optional(),
});

/** Public OpenSpec 2 JSON supplies all checkbox counts and exact task locations. */
export function taskProgress(result: unknown, directory: string) {
  const official = applyResult.parse(result);
  const localPath = (path: string) => {
    const value = relative(directory, isAbsolute(path) ? path : join(directory, path));
    if (!value || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) throw new Error("OpenSpec task path is outside the selected change.");
    return value.split(sep).join("/");
  };
  const unreadable = (official.unavailableTrackingFiles ?? []).map(file => localPath(file.path));
  const { total, complete: completed } = official.progress;
  const located = official.tasks.map(task => ({ ...task, path: localPath(task.sourcePath) }));
  const pending = located.filter(task => !task.done).map(({ path, line, description }) => ({ path, line, description }));
  return { total, completed, unreadable, status: unreadable.length || total === 0 ? "unknown" : completed === total ? "complete" : "incomplete", pending };
}
