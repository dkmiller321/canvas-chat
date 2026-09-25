import { describe, expect, it } from "vitest";
import { tidyLayout } from "./diagram-layout";
import { applyPreset } from "./diagram-style";

type E = Parameters<typeof tidyLayout>[0][number];

const box = (id: string, x: number, y: number): E[] => [
  {
    id,
    type: "rectangle",
    x,
    y,
    width: 120,
    height: 60,
    backgroundColor: "#a5d8ff",
    boundElements: [{ id: `${id}-t`, type: "text" }],
  },
  { id: `${id}-t`, type: "text", x: x + 30, y: y + 18, width: 60, height: 25, containerId: id, text: id },
];
const arrow = (id: string, from: string, to: string): E => ({
  id,
  type: "arrow",
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  startBinding: { elementId: from },
  endBinding: { elementId: to },
});

// A messy login flow: Cache was dropped on top of Dashboard.
const messy = (): E[] => [
  ...box("user", 0, 0),
  ...box("login", 200, 0),
  ...box("dash", 400, 0),
  ...box("cache", 410, 20),
  arrow("a1", "user", "login"),
  arrow("a2", "login", "dash"),
  arrow("a3", "login", "cache"),
];

const shapes = (els: E[]) => els.filter((e) => e.type === "rectangle");
const overlap = (a: E, b: E) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("tidyLayout (G7)", () => {
  it("ranks shapes left to right and removes overlaps", () => {
    const out = tidyLayout(messy());
    const s = Object.fromEntries(shapes(out).map((e) => [e.id, e]));
    expect(s.user!.x).toBeLessThan(s.login!.x);
    expect(s.login!.x).toBeLessThan(s.dash!.x);
    expect(s.cache!.x).toBeGreaterThan(s.login!.x);
    const list = shapes(out);
    for (const a of list) for (const b of list) if (a.id < b.id) expect(overlap(a, b), `${a.id}/${b.id}`).toBe(false);
  });

  it("moves labels with their shapes and keeps arrow bindings", () => {
    const out = tidyLayout(messy());
    const byId = Object.fromEntries(out.map((e) => [e.id, e]));
    for (const id of ["user", "login", "dash", "cache"]) {
      expect(byId[`${id}-t`]!.x - byId[id]!.x).toBe(30);
      expect(byId[`${id}-t`]!.y - byId[id]!.y).toBe(18);
    }
    expect(byId.a3!.startBinding).toEqual({ elementId: "login" });
    expect(byId.a3!.endBinding).toEqual({ elementId: "cache" });
    expect(byId.a3!.points).toHaveLength(2);
  });

  it("survives cycles", () => {
    const out = tidyLayout([...box("a", 0, 0), ...box("b", 0, 0), arrow("x", "a", "b"), arrow("y", "b", "a")]);
    const [a, b] = shapes(out);
    expect(overlap(a!, b!)).toBe(false);
  });
});

describe("applyPreset (G7)", () => {
  it("monochrome makes every shape black ink on no fill", () => {
    for (const r of shapes(applyPreset(messy(), "monochrome"))) {
      expect(r.strokeColor).toBe("#1e1e1e");
      expect(r.backgroundColor).toBe("transparent");
    }
  });

  it("clean is flat: no roughness, solid fills, sans text", () => {
    const out = applyPreset(messy(), "clean");
    for (const r of shapes(out)) expect([r.roughness, r.fillStyle]).toEqual([0, "solid"]);
    for (const t of out.filter((e) => e.type === "text")) expect(t.fontFamily).toBe(6);
  });

  it("bumps element versions so the editor accepts the change", () => {
    const before = messy();
    const after = applyPreset(before, "sketchy");
    expect(after[0]!.version).toBe(2);
  });
});

describe("arrow routing", () => {
  it("bends an arrow that points back up the flow instead of overlapping the forward one", () => {
    const out = tidyLayout([
      ...box("idle", 0, 0),
      ...box("run", 300, 0),
      arrow("go", "idle", "run"),
      arrow("back", "run", "idle"),
    ]);
    const back = out.find((e) => e.id === "back")!;
    const go = out.find((e) => e.id === "go")!;
    expect((go.points as unknown[]).length).toBe(2);
    expect((back.points as unknown[]).length).toBe(4);
    expect(back.startBinding).toEqual({ elementId: "run" });
  });
});

