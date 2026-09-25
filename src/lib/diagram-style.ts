/**
 * House style for AI-drawn diagrams: Excalidraw's own pastel fills with hachure,
 * a matching darker stroke per shape, neutral arrows, and dashed group frames.
 * Pure, so the browser (Mermaid output) and the server (update_diagram) share it.
 */

export const PALETTE = [
  { fill: "#a5d8ff", stroke: "#1971c2" }, // blue
  { fill: "#b2f2bb", stroke: "#2f9e44" }, // green
  { fill: "#ffec99", stroke: "#f08c00" }, // yellow
  { fill: "#d0bfff", stroke: "#6741d9" }, // violet
  { fill: "#ffc9c9", stroke: "#e03131" }, // red
  { fill: "#ffd8a8", stroke: "#e8590c" }, // orange
  { fill: "#99e9f2", stroke: "#0c8599" }, // cyan
] as const;

export const ARROW_COLOR = "#495057";
export const TEXT_COLOR = "#1e1e1e";

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);

type El = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  backgroundColor?: string;
  containerId?: string | null;
  [key: string]: unknown;
};

export function shapeStyle(index: number) {
  const c = PALETTE[index % PALETTE.length]!;
  return {
    backgroundColor: c.fill,
    strokeColor: c.stroke,
    fillStyle: "hachure",
    strokeWidth: 2,
    roughness: 1,
  } as const;
}

export const arrowStyle = { strokeColor: ARROW_COLOR, strokeWidth: 2, roughness: 1 } as const;

function contains(outer: El, inner: El): boolean {
  return (
    outer !== inner &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Number of shapes that already carry a palette fill: the next shape takes the next colour. */
export function paletteIndex(elements: El[]): number {
  return elements.filter((e) => !e.isDeleted && SHAPES.has(e.type) && e.backgroundColor && e.backgroundColor !== "transparent")
    .length;
}

/**
 * Style freshly converted elements. Shapes that contain other shapes are group
 * frames (Mermaid subgraphs) and get a dashed outline instead of a fill. Colours
 * the model set explicitly (a non-transparent fill) are kept.
 */
export function styleElements<T extends El>(elements: T[]): T[] {
  const shapes = elements.filter((e) => SHAPES.has(e.type) && !e.isDeleted);
  const frames = new Set(shapes.filter((s) => shapes.some((o) => contains(s, o))).map((s) => s.id));
  let n = 0;
  return elements.map((e) => {
    if (e.type === "arrow") return { ...e, ...arrowStyle };
    if (e.type === "text") return { ...e, strokeColor: TEXT_COLOR };
    if (!SHAPES.has(e.type)) return e;
    if (frames.has(e.id)) {
      return { ...e, backgroundColor: "transparent", strokeColor: "#868e96", strokeStyle: "dashed", strokeWidth: 1, roughness: 0 };
    }
    const custom = e.backgroundColor && e.backgroundColor !== "transparent";
    // Rounded corners, matching shapes the AI adds later.
    const round = e.type === "ellipse" ? {} : { roundness: { type: 3 } };
    const styled = custom ? { ...e, ...round, fillStyle: "hachure", strokeWidth: 2 } : { ...e, ...round, ...shapeStyle(n) };
    n++;
    return styled;
  });
}
