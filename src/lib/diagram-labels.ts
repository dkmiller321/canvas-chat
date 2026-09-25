/**
 * Arrow label placement (G10). Excalidraw draws a bound label at the middle of an
 * arrow's points, so labels on arrows that fan out or share a gap can land on top
 * of each other. This pass tries positions along each arrow, middle first, and
 * keeps the first that is clear of shapes, earlier labels and frame borders (and,
 * for an arrow between groups, outside any frame holding only one of its ends).
 * The chosen spot is then made the arrow's middle point.
 */

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type El = Box & {
  id: string;
  type: string;
  isDeleted?: boolean;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  points?: unknown;
  [key: string]: unknown;
};

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);
const T = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];
const MARGIN = 4;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
const lerp = (p: Point, q: Point, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

/** Points with `p` as the middle one: pad the shorter side with points along its last stretch. */
export function withMiddle(before: Point[], p: Point, after: Point[]): Point[] {
  const padBefore = Math.max(0, after.length - before.length);
  const padAfter = Math.max(0, before.length - after.length);
  const last = before.at(-1)!;
  const next = after[0]!;
  return [
    ...before,
    ...Array.from({ length: padBefore }, (_, k) => lerp(last, p, (k + 1) / (padBefore + 1))),
    p,
    ...Array.from({ length: padAfter }, (_, k) => lerp(p, next, (k + 1) / (padAfter + 1))),
    ...after,
  ];
}

export function placeLabels<T extends El>(elements: T[], frames: Box[] = []): T[] {
  const live = elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e]));
  const shapes = live.filter((e) => SHAPES.has(e.type));
  const labelOf = new Map(live.filter((e) => e.type === "text" && e.containerId).map((t) => [t.containerId!, t]));
  const placed: Box[] = [];
  const moved = new Map<string, Point[]>();

  for (const a of live) {
    if (a.type !== "arrow" || !Array.isArray(a.points)) continue;
    const text = labelOf.get(a.id);
    if (!text) continue;
    const pts = (a.points as [number, number][]).map(([x, y]) => ({ x: a.x + x, y: a.y + y }));
    if (pts.length < 2) continue;
    const ends = [a.startBinding?.elementId, a.endBinding?.elementId].map((id) => (id ? byId.get(id) : undefined));
    // Frames holding exactly one end: the label belongs outside them.
    const between = frames.filter((f) => ends.filter((e) => e && inside(f, e)).length === 1);
    const size = { width: text.width + 2 * MARGIN, height: text.height + 2 * MARGIN };
    const boxAt = (c: Point): Box => ({ x: c.x - size.width / 2, y: c.y - size.height / 2, ...size });
    const cost = (c: Point) => {
      const b = boxAt(c);
      let n = 0;
      for (const s of shapes) if (overlaps(b, s)) n += 2;
      for (const l of placed) if (overlaps(b, l)) n += 2;
      for (const f of frames) if (overlaps(b, f) && !inside(f, b)) n += 1;
      for (const f of between) if (overlaps(b, f)) n += 1;
      return n;
    };

    // Segments from the middle outwards; along each, positions from its middle outwards.
    const mid = (pts.length - 2) / 2;
    const segments = pts
      .slice(1)
      .map((_, k) => k)
      .sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
    let best: { seg: number; t: number; c: Point; cost: number } | null = null;
    search: for (const seg of segments) {
      for (const t of T) {
        const c = lerp(pts[seg]!, pts[seg + 1]!, t);
        const k = cost(c);
        if (!best || k < best.cost) best = { seg, t, c, cost: k };
        if (k === 0) break search;
      }
    }
    if (!best) continue;
    placed.push(boxAt(best.c));
    moved.set(a.id, withMiddle(pts.slice(0, best.seg + 1), best.c, pts.slice(best.seg + 1)));
  }

  return elements.map((e) => {
    const next = moved.get(e.id);
    if (!next) return e;
    const start = next[0]!;
    const xs = next.map((p) => p.x);
    const ys = next.map((p) => p.y);
    return {
      ...e,
      x: start.x,
      y: start.y,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: next.map((p) => [p.x - start.x, p.y - start.y] as [number, number]),
    };
  });
}
