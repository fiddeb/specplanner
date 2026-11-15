import { execFile } from "node:child_process";

/** Keep the official CLI in a bounded process, including inside Orca's Electron worker. */
export async function openSpecCommand(cli: string, cwd: string, args: string[], allowInvalid = false) {
  return await new Promise<unknown>((resolve, reject) => {
    execFile(process.execPath, [cli, ...args], {
      cwd, timeout: 30000, maxBuffer: 2_000_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ELECTRON_RUN_AS_NODE: "1", OPENSPEC_NO_UPDATE_CHECK: "1", OPENSPEC_TELEMETRY: "0", DO_NOT_TRACK: "1", CI: "1", NO_COLOR: "1" },
    }, (error, stdout, stderr) => {
      let result: unknown;
      try { result = JSON.parse(stdout); } catch { /* A failed CLI may return only stderr. */ }
      if (error && (!allowInvalid || error.code !== 1)) {
        const diagnostics = (result as { status?: { message?: string; fix?: string }[] } | undefined)?.status;
        const message = Array.isArray(diagnostics) ? diagnostics.map(item => [item.message, item.fix].filter(Boolean).join(" ")).join("\n") : "";
        return reject(new Error((message || stderr.trim() || error.message).slice(0, 8000)));
      }
      if (result === undefined) return reject(new Error(stderr.trim().slice(0, 8000) || "OpenSpec did not return valid JSON."));
      resolve(result);
    });
  });
}
