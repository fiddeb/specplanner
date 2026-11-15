import React, { useState, type ReactNode } from "react";
import type { PanelClient } from "./panel-client.js";
import { Board } from "./board.js";
import { Plan } from "./plan.js";

export function PlannerShell({ app, workspacePath, theme, status, preview = false, children }: {
  app: PanelClient | null; workspacePath?: string | null; theme: "light" | "dark"; status: string; preview?: boolean; children?: ReactNode;
}) {
  const [tab, setTab] = useState("Board");
  return <main className={tab === "Board" ? "planner with-board" : "planner"}>
    <header><span className="eyebrow">SPECPLANNER</span><h1>Plan software changes</h1><p>Review requirements, decisions, tasks and drawings with Codex.</p></header>
    {children}
    <nav aria-label="Planning views">{["Plan", "Board", "Decisions"].map(name => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <div className="board-view" hidden={tab !== "Board"}>{preview || app ? <Board key={workspacePath ?? "personal"} app={app} theme={theme} /> : <p>Connect a repository or personal board to start.</p>}</div>
    <div className="plan-view" hidden={tab !== "Plan"}><Plan key={workspacePath ?? "personal"} app={app} /></div>
    <section hidden={tab !== "Decisions"}><span className="eyebrow">Decisions</span><h2>Read decision records</h2><p>Each change's design.md records decisions, reasons, tradeoffs and open questions. Read it under Plan. Archived changes retain earlier decisions and verification evidence.</p><p>Record accepted decisions in those repository files so they remain available to everyone working on the project.</p><button onClick={() => setTab("Plan")}>Open Plan</button></section>
    <footer role="status">{status}</footer>
  </main>;
}
