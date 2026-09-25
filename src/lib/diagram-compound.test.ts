import { describe, expect, it } from "vitest";
import { compoundLayout } from "./diagram-compound";
import { parseD2 } from "./diagram-formats/d2";
import { parseDot } from "./diagram-formats/dot";
import { type Graph, elementIds, normalizeGraph } from "./diagram-formats/graph";
import { ARCH_GRAPH } from "./llm/mock-scripts";

type E = Parameters<typeof compoundLayout>[0][number];

const SAAS_GRAPH = {
  direction: "down" as const,
  nodes: [
    { id: "web", label: "Web Client", group: "clients" },
    { id: "mobile", label: "Mobile Client", group: "clients" },
    { id: "api", label: "API Gateway", group: "backend" },
    { id: "auth", label: "Auth Service", group: "backend" },
    { id: "billing", label: "Billing Workers", group: "backend" },
    { id: "postgres", label: "Postgres", shape: "ellipse" as const, group: "data" },
    { id: "redis", label: "Redis", shape: "ellipse" as const, group: "data" },
    { id: "s3", label: "S3", shape: "ellipse" as const, group: "data" },
  ],
  edges: [
    { from: "web", to: "api", label: "HTTPS" },
    { from: "mobile", to: "api", label: "HTTPS" },
    { from: "api", to: "auth", label: "verify token" },
    { from: "api", to: "billing", label: "enqueue job" },
    { from: "api", to: "postgres", label: "queries" },
    { from: "api", to: "redis", label: "cache" },
    { from: "billing", to: "postgres", label: "records" },
    { from: "billing", to: "s3", label: "invoices" },
    { from: "auth", to: "redis", label: "sessions" },
    { from: "auth", to: "postgres", label: "users" },
  ],
  groups: [
    { id: "clients", label: "Clients" },
    { id: "backend", label: "Backend" },
    { id: "data", label: "Data Layer" },
  ],
};

/** Elements as the browser would build them: one box per node (with its label) and one bound arrow per edge. */
function elements(g: Graph) {
  const ids = elementIds(g);
  const els: E[] = [];
  g.nodes.forEach((n, i) => {
    const id = ids.get(n.id)!;
    els.push({ id, type: "rectangle", x: i * 10, y: i * 10, width: 120, height: 60 });
    els.push({ id: `${id}-t`, type: "text", x: i * 10 + 20, y: i * 10 + 18, width: 80, height: 25, containerId: id });
  });
  g.edges.forEach((e, i) => {
    els.push({
      id: `a${i}`,
      type: "arrow",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      startBinding: { elementId: ids.get(e.from)! },
      endBinding: { elementId: ids.get(e.to)! },
    });
    // Label text as Excalidraw sizes it at 20px: about 11px a character.
    if (e.label) {
      els.push({
        id: `a${i}-t`,
        type: "text",
        x: 0,
        y: 0,
        width: e.label.length * 11,
        height: 25,
        containerId: `a${i}`,
        text: e.label,
      });
    }
  });
  return { ids, els };
}

/** Where Excalidraw draws an arrow's label: the middle point, or the middle of the middle segment. */
function labelBox(a: E, text: E): E {
  const pts = (a.points as [number, number][]).map(([x, y]) => [a.x + x, a.y + y] as [number, number]);
  const n = pts.length;
  const [cx, cy] =
    n % 2 === 1
      ? pts[(n - 1) / 2]!
      : [(pts[n / 2 - 1]![0] + pts[n / 2]![0]) / 2, (pts[n / 2 - 1]![1] + pts[n / 2]![1]) / 2];
  return {
    id: text.id,
    type: "text",
    x: cx - text.width / 2,
    y: cy - text.height / 2,
    width: text.width,
    height: text.height,
  };
}

