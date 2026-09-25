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
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";

type Elements = Parameters<typeof hashElementsVersion>[0];

export type DiagramEditorHandle = {
  exportPng: () => Promise<Blob>;
  exportSvg: () => Promise<string>;
  exportJson: () => string;
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
};

type StoredScene = { elements?: unknown[]; appState?: { viewBackgroundColor?: string }; files?: Record<string, unknown> };

function parse(content: string) {
  const scene = JSON.parse(content) as StoredScene;
  const elements = restoreElements(scene.elements as Parameters<typeof restoreElements>[0], null, {
    repairBindings: true,
    refreshDimensions: true,
  });
  return { elements, files: scene.files ?? {}, background: scene.appState?.viewBackgroundColor ?? "#ffffff" };
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

export function DiagramEditor({ handleRef, content, contentKey, editable, onUserChange }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const dark = useDarkTheme();
  const initial = useMemo(() => parse(content), []); // eslint-disable-line react-hooks/exhaustive-deps -- first load only
  // Version hash of what was last loaded or saved; onChange with a different hash is a user edit.
  const savedHash = useRef(hashElementsVersion(initial.elements as Elements));
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (!api || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    const next = parse(content);
    savedHash.current = hashElementsVersion(next.elements as Elements);
    api.updateScene({ elements: next.elements, captureUpdate: CaptureUpdateAction.NEVER });
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
    });
  };

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
    }),
    [api], // eslint-disable-line react-hooks/exhaustive-deps -- serialize only depends on api
  );

  return (
    <div data-testid="diagram-editor" className="h-full w-full">
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
        onChange={(elements) => {
          const hash = hashElementsVersion(elements);
          if (hash === savedHash.current) return;
          savedHash.current = hash;
          onUserChangeRef.current(serialize);
        }}
      />
    </div>
  );
}
