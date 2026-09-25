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
import { fitView, sceneBounds } from "@/lib/diagram-view";

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
  /** `transparent`: no background (G9). */
  exportPng: (opts?: { transparent?: boolean }) => Promise<Blob>;
  /** `dark`: rendered in dark mode (G9). */
  exportSvg: (opts?: { dark?: boolean }) => Promise<string>;
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
  diagramSource?: unknown;
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
    // The source it was drawn from (G8, G10) travels with the scene.
    source: {
      ...(typeof scene.mermaid === "string" ? { mermaid: scene.mermaid } : {}),
      ...(scene.diagramSource ? { diagramSource: scene.diagramSource } : {}),
    },
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

  // Shape library (G9): load the saved items once, then save every change (debounced).
  const libraryReady = useRef(false);
  const librarySave = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    fetch("/api/library")
      .then((r) => r.json() as Promise<{ items: Parameters<typeof api.updateLibrary>[0]["libraryItems"] }>)
      .then(async ({ items }) => {
        if (cancelled) return;
        await api.updateLibrary({ libraryItems: items, merge: false });
      })
      .catch(() => {
        // An unreadable library starts empty; saving a change writes a fresh one.
      })
      .finally(() => {
        if (!cancelled) libraryReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  function saveLibrary(items: readonly unknown[]) {
    if (!libraryReady.current) return;
    if (librarySave.current) clearTimeout(librarySave.current);
    librarySave.current = setTimeout(() => {
      void fetch("/api/library", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
    }, 400);
  }

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
  // The diagram's source travels with the scene so the source panel can show it after manual edits.
  const sourceRef = useRef(initial.source);
  // Version hash of what was last loaded or saved; onChange with a different hash is a user edit.
  const savedHash = useRef(hashElementsVersion(initial.elements as Elements));
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  const box = useRef<HTMLDivElement>(null);
  /** Centre the drawing in the area the toolbars leave free, zooming out if it doesn't fit (lib/diagram-view). */
  const showAll = (a: ExcalidrawImperativeAPI) => {
    const bounds = sceneBounds(getNonDeletedElements(a.getSceneElements()));
    const rect = box.current?.getBoundingClientRect();
    if (!bounds || !rect?.width) return;
    const v = fitView(bounds, rect);
    a.updateScene({
      appState: { zoom: { value: v.zoom as never }, scrollX: v.scrollX, scrollY: v.scrollY },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };
  // First load. This effect is the only thing that sets the first view: Excalidraw's own
  // initialData.scrollToContent ran at about the same moment and could reset the zoom after us.
  useEffect(() => {
    if (!api) return;
    // The initial scene arrives a few frames after the API does; act a couple of frames after that.
    let frame = 0;
    let tries = 0;
    let settled = 0;
    const check = () => {
      const els = api.getSceneElements();
      // The element's own size: until Excalidraw measures its container, appState holds the window size.
      const { width, height } = box.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
      // scrollToContent zooms by appState's size too, so also wait until Excalidraw has measured the element,
      // and until its own scene setup is done (it restores the default zoom and scroll when it finishes).
      const state = api.getAppState();
      const measured = !state.isLoading && Math.abs(state.width - width) < 2 && Math.abs(state.height - height) < 2;
      if ((!els.length || !width || !measured) && ++tries < 120) {
        frame = requestAnimationFrame(check);
        return;
      }
      if (!els.length) return;
      if (++settled < 3) {
        frame = requestAnimationFrame(check);
        return;
      }
      // Text was measured when the scene loaded, possibly before Excalifont had: labels drawn in the
      // real font then overflowed and were cut off. Re-measure once the font is in, without it
      // counting as a user edit.
      void Promise.all([document.fonts.load("20px Excalifont"), document.fonts.load("16px Excalifont")])
        .catch(() => [])
        .then(() => {
          if (cancelled) return;
          const fixed = restoreElements(api.getSceneElements() as Parameters<typeof restoreElements>[0], null, {
            refreshDimensions: true,
            repairBindings: true,
          });
          savedHash.current = hashElementsVersion(fixed as Elements);
          api.updateScene({ elements: fixed, captureUpdate: CaptureUpdateAction.NEVER });
          showAll(api);
        });
    };
    let cancelled = false;
    frame = requestAnimationFrame(check);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps -- showAll only reads refs

  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (!api || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    const next = parse(content);
    sourceRef.current = next.source;
    savedHash.current = hashElementsVersion(next.elements as Elements);
    const before = new Set(api.getSceneElements().map((e) => e.id));
    const kept = next.elements.filter((e) => before.has(e.id)).length;
    api.updateScene({ elements: next.elements, captureUpdate: CaptureUpdateAction.NEVER });
    // A redraw (new source, import) replaces most elements: bring it into view.
    if (kept < next.elements.length / 2) showAll(api);
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
      ...sourceRef.current,
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
      exportPng: (opts) => {
        if (!api) throw new Error("Excalidraw is not ready");
        return exportToBlob({
          elements: getNonDeletedElements(api.getSceneElements()),
          appState: { ...api.getAppState(), exportBackground: !opts?.transparent, exportWithDarkMode: false },
          files: api.getFiles(),
          mimeType: "image/png",
        });
      },
      exportSvg: async (opts) => {
        if (!api) throw new Error("Excalidraw is not ready");
        const svg = await exportToSvg({
          elements: getNonDeletedElements(api.getSceneElements()),
          appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: Boolean(opts?.dark) },
          files: api.getFiles(),
        });
        return svg.outerHTML;
      },
      exportJson: serialize,
      applyPreset: (preset) => replaceElements((els) => applyPreset(els, preset)),
      tidy: () => {
        replaceElements(tidyLayout);
        // The new layout can extend past the visible area: bring it all into view.
        if (api) showAll(api);
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
    <div ref={box} data-testid="diagram-editor" className="relative h-full w-full">
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
        }}
        viewModeEnabled={!editable}
        onLibraryChange={saveLibrary}
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
