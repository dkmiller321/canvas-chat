"use client";

import {
  CaptureUpdateAction,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  getNonDeletedElements,
  hashElementsVersion,
  restoreElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Sparkles } from "lucide-react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { tidyLayout } from "@/lib/diagram-layout";
import { applyPreset, type Preset } from "@/lib/diagram-style";

type Elements = Parameters<typeof hashElementsVersion>[0];
type SceneLike = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

export type DiagramEditorHandle = {
  exportPng: () => Promise<Blob>;
  exportSvg: () => Promise<string>;
  exportJson: () => string;
  /** Restyle the whole drawing (G7); saved through the normal autosave as a user version. */
  applyPreset: (preset: Preset) => void;
  /** Tidy-up layout (G7). */
  tidy: () => void;
};

type Props = {
  /** Not `ref`: this component is loaded through next/dynamic. */
  handleRef?: Ref<DiagramEditorHandle>;
  content: string;
  /** Changing this loads `content` into the editor (new version, version switch). */
  contentKey: string;
  editable: boolean;
  /** Called on every user change; serialise lazily (debounced). */
  onUserChange: (getContent: () => string) => void;
  /** "Ask AI" about the selected shapes (G6). */
  onAskAi: (selectedIds: string[], instruction: string) => void;
  /** MOCK_LLM only: expose the Excalidraw API as window.__excalidrawAPI for specs. */
  testHook: boolean;
};

type StoredScene = {
  mermaid?: unknown;
  elements?: unknown[];
  appState?: { viewBackgroundColor?: string };
  files?: Record<string, unknown>;
};

function parse(content: string) {
  const scene = JSON.parse(content) as StoredScene;
  const elements = restoreElements(scene.elements as Parameters<typeof restoreElements>[0], null, {
    repairBindings: true,
    refreshDimensions: true,
  });
  return {
    elements,
    files: scene.files ?? {},
    background: scene.appState?.viewBackgroundColor ?? "#ffffff",
    mermaid: typeof scene.mermaid === "string" ? scene.mermaid : undefined,
  };
}

function useDarkTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Selected shapes, with a label's text element folded into its container. */
function selectedShapeIds(
  elements: readonly { id: string; containerId?: string | null }[],
  selected: Record<string, boolean>,
) {
  const ids = new Set<string>();
  for (const el of elements) {
    if (!selected[el.id]) continue;
    ids.add(el.containerId ?? el.id);
  }
  return [...ids];
}

