"use client";

import { styleElements } from "@/lib/diagram-style";

/**
 * Browser-only conversion of the AI's diagram input into an Excalidraw scene
 * (docs/DECISIONS.md #2): Mermaid and element skeletons both need the DOM.
 */

type Skeleton = Parameters<typeof import("@excalidraw/excalidraw").convertToExcalidrawElements>[0];

function scene(elements: unknown[], files: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "canvas-chat",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files,
  });
}

export async function mermaidToScene(mermaid: string): Promise<string> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  const { elements, files } = await parseMermaidToExcalidraw(mermaid, { themeVariables: { fontSize: "20px" } });
  return scene(styleElements(convertToExcalidrawElements(elements as Skeleton, { regenerateIds: true })), files ?? {});
}

export async function skeletonToScene(skeleton: unknown[]): Promise<string> {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  return scene(styleElements(convertToExcalidrawElements(skeleton as Skeleton, { regenerateIds: true })));
}
