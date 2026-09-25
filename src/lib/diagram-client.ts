"use client";

import { type DiagramLanguage, parseSource } from "@/lib/diagram-formats";
import { compoundLayout } from "@/lib/diagram-compound";
import { type Graph, elementIds, graphToSkeleton } from "@/lib/diagram-formats/graph";
import type { tidyLayout } from "@/lib/diagram-layout";
import { styleElements } from "@/lib/diagram-style";
import { isFlowchart, parseFlowchart } from "@/lib/diagram-formats/mermaid-flowchart";
import { parseFallback } from "@/lib/mermaid-fallback";

/**
 * Browser-only conversion of the AI's diagram input into an Excalidraw scene
 * (docs/DECISIONS.md #2): Mermaid and element skeletons both need the DOM.
 */

type Skeleton = Parameters<typeof import("@excalidraw/excalidraw").convertToExcalidrawElements>[0];
type LayoutEl = Parameters<typeof tidyLayout>[0][number];

/** The source a diagram was drawn from, kept so the source panel can show and re-apply it (G8, G10). */
export type DiagramSource = { language: DiagramLanguage; code: string };

function scene(elements: unknown[], files: Record<string, unknown> = {}, source?: DiagramSource) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "canvas-chat",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files,
    // Mermaid keeps its original field so scenes saved before G10 still read the same.
    ...(source?.language === "mermaid" ? { mermaid: source.code } : source ? { diagramSource: source } : {}),
  });
}

/** Graph → laid-out, styled elements, with a dashed frame and title around each group. */
/**
 * Real text widths in Excalidraw's hand-drawn font. Sizing shapes from a character
 * estimate cut labels off ("Post-Processing & Formattin"), and converting before the
 * font had loaded measured the group titles in a fallback font.
 */
async function measureText(): Promise<(text: string) => number> {
  await Promise.all([document.fonts.load("20px Excalifont"), document.fonts.load("16px Excalifont")]).catch(() => []);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (text) => text.length * 11;
  ctx.font = "20px Excalifont, Xiaolai, sans-serif";
  return (text) => ctx.measureText(text).width;
}

async function graphElements(g: Graph): Promise<unknown[]> {
  const [{ convertToExcalidrawElements }, measure] = await Promise.all([
    import("@excalidraw/excalidraw"),
    measureText(),
  ]);
  const ids = elementIds(g);
  const elements = convertToExcalidrawElements(graphToSkeleton(g, measure) as Skeleton, { regenerateIds: false });
  // Tidy routes every arrow between its bound shapes (and bends back edges); groups are laid out as nested boxes.
  const { elements: laid, frames: groupBoxes } = compoundLayout(elements as unknown as LayoutEl[], g, ids);
  if (!groupBoxes.length) return styleElements(laid);

  const frames = groupBoxes.flatMap((f) => [
    {
      type: "rectangle",
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      strokeStyle: "dashed",
      backgroundColor: "transparent",
    },
    { type: "text", x: f.x + 14, y: f.y + 8, text: f.label, fontSize: 16 },
  ]);
  const frameElements = convertToExcalidrawElements(frames as Skeleton, { regenerateIds: true });
  // Frames first, so they sit behind what they hold.
  return styleElements([...(frameElements as unknown as LayoutEl[]), ...laid]);
}

export async function graphToScene(g: Graph, source?: DiagramSource): Promise<string> {
  return scene(await graphElements(g), {}, source);
}

/**
 * Mermaid → editable scene. mermaid-to-excalidraw converts flowcharts, sequence
 * diagrams and some others natively; for types it can only draw as a flat image
 * (or can't parse), our own converter builds labelled shapes and arrows (G8).
 */
export async function mermaidToScene(mermaid: string, source: DiagramSource = { language: "mermaid", code: mermaid }) {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  // Class, state, ER and mind-map diagrams: mermaid-to-excalidraw 2.2 draws these
  // as a flat image (and logs errors doing so), so use our converter directly.
  const fallback = parseFallback(mermaid);
  if (fallback) return graphToScene(fallback, source);
  // Flowcharts: our parser, the same one the server checked the model's source with (G10).
  if (isFlowchart(mermaid)) return graphToScene(parseFlowchart(mermaid), source);
  const native = await parseMermaidToExcalidraw(mermaid, { themeVariables: { fontSize: "20px" } });
  const elements = convertToExcalidrawElements(native.elements as Skeleton, { regenerateIds: true });
  return scene(styleElements(elements), native.files ?? {}, source);
}

/** Any supported source → scene (G10). Throws DiagramSyntaxError for source it can't read. */
export async function sourceToScene(source: DiagramSource): Promise<string> {
  if (source.language === "mermaid") return mermaidToScene(source.code);
  const parsed = parseSource(source.language, source.code);
  return "graph" in parsed ? graphToScene(parsed.graph, source) : mermaidToScene(parsed.mermaid, source);
}

export async function skeletonToScene(skeleton: unknown[]): Promise<string> {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  return scene(styleElements(convertToExcalidrawElements(skeleton as Skeleton, { regenerateIds: true })));
}

/** The source a scene was drawn from, if any. */
export function sceneSource(content: string): DiagramSource | null {
  try {
    const scene = JSON.parse(content) as { mermaid?: unknown; diagramSource?: { language?: unknown; code?: unknown } };
    const d = scene.diagramSource;
    if (d && typeof d.language === "string" && typeof d.code === "string") {
      return { language: d.language as DiagramLanguage, code: d.code };
    }
    return typeof scene.mermaid === "string" ? { language: "mermaid", code: scene.mermaid } : null;
  } catch {
    return null;
  }
}
