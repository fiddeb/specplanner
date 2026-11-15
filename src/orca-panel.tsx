import React, { useEffect, useMemo, useState } from "react";
import { connectOrca, orcaClient } from "./orca-client.js";
import type { OrcaBinding, OrcaFrame } from "./orca-contract.js";
import { PlannerShell } from "./planner-shell.js";

export function OrcaPlanner({ frame }: { frame: OrcaFrame }) {
  const [binding, setBinding] = useState<OrcaBinding>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(document.documentElement.classList.contains("dark") ? "dark" : "light");
  const app = useMemo(() => binding ? orcaClient(frame, binding) : null, [frame, binding]);
  async function connect(personal = false) {
    setBusy(true); setError("");
    try { setBinding(await connectOrca(frame, personal)); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to connect to Orca."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    document.documentElement.dataset.host = "orca";
    document.documentElement.dataset.embedded = "true";
    const listener = frame.on("theme", ({ colorScheme }) => setTheme(colorScheme));
    void connect();
    return () => listener.dispose();
  }, [frame]);
  return <PlannerShell app={app} workspacePath={binding?.workspacePath} theme={theme} status={binding ? "Connected to Orca · v0.5.0" : "Connecting to Orca…"}>
    <div className="workspace-context">
      {binding ? <><p className="workspace-path">{binding.workspacePath ? `Workspace: ${binding.workspacePath}` : "Personal board"}</p><p>To use another project, save your work and reopen this panel there. Copy prepared drawing requests into your Codex chat.</p></> : <><p>Use the selected Orca repository or your personal board.</p><button disabled={busy} onClick={() => void connect()}>Connect selected repository</button><button disabled={busy} onClick={() => void connect(true)}>Use personal board</button></>}
      {error && <p role="alert">{error}</p>}
    </div>
  </PlannerShell>;
}
