import { z } from "zod";

/**
 * The neutral diagram graph (G10). Every non-Mermaid format (the AI's JSON graph,
 * DOT, PlantUML, D2) and the Mermaid types that mermaid-to-excalidraw can't draw
 * are parsed into this, then turned into Excalidraw skeletons and laid out.
 */

export type NodeShape = "rectangle" | "ellipse" | "diamond";
export type GraphNode = {
  id: string;
  label: string;
  shape: NodeShape;
  /** Filled start/end marker (state diagrams). */
  small?: boolean;
  /** Id of the innermost group holding this node. */
  group?: string;
  /** Fill colour the author chose. */
  color?: string;
};
export type GraphEdge = { from: string; to: string; label?: string; dashed?: boolean; arrow?: "end" | "none" | "both" };
export type GraphGroup = { id: string; label: string; parent?: string };
export type Graph = { direction?: "right" | "down"; nodes: GraphNode[]; edges: GraphEdge[]; groups?: GraphGroup[] };

/** A syntax error in diagram source, reported with its 1-based line. */
export class DiagramSyntaxError extends Error {
  constructor(message: string, line?: number) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = "DiagramSyntaxError";
  }
}

/**
 * The JSON graph the AI (or the user, in the source panel) writes. Lenient where
 * real models slip (2026-09-25): any shape name (mapped to ours) and null for
 * anything optional.
 */
export const graphInput = z.object({
  direction: z.enum(["right", "down"]).nullish().describe("Flow direction; default right"),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().nullish().describe("Shown text; defaults to the id"),
        shape: z.string().nullish().describe("rectangle (default), ellipse or diamond"),
        group: z.string().nullish().describe("Id of the group this node sits in"),
        color: z.string().nullish().describe("Fill colour, e.g. #ffc9c9"),
      }),
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().nullish(),
        dashed: z.boolean().nullish(),
        arrow: z.enum(["end", "none", "both"]).nullish().describe("Arrowheads; default end"),
      }),
    )
    .nullish(),
  groups: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().nullish(),
        parent: z.string().nullish().describe("Id of an enclosing group"),
      }),
    )
    .nullish()
    .describe("Boxes drawn around the nodes whose `group` is their id"),
});
export type GraphInput = z.infer<typeof graphInput>;

/** Any shape name → one we draw. */
function shapeOf(name: string | null | undefined): NodeShape {
  const s = (name ?? "").toLowerCase();
  if (/ellipse|circle|oval|cylinder|database|\bdb\b|stadium|pill|person|actor/.test(s)) return "ellipse";
  if (/diamond|decision|rhomb|question/.test(s)) return "diamond";
  return "rectangle";
}

/** Validated input → Graph. Edges to unknown ids create plain nodes; unknown or empty groups are an error. */
export function normalizeGraph(input: GraphInput): Graph {
  const groups = (input.groups ?? []).map((g) => ({ id: g.id, label: g.label ?? g.id, parent: g.parent ?? undefined }));
  const groupIds = new Set(groups.map((g) => g.id));
  for (const g of groups) {
    if (g.parent && !groupIds.has(g.parent))
      throw new DiagramSyntaxError(`group "${g.id}" has unknown parent "${g.parent}"`);
  }
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  for (const n of input.nodes) {
    if (seen.has(n.id)) throw new DiagramSyntaxError(`node id "${n.id}" is used twice`);
    if (n.group && !groupIds.has(n.group))
      throw new DiagramSyntaxError(`node "${n.id}" is in unknown group "${n.group}"`);
    seen.add(n.id);
    nodes.push({
      id: n.id,
      label: n.label ?? n.id,
      shape: shapeOf(n.shape),
      ...(n.group ? { group: n.group } : {}),
      ...(n.color ? { color: n.color } : {}),
    });
  }
  // A group nothing sits in draws nothing, yet the model then says it grouped the nodes.
  const used = (gid: string): boolean =>
    nodes.some((n) => n.group === gid) || groups.some((c) => c.parent === gid && used(c.id));
  for (const g of groups) {
    if (!used(g.id)) {
      throw new DiagramSyntaxError(
        `group "${g.id}" has no nodes: set "group": "${g.id}" on the nodes that belong in it`,
      );
    }
  }
  const edges: GraphEdge[] = [];
  for (const e of input.edges ?? []) {
    for (const id of [e.from, e.to]) {
      if (!seen.has(id)) {
        seen.add(id);
        nodes.push({ id, label: id, shape: "rectangle" });
      }
    }
    edges.push({
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
      ...(e.dashed ? { dashed: true } : {}),
      ...(e.arrow && e.arrow !== "end" ? { arrow: e.arrow } : {}),
    });
  }
  return { direction: input.direction ?? "right", nodes, edges, ...(groups.length ? { groups } : {}) };
}