const overlap = (a: E, b: E) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// Segment a→b passes through box r (Liang–Barsky, box shrunk by 2px).
function crosses(a: [number, number], b: [number, number], r: E) {
  let t0 = 0;
  let t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  const p = [-d[0]!, d[0]!, -d[1]!, d[1]!];
  const q = [a[0] - (r.x + 2), r.x + r.width - 2 - a[0], a[1] - (r.y + 2), r.y + r.height - 2 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i]! < 0) return false;
    } else {
      const t = q[i]! / p[i]!;
      if (p[i]! < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1;
}
const encloses = (o: E, i: E) =>
  i.x >= o.x && i.y >= o.y && i.x + i.width <= o.x + o.width && i.y + i.height <= o.y + o.height;

function check(g: Graph) {
  const { ids, els } = elements(g);
  const { elements: out, frames } = compoundLayout(els, g, ids);
  const byId = new Map(out.map((e) => [e.id, e]));
  const boxes = new Map(g.nodes.map((n) => [n.id, byId.get(ids.get(n.id)!)!]));
  expect(frames.map((f) => f.id).sort()).toEqual((g.groups ?? []).map((gr) => gr.id).sort());
  // Outermost first, so they are drawn behind nested ones.
  expect(frames.map((f) => f.depth)).toEqual([...frames.map((f) => f.depth)].sort((a, b) => a - b));
  const byGroup = new Map(frames.map((f) => [f.id, f as unknown as E]));
  const ancestors = (gid: string | undefined): string[] =>
    gid ? [gid, ...ancestors(g.groups!.find((x) => x.id === gid)!.parent)] : [];

  // Shapes never overlap.
  const shapes = [...boxes.values()];
  for (const a of shapes) for (const b of shapes) if (a.id < b.id) expect(overlap(a, b), `${a.id}/${b.id}`).toBe(false);
  // A frame holds exactly its members (and nested groups' members).
  for (const n of g.nodes) {
    const mine = new Set(ancestors(n.group));
    for (const f of frames)
      expect(encloses(byGroup.get(f.id)!, boxes.get(n.id)!), `${n.id} in ${f.id}`).toBe(mine.has(f.id));
  }
  // Frames overlap only when one is nested inside the other.
  for (const a of frames)
    for (const b of frames)
      if (a.id < b.id && overlap(a as unknown as E, b as unknown as E)) {
        const nested = ancestors(a.id).includes(b.id) || ancestors(b.id).includes(a.id);
        expect(nested, `${a.id}/${b.id}`).toBe(true);
      }
  // No arrow passes through a shape it doesn't connect.
  for (const a of out.filter((e) => e.type === "arrow")) {
    const pts = (a.points as [number, number][]).map(([x, y]) => [a.x + x, a.y + y] as [number, number]);
    const own = [a.startBinding?.elementId, a.endBinding?.elementId];
    for (const s of shapes.filter((s) => !own.includes(s.id)))
      for (let k = 1; k < pts.length; k++)
        expect(crosses(pts[k - 1]!, pts[k]!, s), `${a.id} through ${s.id}`).toBe(false);
  }
  // Arrow labels overlap neither each other, nor any shape, nor a frame's border.
  const labels = out
    .filter((t) => t.type === "text" && byId.get(t.containerId ?? "")?.type === "arrow")
    .map((t) => labelBox(byId.get(t.containerId!)!, t));
  for (const l of labels)
    for (const f of frames) {
      const fr = byGroup.get(f.id)!;
      expect(overlap(l, fr) && !encloses(fr, l), `label ${l.id} on the border of ${f.id}`).toBe(false);
    }
  for (const l of labels)
    for (const s of shapes) expect(overlap(l, s), `label ${l.text ?? l.id} on ${s.id}`).toBe(false);
  for (const a of labels)
    for (const b of labels) if (a.id < b.id) expect(overlap(a, b), `labels ${a.id}/${b.id}`).toBe(false);
  // Labels move with their shapes.
  for (const n of g.nodes) {
    const id = ids.get(n.id)!;
    expect(byId.get(`${id}-t`)!.x - byId.get(id)!.x).toBe(20);
  }
  return { out, boxes };
}

describe("compoundLayout (G10)", () => {
  it("keeps nested D2 containers apart and around only their own shapes", () => {
    check(
      parseD2(`direction: right
users: Users
cloud: Cloud {
  edge: Edge { cdn: CDN; waf: WAF }
  app: App tier { api: API; jobs: Workers }
  data: Data { pg: Postgres; redis: Redis }
}
users -> cloud.edge.cdn
cloud.edge.cdn -> cloud.edge.waf
cloud.edge.waf -> cloud.app.api
cloud.app.api -> cloud.data.pg
cloud.app.api -> cloud.app.jobs
cloud.app.jobs -> cloud.data.redis
cloud.app.api -> cloud.data.redis`),
    );
  });

  it("lays out the S25 architecture graph", () => {
    check(normalizeGraph(ARCH_GRAPH as Parameters<typeof normalizeGraph>[0]));
  });

  it("lays out a real model's top-down architecture graph cleanly", () => {
    // inclusionai/ling-3.0-flash-vl, 2026-09-25: labels piled up and arrows crossed boxes.
    check(normalizeGraph(SAAS_GRAPH));
  });

  it("lays out DOT clusters top to bottom", () => {
    const { boxes } = check(
      parseDot(`digraph {
  subgraph cluster_fe { label="Frontend"; spa; mobile; }
  subgraph cluster_be { label="Backend"; gw; auth; orders; }
  spa -> gw; mobile -> gw; gw -> auth; gw -> orders; orders -> db; auth -> db;
}`),
    );
    expect(boxes.get("spa")!.y).toBeLessThan(boxes.get("gw")!.y);
    expect(boxes.get("gw")!.y).toBeLessThan(boxes.get("db")!.y);
  });

  it("routes arrows between their shapes after placing the groups", () => {
    const g = parseD2("direction: right\na: A { x }\nb: B { y }\na.x -> b.y");
    const { out, boxes } = check(g);
    const arrow = out.find((e) => e.type === "arrow")!;
    const x = boxes.get("a.x")!;
    const y = boxes.get("b.y")!;
    expect(arrow.x).toBeCloseTo(x.x + x.width, 0);
    const end = (arrow.points as [number, number][]).at(-1)!;
    expect(arrow.x + end[0]).toBeCloseTo(y.x, 0);
  });
});
