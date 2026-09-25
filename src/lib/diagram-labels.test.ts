import { describe, expect, it } from "vitest";
import { placeLabels, withMiddle } from "./diagram-labels";

type E = Parameters<typeof placeLabels>[0][number];

const box = (id: string, x: number, y: number): E => ({ id, type: "rectangle", x, y, width: 120, height: 60 });
const arrow = (id: string, from: E, to: E): E => {
  const s = { x: from.x + 60, y: from.y + 60 };
  const e = { x: to.x + 60, y: to.y };
  return {
    id,
    type: "arrow",
    x: s.x,
    y: s.y,
    width: 0,
    height: 0,
    points: [
      [0, 0],
      [e.x - s.x, e.y - s.y],
    ],
    startBinding: { elementId: from.id },
    endBinding: { elementId: to.id },
  };
};
const label = (id: string, text: string): E => ({
  id: `${id}-t`,
  type: "text",
  x: 0,
  y: 0,
  width: text.length * 11,
  height: 25,
  containerId: id,
});
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const middle = (a: E) => {
  const p = a.points as [number, number][];
  const [x, y] = p[(p.length - 1) / 2]!;
  return { x: a.x + x, y: a.y + y };
};

describe("placeLabels (G10)", () => {
  it("makes the chosen spot the middle point, padding the shorter side", () => {
    const pts = withMiddle([{ x: 0, y: 0 }], { x: 5, y: 0 }, [
      { x: 8, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(pts).toHaveLength(5);
    expect(pts[2]).toEqual({ x: 5, y: 0 });
  });

  it("spreads the labels of arrows fanning out from one shape", () => {
    // Top-down: API fans out to two neighbours; both labels start at their midpoints and collide.
    const api = box("api", 150, 0);
    const auth = box("auth", 30, 170);
    const billing = box("billing", 270, 170);
    const els = [
      api,
      auth,
      billing,
      arrow("a1", api, auth),
      label("a1", "verify token"),
      arrow("a2", api, billing),
      label("a2", "enqueue job"),
    ];
    const out = placeLabels(els);
    const a1 = out.find((e) => e.id === "a1")!;
    const a2 = out.find((e) => e.id === "a2")!;
    const lbl = (a: E, w: number) => ({ x: middle(a).x - w / 2, y: middle(a).y - 12.5, width: w, height: 25 });
    expect(overlap(lbl(a1, 132), lbl(a2, 121))).toBe(false);
    for (const s of [api, auth, billing]) expect(overlap(lbl(a1, 132), s) || overlap(lbl(a2, 121), s)).toBe(false);
    // Still a straight arrow between the same ends.
    const pts = (a2.points as [number, number][]).map(([x, y]) => [a2.x + x, a2.y + y]);
    expect(pts[0]).toEqual([210, 60]);
    expect(pts.at(-1)).toEqual([330, 170]);
  });

  it("leaves an unlabelled or already clear arrow alone", () => {
    const a = box("a", 0, 0);
    const b = box("b", 0, 300);
    const plain = arrow("p", a, b);
    const out = placeLabels([a, b, plain]);
    expect(out[2]).toBe(plain);
  });
});
