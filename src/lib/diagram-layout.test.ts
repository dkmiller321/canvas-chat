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
