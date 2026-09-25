/**
 * Tidy-up (G7): a small layered layout for flow diagrams. Shapes connected by
 * arrows are ranked left to right by longest path from the sources, each column
 * is ordered by its predecessors' positions (one barycenter sweep), and columns
 * are centred vertically. Labels move with their shapes; arrows keep their
 * bindings and are re-routed as straight lines. Group frames, free text and
 * unconnected lines are left where they are.
 */

type El = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  [key: string]: unknown;
};

type Box = { x: number; y: number; width: number; height: number };

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);
const COLUMN_GAP = 110;
const ROW_GAP = 60;

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Where the ray from a box's centre towards `toward` leaves the box. */
export function edgePoint(b: Box, toward: { x: number; y: number }) {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : b.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : b.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function contains(outer: Box, inner: Box) {
  // A group frame is strictly larger than what it holds (two identical boxes are just overlapping shapes).
  return (
    outer.width * outer.height > inner.width * inner.height &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function tidyLayout<T extends El>(elements: T[]): T[] {
  const live = elements.filter((e) => !e.isDeleted);
  const allShapes = live.filter((e) => SHAPES.has(e.type));
  const frames = new Set(allShapes.filter((s) => allShapes.some((o) => o !== s && contains(s, o))).map((s) => s.id));
  const nodes = allShapes.filter((s) => !frames.has(s.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = live
    .filter((e) => e.type === "arrow")
    .map((a) => ({ arrow: a, from: a.startBinding?.elementId, to: a.endBinding?.elementId }))
    .filter(
      (e): e is { arrow: T; from: string; to: string } =>
        !!e.from && !!e.to && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to,
    );
  if (nodes.length === 0) return elements;

  // Longest-path ranks; back edges (cycles) are ignored.
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const byTopY = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const visiting = new Set<string>();
  const visit = (id: string, r: number) => {
    if (visiting.has(id) || (rank.get(id) ?? -1) >= r) return;
    rank.set(id, r);
    visiting.add(id);
    for (const next of out.get(id) ?? []) visit(next, r + 1);
    visiting.delete(id);
  };
  for (const n of byTopY) if ((indeg.get(n.id) ?? 0) === 0) visit(n.id, 0);
  for (const n of byTopY) if (!rank.has(n.id)) visit(n.id, 0);

  // Columns ordered by predecessors' positions, falling back to the original top-to-bottom order.
  const preds = new Map<string, string[]>();
  for (const e of edges) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
  const columns: T[][] = [];
  for (const n of byTopY) (columns[rank.get(n.id)!] ??= []).push(n);
  const order = new Map<string, number>();
  columns.forEach((col, ci) => {
    if (ci > 0) {
      const key = (n: T) => {
        const ps = (preds.get(n.id) ?? []).map((p) => order.get(p)).filter((v): v is number => v !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER;
      };
      col.sort((a, b) => key(a) - key(b));
    }
    col.forEach((n, i) => order.set(n.id, i));
  });

  // Place columns left to right, each centred on the original diagram's vertical centre.
  const originX = Math.min(...nodes.map((n) => n.x));
  const midY = (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y + n.height))) / 2;
  const placed = new Map<string, Box>();
  let x = originX;
  for (const col of columns) {
    if (!col) continue;
    const width = Math.max(...col.map((n) => n.width));
    const height = col.reduce((sum, n) => sum + n.height, 0) + ROW_GAP * (col.length - 1);
    let y = midY - height / 2;
    for (const n of col) {
      placed.set(n.id, { x: x + (width - n.width) / 2, y, width: n.width, height: n.height });
      y += n.height + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  }

  const moved = new Map<string, { dx: number; dy: number }>();
  for (const n of nodes) {
    const box = placed.get(n.id)!;
    moved.set(n.id, { dx: box.x - n.x, dy: box.y - n.y });
  }
  const bump = (e: T, patch: Partial<El>): T => ({
    ...e,
    ...patch,
    version: (typeof e.version === "number" ? e.version : 1) + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
  });

  return elements.map((e) => {
    if (e.isDeleted) return e;
    const own = moved.get(e.id);
    if (own) return bump(e, { x: e.x + own.dx, y: e.y + own.dy });
    const parent = e.containerId ? moved.get(e.containerId) : undefined;
    if (parent) return bump(e, { x: e.x + parent.dx, y: e.y + parent.dy });
    if (e.type === "arrow") {
      const from = e.startBinding?.elementId ? placed.get(e.startBinding.elementId) : undefined;
      const to = e.endBinding?.elementId ? placed.get(e.endBinding.elementId) : undefined;
      if (!from || !to) return e;
      const start = edgePoint(from, center(to));
      const end = edgePoint(to, center(from));
      return bump(e, {
        x: start.x,
        y: start.y,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        points: [
          [0, 0],
          [end.x - start.x, end.y - start.y],
        ],
      });
    }
    return e;
  });
}
