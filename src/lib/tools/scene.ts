/**
 * Minimal server-side view of an Excalidraw scene. The editor's own `restore()`
 * fills in any element fields we don't set when the scene is loaded.
 */

export type Binding = { elementId: string; focus?: number; gap?: number; fixedPoint?: [number, number] | null };

export type SceneElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  boundElements?: { id: string; type: "text" | "arrow" }[] | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  points?: [number, number][];
  label?: { text: string };
  [key: string]: unknown;
};

export type Scene = {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: SceneElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  /** Mermaid source the diagram was drawn from, kept for the source panel (G8). */
  mermaid?: string;
};

export function parseScene(content: string): Scene {
  const scene = JSON.parse(content) as Scene;
  if (scene.type !== "excalidraw" || !Array.isArray(scene.elements)) {
    throw new Error("Not an Excalidraw scene");
  }
  return scene;
}

export function liveElements(scene: Scene): SceneElement[] {
  return scene.elements.filter((e) => !e.isDeleted);
}

/** Text of the label bound to a container or arrow, if any. */
export function labelOf(scene: Scene, el: SceneElement): string | undefined {
  if (el.type === "text") return el.text;
  const bound = el.boundElements?.find((b) => b.type === "text");
  if (!bound) return el.label?.text;
  const text = scene.elements.find((e) => e.id === bound.id && !e.isDeleted);
  return text?.text;
}

export type ElementSummary = {
  id: string;
  type: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  from?: string;
  to?: string;
};

/**
 * Compact element list sent to the model instead of the raw scene (PRD: context).
 * Text bound inside a container is folded into that container's label.
 */
export function summarizeScene(scene: Scene): ElementSummary[] {
  return liveElements(scene)
    .filter((e) => !(e.type === "text" && e.containerId))
    .map((e) => {
      const summary: ElementSummary = {
        id: e.id,
        type: e.type,
        x: Math.round(e.x),
        y: Math.round(e.y),
        w: Math.round(e.width),
        h: Math.round(e.height),
      };
      const label = labelOf(scene, e);
      if (label) summary.label = label;
      if (e.startBinding?.elementId) summary.from = e.startBinding.elementId;
      if (e.endBinding?.elementId) summary.to = e.endBinding.elementId;
      return summary;
    });
}
