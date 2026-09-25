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
  // A group frame is strictly larger than what it holds (two identical boxes are just overlapping shapes).
  return (
    outer.width * outer.height > inner.width * inner.height &&
    outer !== inner &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Number of shapes that already carry a palette fill: the next shape takes the next colour. */
export function paletteIndex(elements: El[]): number {
  return elements.filter(
    (e) => !e.isDeleted && SHAPES.has(e.type) && e.backgroundColor && e.backgroundColor !== "transparent",
  ).length;
}

/**
 * Style freshly converted elements. Shapes that contain other shapes are group
 * frames (Mermaid subgraphs) and get a dashed outline instead of a fill. Colours
 * the model set explicitly (a non-transparent fill) are kept.
 */
/** Light greys and white are Mermaid's defaults, not a colour the model chose. */
function isDefaultFill(color: unknown): boolean {
  if (typeof color !== "string" || color === "transparent") return true;
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h!, 16)) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b) < 16 && Math.min(r, g, b) > 200;
}

export function styleElements<T extends El>(elements: T[]): T[] {
  const shapes = elements.filter((e) => SHAPES.has(e.type) && !e.isDeleted);
  const frames = new Set(shapes.filter((s) => shapes.some((o) => contains(s, o))).map((s) => s.id));
  // Label of each shape, so repeated participants (e.g. sequence diagram actors) share a colour.
  const labelOf = new Map<string, string>();
  for (const e of elements) {
    if (e.type === "text" && e.containerId && typeof e.text === "string") labelOf.set(e.containerId, e.text);
  }
  const colourOfLabel = new Map<string, number>();
  let n = 0;
  return elements.map((e) => {
    if (e.type === "arrow") return { ...e, ...arrowStyle };
    if (e.type === "text") return { ...e, strokeColor: TEXT_COLOR };
    if (!SHAPES.has(e.type)) return e;
    if (frames.has(e.id)) {
      return {
        ...e,
        backgroundColor: "transparent",
        strokeColor: "#868e96",
        strokeStyle: "dashed",
        strokeWidth: 1,
        roughness: 0,
      };
    }
    const custom = !isDefaultFill(e.backgroundColor);
    // Rounded corners, matching shapes the AI adds later.
    const round = e.type === "ellipse" ? {} : { roundness: { type: 3 } };
    if (custom) return { ...e, ...round, fillStyle: "hachure", strokeWidth: 2 };
    const label = labelOf.get(e.id);
    const index = label !== undefined && colourOfLabel.has(label) ? colourOfLabel.get(label)! : n++;
    if (label !== undefined) colourOfLabel.set(label, index);
    return { ...e, ...round, ...shapeStyle(index) };
  });
}

export type Preset = "colorful" | "monochrome" | "clean" | "sketchy";

/** Excalidraw font families: 5 Excalifont (hand-drawn), 6 Nunito (clean sans). */
const FONT_HAND = 5;
const FONT_CLEAN = 6;

function touched<T extends El>(e: T, patch: Partial<El>): T {
  const version = typeof e.version === "number" ? e.version : 1;
  return { ...e, ...patch, version: version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) };
}

/**
 * Restyle a whole diagram (G7). Colourful re-applies the palette; Monochrome is
 * black ink on white; Clean is flat and precise (no roughness, solid fills, sans
 * text); Sketchy is rougher with cross-hatching. Group frames stay dashed outlines.
 */
export function applyPreset<T extends El>(elements: T[], preset: Preset): T[] {
  const live = elements.filter((e) => !e.isDeleted);
  const shapes = live.filter((e) => SHAPES.has(e.type));
  const frames = new Set(shapes.filter((s) => shapes.some((o) => contains(s, o))).map((s) => s.id));
  let n = 0;
  return elements.map((e) => {
    if (e.isDeleted) return e;
    if (e.type === "text") {
      return touched(e, { strokeColor: TEXT_COLOR, fontFamily: preset === "clean" ? FONT_CLEAN : FONT_HAND });
    }
    if (e.type === "arrow" || e.type === "line") {
      const roughness = preset === "clean" ? 0 : preset === "sketchy" ? 2 : 1;
      return touched(e, { strokeColor: preset === "monochrome" ? TEXT_COLOR : ARROW_COLOR, roughness, strokeWidth: 2 });
    }
    if (!SHAPES.has(e.type) || frames.has(e.id)) return e;
    const colour = PALETTE[n++ % PALETTE.length]!;
    switch (preset) {
      case "colorful":
        return touched(e, { ...shapeStyle(n - 1) });
      case "monochrome":
        return touched(e, {
          strokeColor: TEXT_COLOR,
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 2,
        });
      case "clean":
        return touched(e, {
          strokeColor: colour.stroke,
          backgroundColor: colour.fill,
          fillStyle: "solid",
          roughness: 0,
          strokeWidth: 1.5,
        });
      case "sketchy":
        return touched(e, {
          strokeColor: colour.stroke,
          backgroundColor: colour.fill,
          fillStyle: "cross-hatch",
          roughness: 2,
          strokeWidth: 2,
        });
    }
  });
}
