"use client";

import { tidyLayout } from "@/lib/diagram-layout";
import { styleElements } from "@/lib/diagram-style";
import { graphToSkeleton, parseFallback } from "@/lib/mermaid-fallback";

/**
 * Browser-only conversion of the AI's diagram input into an Excalidraw scene
 * (docs/DECISIONS.md #2): Mermaid and element skeletons both need the DOM.
 */

type Skeleton = Parameters<typeof import("@excalidraw/excalidraw").convertToExcalidrawElements>[0];

function scene(elements: unknown[], files: Record<string, unknown> = {}, mermaid?: string) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "canvas-chat",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files,
    // Kept so the Mermaid source panel can show and re-apply it (G8).
    ...(mermaid ? { mermaid } : {}),
  });
}

/**
 * Mermaid → editable scene. mermaid-to-excalidraw converts flowcharts, sequence
 * diagrams and some others natively; for types it can only draw as a flat image
 * (or can't parse), our own converter builds labelled shapes and arrows (G8).
 */
export async function mermaidToScene(mermaid: string): Promise<string> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  // Class, state, ER and mind-map diagrams: mermaid-to-excalidraw 2.2 draws these
  // as a flat image (and logs errors doing so), so use our converter directly.
  const fallback = parseFallback(mermaid);
  if (fallback) {
    const elements = convertToExcalidrawElements(graphToSkeleton(fallback) as Skeleton, { regenerateIds: true });
    // Tidy routes every arrow between its bound shapes (and bends back edges).
    return scene(styleElements(tidyLayout(elements as unknown as Parameters<typeof tidyLayout>[0])), {}, mermaid);
  }
  const native = await parseMermaidToExcalidraw(mermaid, { themeVariables: { fontSize: "20px" } });
  const elements = convertToExcalidrawElements(native.elements as Skeleton, { regenerateIds: true });
  return scene(styleElements(elements), native.files ?? {}, mermaid);
}

export async function skeletonToScene(skeleton: unknown[]): Promise<string> {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  return scene(styleElements(convertToExcalidrawElements(skeleton as Skeleton, { regenerateIds: true })));
}

/** The Mermaid source a scene was drawn from, if any. */
export function sceneMermaid(content: string): string {
  try {
    const value = (JSON.parse(content) as { mermaid?: unknown }).mermaid;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