export function DiagramEditor({ handleRef, content, contentKey, editable, onUserChange, onAskAi, testHook }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (!testHook || !api) return;
    const w = window as unknown as { __excalidrawAPI?: ExcalidrawImperativeAPI };
    w.__excalidrawAPI = api;
    return () => {
      if (w.__excalidrawAPI === api) delete w.__excalidrawAPI;
    };
  }, [api, testHook]);
  const dark = useDarkTheme();
  const initial = useMemo(() => parse(content), []); // eslint-disable-line react-hooks/exhaustive-deps -- first load only
  // Mermaid source travels with the scene so the source panel can show it after manual edits.
  const mermaidRef = useRef(initial.mermaid);
  // Version hash of what was last loaded or saved; onChange with a different hash is a user edit.
  const savedHash = useRef(hashElementsVersion(initial.elements as Elements));
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (!api || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    const next = parse(content);
    mermaidRef.current = next.mermaid;
    savedHash.current = hashElementsVersion(next.elements as Elements);
    const before = new Set(api.getSceneElements().map((e) => e.id));
    const kept = next.elements.filter((e) => before.has(e.id)).length;
    api.updateScene({ elements: next.elements, captureUpdate: CaptureUpdateAction.NEVER });
    // A redraw (new Mermaid source, import) replaces most elements: bring it into view.
    if (kept < next.elements.length / 2)
      api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 });
  }, [api, content, contentKey]);

  const serialize = () => {
    if (!api) throw new Error("Excalidraw is not ready");
    return JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "canvas-chat",
      elements: getNonDeletedElements(api.getSceneElements()),
      appState: { viewBackgroundColor: api.getAppState().viewBackgroundColor },
      files: api.getFiles(),
      ...(mermaidRef.current ? { mermaid: mermaidRef.current } : {}),
    });
  };

  /** Transform the scene as one undoable step; onChange then autosaves it. */
  function replaceElements(transform: <T extends SceneLike>(els: T[]) => T[]) {
    if (!api) return;
    const next = transform([...api.getSceneElements()] as unknown as SceneLike[]);
    // Refresh text sizes (fonts may have changed) and keep labels bound to their shapes.
    const restored = restoreElements(next as unknown as Parameters<typeof restoreElements>[0], null, {
      refreshDimensions: true,
      repairBindings: true,
    });
    api.updateScene({ elements: restored, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }

  useImperativeHandle(
    handleRef,
    () => ({
      exportPng: () => {
        if (!api) throw new Error("Excalidraw is not ready");
        return exportToBlob({
          elements: getNonDeletedElements(api.getSceneElements()),
          appState: { ...api.getAppState(), exportBackground: true },
          files: api.getFiles(),
          mimeType: "image/png",
        });
      },
      exportSvg: async () => {
        if (!api) throw new Error("Excalidraw is not ready");
        const svg = await exportToSvg({
          elements: getNonDeletedElements(api.getSceneElements()),
          appState: { ...api.getAppState(), exportBackground: true },
          files: api.getFiles(),
        });
        return svg.outerHTML;
      },
      exportJson: serialize,
      applyPreset: (preset) => replaceElements((els) => applyPreset(els, preset)),
      tidy: () => {
        replaceElements(tidyLayout);
        // The new layout can extend past the visible area: bring it all into view.
        api?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
      },
    }),
    [api], // eslint-disable-line react-hooks/exhaustive-deps -- serialize only depends on api
  );

  function submitAsk() {
    if (!instruction.trim() || selection.length === 0) return;
    onAskAi(selection, instruction.trim());
    setAsking(false);
    setInstruction("");
  }

  return (
    <div data-testid="diagram-editor" className="relative h-full w-full">
      {editable && selection.length > 0 && (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
          {asking ? (
            <form
              className="flex w-[380px] items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-xl"
              onSubmit={(e) => {
                e.preventDefault();
                submitAsk();
              }}
            >
              <Sparkles className="ml-1.5 size-4 shrink-0 text-ai" aria-hidden />
              <input
                data-testid="diagram-ask-ai-input"
                aria-label={`Ask AI about ${selection.length} selected shape${selection.length === 1 ? "" : "s"}`}
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation(); // Excalidraw's shortcuts must not see these keys.
                  if (e.key === "Escape") setAsking(false);
                }}
                placeholder="Recolour, rename, add a step after…"
                className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none"
              />
              <Button data-testid="diagram-ask-ai-submit" type="submit" size="sm" disabled={!instruction.trim()}>
                Apply
              </Button>
            </form>
          ) : (
            <Button
              data-testid="diagram-ask-ai-button"
              size="sm"
              variant="outline"
              className="rounded-full bg-popover shadow-md"
              onClick={() => setAsking(true)}
            >
              <Sparkles className="text-ai" /> Ask AI about {selection.length} selected
            </Button>
          )}
        </div>
      )}
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={{
          elements: initial.elements,
          files: initial.files as never,
          appState: { viewBackgroundColor: initial.background, gridModeEnabled: true, gridSize: 20, gridStep: 5 },
          scrollToContent: true,
        }}
        viewModeEnabled={!editable}
        theme={dark ? "dark" : "light"}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        onChange={(elements, appState) => {
          const ids = selectedShapeIds(elements, appState.selectedElementIds);
          setSelection((prev) => (prev.length === ids.length && prev.every((x, i) => x === ids[i]) ? prev : ids));
          if (ids.length === 0) setAsking(false);
          const hash = hashElementsVersion(elements);
          if (hash === savedHash.current) return;
          savedHash.current = hash;
          onUserChangeRef.current(serialize);
        }}
      />
    </div>
  );
}