/** JSON text → Graph, for the source panel. */
export function parseGraphJson(text: string): Graph {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new DiagramSyntaxError(`not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const parsed = graphInput.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new DiagramSyntaxError(`${issue.path.join(".") || "graph"}: ${issue.message}`);
  }
  return normalizeGraph(parsed.data);
}

// ---- skeletons --------------------------------------------------------------

export type Skeleton =
  | {
      type: "rectangle" | "ellipse" | "diamond";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label?: { text: string };
      backgroundColor?: string;
    }
  | {
      type: "arrow";
      x: number;
      y: number;
      start: { id: string };
      end: { id: string };
      label?: { text: string };
      startArrowhead?: "arrow" | null;
      endArrowhead?: "arrow" | null;
      strokeStyle?: "dashed";
    };

const FONT = 20;
const CHAR = FONT * 0.55;
const LINE = FONT * 1.35;

function size(node: GraphNode) {
  if (node.small) return { width: 36, height: 36 };
  const rows = node.label.split("\n");
  const width = Math.max(120, Math.max(...rows.map((r) => r.length)) * CHAR + 48);
  const height = Math.max(60, rows.length * LINE + 28);
  return node.shape === "ellipse"
    ? { width: width * 1.2, height: height * 1.2 }
    : node.shape === "diamond"
      ? { width: width * 1.4, height: height * 1.4 }
      : { width, height };
}

/**
 * Element ids for a graph's nodes: the node id when it is short and simple
 * (so the model can refer to it later), otherwise `n<index>`.
 */
export function elementIds(g: Graph): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  g.nodes.forEach((n, i) => {
    const id = /^[\w-]{1,40}$/.test(n.id) && !used.has(n.id) ? n.id : `n${i + 1}`;
    used.add(id);
    ids.set(n.id, id);
  });
  return ids;
}

/** Starting positions in simple layers; `tidyLayout` does the real layout afterwards. */
function positions(g: Graph): Map<string, { x: number; y: number; width: number; height: number }> {
  const out = new Map<string, { x: number; y: number; width: number; height: number }>();
  const sizes = new Map(g.nodes.map((n) => [n.id, size(n)]));
  const children = new Map<string, string[]>();
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) {
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const seen = new Set<string>();
  const visit = (id: string, r: number) => {
    if (seen.has(id) || (rank.get(id) ?? -1) >= r) return;
    rank.set(id, r);
    seen.add(id);
    for (const c of children.get(id) ?? []) visit(c, r + 1);
    seen.delete(id);
  };
  for (const n of g.nodes) if ((indeg.get(n.id) ?? 0) === 0) visit(n.id, 0);
  for (const n of g.nodes) if (!rank.has(n.id)) visit(n.id, 0);

  const columns: string[][] = [];
  for (const n of g.nodes) (columns[rank.get(n.id)!] ??= []).push(n.id);
  let x = 0;
  for (const col of columns) {
    if (!col) continue;
    const w = Math.max(...col.map((id) => sizes.get(id)!.width));
    const h = col.reduce((s, id) => s + sizes.get(id)!.height, 0) + 50 * (col.length - 1);
    let y = -h / 2;
    for (const id of col) {
      const s = sizes.get(id)!;
      out.set(id, { x: x + (w - s.width) / 2, y, ...s });
      y += s.height + 50;
    }
    x += w + 120;
  }
  return out;
}

export function graphToSkeleton(g: Graph): Skeleton[] {
  const pos = positions(g);
  const ids = elementIds(g);
  const shapes: Skeleton[] = g.nodes.map((n) => {
    const p = pos.get(n.id)!;
    return {
      type: n.shape,
      id: ids.get(n.id)!,
      ...p,
      ...(n.small ? { backgroundColor: "#1e1e1e" } : { label: { text: n.label } }),
      ...(n.color && !n.small ? { backgroundColor: n.color } : {}),
    };
  });
  const arrows: Skeleton[] = g.edges.map((e) => {
    const a = pos.get(e.from)!;
    return {
      type: "arrow",
      x: a.x + a.width,
      y: a.y + a.height / 2,
      start: { id: ids.get(e.from)! },
      end: { id: ids.get(e.to)! },
      ...(e.label ? { label: { text: e.label } } : {}),
      startArrowhead: e.arrow === "both" ? "arrow" : null,
      endArrowhead: e.arrow === "none" ? null : "arrow",
      ...(e.dashed ? { strokeStyle: "dashed" as const } : {}),
    };
  });
  return [...shapes, ...arrows];
}
