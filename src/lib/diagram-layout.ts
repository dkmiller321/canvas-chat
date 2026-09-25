/**
 * Tidy-up (G7): a small layered layout for flow diagrams. Shapes connected by
 * arrows are ranked left to right by longest path, with sources pulled next to
 * their targets. Arrows spanning several columns get an empty slot in each column
 * they pass through; columns are ordered by barycenter sweeps (keeping the order
 * with fewest crossings) and centred vertically. Labels move with their shapes;
 * arrows keep their bindings and are re-routed as straight lines, or through
 * their slots. Group frames, free text and unconnected lines are left where they are.
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
/** Height of the slot an arrow takes when it passes through a column. */
const DUMMY_HEIGHT = 24;

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

export type LayoutOptions = {
  /** "down" lays the flow out top to bottom (G10). */
  direction?: "right" | "down";
};

export function tidyLayout<T extends El>(elements: T[], { direction = "right" }: LayoutOptions = {}): T[] {
  if (direction === "right") return layoutRight(elements);
  // Top to bottom is the same layout with x and y swapped.
  return layoutRight(elements.map(transpose)).map(transpose);
}

function transpose<T extends El>(e: T): T {
  const points = Array.isArray(e.points) ? (e.points as [number, number][]).map(([x, y]) => [y, x]) : undefined;
  return { ...e, x: e.y, y: e.x, width: e.height, height: e.width, ...(points ? { points } : {}) };
}