describe("crowded graphs", () => {
  const byId = (els: E[]) => Object.fromEntries(els.map((e) => [e.id, e]));
  // Straight segment a→b crosses box r (Liang–Barsky clip against the box, shrunk by 1px).
  const crosses = (a: [number, number], b: [number, number], r: E) => {
    let t0 = 0;
    let t1 = 1;
    const d = [b[0] - a[0], b[1] - a[1]];
    const p = [-d[0]!, d[0]!, -d[1]!, d[1]!];
    const q = [a[0] - (r.x + 1), r.x + r.width - 1 - a[0], a[1] - (r.y + 1), r.y + r.height - 1 - a[1]];
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
  };
  const segments = (a: E) => {
    const pts = (a.points as [number, number][]).map(([x, y]) => [a.x + x, a.y + y] as [number, number]);
    return pts.slice(1).map((p, i) => [pts[i]!, p] as const);
  };
  const noArrowThroughShapes = (out: E[]) => {
    const rects = shapes(out);
    for (const a of out.filter((e) => e.type === "arrow")) {
      const ends = [a.startBinding?.elementId, a.endBinding?.elementId];
      for (const r of rects.filter((r) => !ends.includes(r.id)))
        for (const [p, q] of segments(a)) expect(crosses(p, q, r), `${a.id} through ${r.id}`).toBe(false);
    }
  };

  it("puts a source next to its target instead of spanning columns (ER: PRODUCT → LINE_ITEM)", () => {
    const out = tidyLayout([
      ...box("customer", 0, 0),
      ...box("order", 0, 100),
      ...box("item", 0, 200),
      ...box("product", 0, 300),
      arrow("places", "customer", "order"),
      arrow("contains", "order", "item"),
      arrow("listed", "product", "item"),
    ]);
    const s = byId(out);
    expect(s.product!.x).toBe(s.order!.x);
    noArrowThroughShapes(out);
  });

  it("routes an edge that must span columns around the shapes in between", () => {
    // a → b → c → d, plus a → d: the long edge must not cut through b or c.
    const out = tidyLayout([
      ...box("a", 0, 0),
      ...box("b", 0, 100),
      ...box("c", 0, 200),
      ...box("d", 0, 300),
      arrow("ab", "a", "b"),
      arrow("bc", "b", "c"),
      arrow("cd", "c", "d"),
      arrow("ad", "a", "d"),
    ]);
    const ad = byId(out).ad!;
    expect((ad.points as unknown[]).length).toBeGreaterThan(2);
    expect(ad.endBinding).toEqual({ elementId: "d" });
    noArrowThroughShapes(out);
  });

  it("orders columns to avoid needless crossings (class: Owner walks Dog, feeds Cat)", () => {
    const out = tidyLayout([
      ...box("cat", 0, 0),
      ...box("vet", 0, 100),
      ...box("dog", 0, 200),
      ...box("owner", 0, 300),
      ...box("animal", 0, 400),
      arrow("i1", "dog", "animal"),
      arrow("i2", "cat", "animal"),
      arrow("walks", "owner", "dog"),
      arrow("feeds", "owner", "cat"),
      arrow("treats", "vet", "animal"),
    ]);
    const s = byId(out);
    expect(s.vet!.x).toBe(s.dog!.x);
    noArrowThroughShapes(out);
    const rects = shapes(out);
    for (const a of rects) for (const b of rects) if (a.id < b.id) expect(overlap(a, b), `${a.id}/${b.id}`).toBe(false);
  });
});

describe("styleElements", () => {
  it("treats Mermaid's grey fills as unset and colours repeated labels the same", async () => {
    const { styleElements } = await import("./diagram-style");
    const grey = { backgroundColor: "#eaeaea" };
    const out = styleElements([
      { ...box("a1", 0, 0)[0]!, ...grey },
      { ...box("a1", 0, 0)[1]!, text: "Alice" },
      { ...box("b1", 200, 0)[0]!, ...grey },
      { ...box("b1", 200, 0)[1]!, text: "Bob" },
      { ...box("a2", 0, 300)[0]!, ...grey },
      { ...box("a2", 0, 300)[1]!, text: "Alice" },
    ]);
    const fill = (id: string) => (out.find((e) => e.id === id) as { backgroundColor?: unknown }).backgroundColor;
    expect(fill("a1")).not.toBe("#eaeaea");
    expect(fill("a1")).toBe(fill("a2"));
    expect(fill("a1")).not.toBe(fill("b1"));
  });
});
