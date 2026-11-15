import { BoardCollaboration } from "./board-collaboration.js";
import { useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, restoreElements, FONT_FAMILY, convertToExcalidrawElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { PanelClient } from "./panel-client.js";
import { boardSchema, emptyBoard, sceneSchema, type Board as BoardData } from "./board-model.js";
import "@excalidraw/excalidraw/index.css";

function signature(elements: readonly { id: string; [key: string]: unknown }[]) {
  return JSON.stringify(elements.map(element => [element.id, element.version, element.versionNonce, element.isDeleted]));
}
const previewKey = "specplanner.preview.board.v1";
export function Board({ app, theme }: { app: PanelClient | null; theme: "light" | "dark" }) {
  const [board, setBoard] = useState<BoardData>();
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const saved = useRef("[]");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function read() {
    if (!app) return boardSchema.parse(JSON.parse(localStorage.getItem(previewKey) ?? JSON.stringify(emptyBoard())));
    const result = await app.callServerTool({ name: "read_board", arguments: {} });
    if (result.isError) throw new Error("Unable to read the board.");
    return boardSchema.parse(result.structuredContent);
  }
  async function load() {
    setBusy(true); setError("");
    try {
      const next = await read();
      saved.current = signature(next.scene.elements);
      const restored = restoreElements(next.scene.elements as ExcalidrawInitialDataState["elements"], null);
      saved.current = signature(restored);
      setBoard({ ...next, scene: { elements: restored } }); setGeneration(value => value + 1); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load the board."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [app]);
  async function save() {
    if (!api.current || !board) return;
    setBusy(true); setError("");
    try {
      const scene = sceneSchema.parse({ elements: api.current.getSceneElementsIncludingDeleted() });
      let next: BoardData;
      if (app) {
        const result = await app.callServerTool({ name: "save_board", arguments: { expectedRevision: board.revision, scene } });
        if (result.isError) throw new Error(result.content?.filter(item => item.type === "text").map(item => item.text).join(" ") || "Save failed.");
        next = boardSchema.parse(result.structuredContent);
      } else {
        if ((await read()).revision !== board.revision) throw new Error("The board has changed in another preview. Reload the saved version.");
        next = { revision: board.revision + 1, scene };
        localStorage.setItem(previewKey, JSON.stringify(next));
      }
      saved.current = signature(next.scene.elements);
      setBoard(next);
      setDirty(signature(api.current.getSceneElementsIncludingDeleted()) !== saved.current);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the board."); }
    finally { setBusy(false); }
  }
  function addExample() {
    if (!api.current) return;
    const existing = api.current.getSceneElements();
    const y = existing.length ? Math.max(...existing.map((element: ExcalidrawElement) => element.y + element.height)) + 80 : 120;
    const style = { roughness: 0, strokeWidth: 1, strokeColor: "#1b1b1f", backgroundColor: "transparent", roundness: { type: 3 as const } };
    const elements = convertToExcalidrawElements([
      { type: "rectangle", x: 100, y, width: 180, height: 120, ...style, label: { text: "Idea", fontFamily: FONT_FAMILY.Helvetica, fontSize: 20 } },
      { type: "arrow", x: 300, y: y + 60, width: 80, height: 0, points: [[0, 0], [80, 0]], roughness: 0, strokeWidth: 1, roundness: null },
      { type: "rectangle", x: 400, y, width: 180, height: 120, ...style, label: { text: "Plan", fontFamily: FONT_FAMILY.Helvetica, fontSize: 20 } },
    ]);
    api.current.updateScene({ elements: [...existing, ...elements], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.current.scrollToContent(elements);
  }
  return <div className="board-pane">
    <div className="board-actions" hidden={showReview}>
      <span role="status">{!board ? "Loading board…" : dirty ? "Unsaved changes" : `Saved · v${board.revision}`}</span>
      <button disabled={!board || busy} onClick={() => api.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.75 })}>Fit drawing</button>
      {app && <button disabled={!board || busy} onClick={() => { setShowReview(true); }}>Discuss &amp; proposals</button>}
      {!app && <button disabled={!board || busy} onClick={addExample}>Add example</button>}
      <button disabled={!board || busy || !dirty} onClick={() => void save()}>{busy ? "Working…" : "Save board"}</button>
      <button disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload the saved board?")) void load(); }}>Reload saved</button>
    </div>
    {!app && <p className="preview-note">Browser preview · Saved only in this browser. The installed panel uses MCP storage.</p>}
    {error && <p role="alert">{error}</p>}
    {board && <div className="board-canvas" hidden={showReview}><Excalidraw key={generation}
      excalidrawAPI={(value: ExcalidrawImperativeAPI) => { api.current = value; }} theme={theme} langCode="en" viewModeEnabled={busy}
      initialData={{ elements: board.scene.elements as ExcalidrawInitialDataState["elements"], appState: {
        currentItemFontFamily: FONT_FAMILY.Helvetica, currentItemRoughness: 0,
        currentItemRoundness: "round", currentItemArrowType: "sharp", currentItemStrokeWidth: 1,
        currentItemFillStyle: "solid", viewBackgroundColor: "#ffffff",
      }, scrollToContent: true }}
      onChange={(elements: readonly ExcalidrawElement[]) => setDirty(signature(elements) !== saved.current)}
      UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
      validateEmbeddable={() => false}
    ><MainMenu><MainMenu.DefaultItems.ClearCanvas /></MainMenu></Excalidraw></div>}
    {app && board && <div hidden={!showReview} className="board-review"><button className="back-to-board" onClick={() => setShowReview(false)}>Back to drawing</button><BoardCollaboration app={app} revision={board.revision} dirty={dirty} busy={busy} setBusy={setBusy} reload={load} theme={theme} /></div>}
  </div>;
}