function layoutRight<T extends El>(elements: T[]): T[] {
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
  // A source sits just before its nearest target, so its arrows don't span columns.
  for (const n of byTopY) {
    if ((indeg.get(n.id) ?? 0) > 0) continue;
    const later = (out.get(n.id) ?? []).map((t) => rank.get(t)!).filter((r) => r > rank.get(n.id)!);
    if (later.length) rank.set(n.id, Math.min(...later) - 1);
  }

  const labelWidth = new Map<string, number>();
  const labelHeight = new Map<string, number>();
  for (const el of live) {
    if (el.type === "text" && el.containerId) {
      labelWidth.set(el.containerId, el.width);
      labelHeight.set(el.containerId, el.height);
    }
  }

  // Each column holds shapes plus one empty slot for every arrow passing through it,
  // so an arrow spanning columns is routed between the shapes instead of across them.
  type Slot = { id: string; width: number; height: number };
  const columns: Slot[][] = [];
  for (const n of byTopY) (columns[rank.get(n.id)!] ??= []).push(n);
  const via = new Map<string, string[]>();
  const links: { from: string; to: string; arrow: string }[] = [];
  for (const e of edges) {
    const r0 = rank.get(e.from)!;
    const r1 = rank.get(e.to)!;
    if (r1 <= r0) continue;
    const ids: string[] = [];
    let prev = e.from;
    for (let r = r0 + 1; r < r1; r++) {
      const id = `${e.arrow.id}#${r}`;
      const width = labelWidth.get(e.arrow.id) ?? 0;
      (columns[r] ??= []).push({ id, width, height: Math.max(DUMMY_HEIGHT, labelHeight.get(e.arrow.id) ?? 0) });
      links.push({ from: prev, to: id, arrow: e.arrow.id });
      ids.push(id);
      prev = id;
    }
    links.push({ from: prev, to: e.to, arrow: e.arrow.id });
    via.set(e.arrow.id, ids);
  }

  // Order each column by its neighbours' positions (barycenter), sweeping right then
  // left a few times and keeping the order with the fewest crossings.
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const l of links) {
    preds.set(l.to, [...(preds.get(l.to) ?? []), l.from]);
    succs.set(l.from, [...(succs.get(l.from) ?? []), l.to]);
  }
  const pos = new Map<string, number>();
  const index = () => columns.forEach((col) => col?.forEach((s, i) => pos.set(s.id, i)));
  index();
  const reorder = (col: Slot[] | undefined, neighbours: Map<string, string[]>) => {
    if (!col) return;
    const key = new Map(
      col.map((s) => {
        const ps = (neighbours.get(s.id) ?? []).map((p) => pos.get(p)!);
        return [s.id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos.get(s.id)!] as const;
      }),
    );
    col.sort((a, b) => key.get(a.id)! - key.get(b.id)!);
    col.forEach((s, i) => pos.set(s.id, i));
  };
  const colOf = new Map<string, number>();
  columns.forEach((col, ci) => col?.forEach((s) => colOf.set(s.id, ci)));
  // Links always join adjacent columns; two links in the same gap cross when their ends swap order.
  const crossings = () => {
    let count = 0;
    for (let i = 0; i < links.length; i++)
      for (let j = i + 1; j < links.length; j++) {
        const a = links[i]!;
        const b = links[j]!;
        if (a.from === b.from || a.to === b.to) continue;
        const sameGap = colOf.get(a.from) === colOf.get(b.from);
        if (sameGap && (pos.get(a.from)! - pos.get(b.from)!) * (pos.get(a.to)! - pos.get(b.to)!) < 0) count++;
      }
    return count;
  };
  let best = { score: crossings(), order: columns.map((c) => c?.slice()) };
  for (let pass = 0; pass < 4 && best.score > 0; pass++) {
    for (let c = 1; c < columns.length; c++) reorder(columns[c], preds);
    for (let c = columns.length - 2; c >= 0; c--) reorder(columns[c], succs);
    const score = crossings();
    if (score < best.score) best = { score, order: columns.map((c) => c?.slice()) };
  }
  best.order.forEach((col, ci) => (columns[ci] = col!));
  index();

  // Place columns left to right, each centred on the original diagram's vertical centre.
  const originX = Math.min(...nodes.map((n) => n.x));
  const midY = (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y + n.height))) / 2;
  const placed = new Map<string, Box>();
  let x = originX;
  // A gap must fit the widest label on the arrows leaving that column.
  const gapAfter = (col: Slot[]) => {
    const ids = new Set(col.map((n) => n.id));
    const labelled = links.filter((l) => ids.has(l.from) && labelWidth.has(l.arrow));
    const widest = Math.max(0, ...labelled.map((l) => labelWidth.get(l.arrow)!));
    // Several labels crossing one gap need room to be staggered along it.
    const crowd = Math.max(0, new Set(labelled.map((l) => l.arrow)).size - 2) * 16;
    return Math.max(COLUMN_GAP, widest + 60) + crowd;
  };
  for (const col of columns) {
    if (!col) continue;
    const width = Math.max(...col.map((n) => n.width));
    const height = col.reduce((sum, n) => sum + n.height, 0) + ROW_GAP * (col.length - 1);
    let y = midY - height / 2;
    for (const n of col) {
      placed.set(n.id, { x: x + (width - n.width) / 2, y, width: n.width, height: n.height });
      y += n.height + ROW_GAP;
    }
    x += width + gapAfter(col);
  }

  // Extent of each column, for routing back edges around them.
  const colBox = columns.map((col) => {
    if (!col?.length) return undefined;
    const boxes = col.map((s) => placed.get(s.id)!);
    return {
      x0: Math.min(...boxes.map((b) => b.x)),
      x1: Math.max(...boxes.map((b) => b.x + b.width)),
      y1: Math.max(...boxes.map((b) => b.y + b.height)),
    };
  });
  const spanned = (a: number, b: number) => colBox.slice(a, b + 1).filter((c) => c !== undefined);
  /** Middle of the gap before column c (or just left of it, for the first). */
  const gapLeftOf = (c: number) => {
    const prev = colBox.slice(0, c).findLast((b) => b !== undefined);
    return prev ? (prev.x1 + colBox[c]!.x0) / 2 : colBox[c]!.x0 - 40;
  };
  /** Middle of the gap after column c (or just right of it, for the last). */
  const gapRightOf = (c: number) => {
    const next = colBox.slice(c + 1).find((b) => b !== undefined);
    return next ? (colBox[c]!.x1 + next.x0) / 2 : colBox[c]!.x1 + 40;
  };

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
      const fromId = e.startBinding?.elementId;
      const toId = e.endBinding?.elementId;
      const from = fromId ? placed.get(fromId) : undefined;
      const to = toId ? placed.get(toId) : undefined;
      if (!from || !to) return e;
      // An arrow pointing back up the flow leaves into the gap before its column,
      // runs below every shape in the columns it spans, and comes back up the gap
      // after its target's column, so it crosses no shape (and doesn't lie on the
      // forward arrow between the same pair).
      const rf = rank.get(fromId!) ?? 0;
      const rt = rank.get(toId!) ?? 0;
      const backwards = rt <= rf && fromId !== toId;
      if (backwards) {
        const cy = (b: Box) => b.y + b.height / 2;
        let points: { x: number; y: number }[];
        if (rf === rt) {
          // Same column: through the gap after it.
          const gx = gapRightOf(rf);
          points = [
            { x: from.x + from.width, y: cy(from) },
            { x: gx, y: cy(from) },
            { x: gx, y: cy(to) },
            { x: to.x + to.width, y: cy(to) },
          ];
        } else {
          const dip = Math.max(...spanned(rt, rf).map((c) => c.y1)) + 50;
          const xa = gapLeftOf(rf) + 12;
          const xb = gapRightOf(rt) - 12;
          points = [
            { x: from.x, y: cy(from) },
            { x: xa, y: cy(from) },
            { x: xa, y: dip },
            { x: xb, y: dip },
            { x: xb, y: cy(to) },
            { x: to.x + to.width, y: cy(to) },
          ];
        }
        const start = points[0]!;
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        return bump(e, {
          x: start.x,
          y: start.y,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          points: points.map((p) => [p.x - start.x, p.y - start.y] as [number, number]),
          roundness: null, // sharp corners: a curve through these bends overshoots them
        });
      }
      const bends = (via.get(e.id) ?? []).map((id) => center(placed.get(id)!));
      if (bends.length) {
        const start = edgePoint(from, bends[0]!);
        const end = edgePoint(to, bends.at(-1)!);
        const all = [start, ...bends, end];
        const xs = all.map((p) => p.x);
        const ys = all.map((p) => p.y);
        return bump(e, {
          x: start.x,
          y: start.y,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          points: all.map((p) => [p.x - start.x, p.y - start.y] as [number, number]),
          roundness: null, // sharp corners: a curve through these bends overshoots them
        });
      }
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
