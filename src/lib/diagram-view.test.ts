import { describe, expect, it } from "vitest";
import { TOOLBAR_INSETS, fitView, sceneBounds } from "./diagram-view";

const onScreen = (x: number, y: number, v: ReturnType<typeof fitView>) => ({
  x: (x + v.scrollX) * v.zoom,
  y: (y + v.scrollY) * v.zoom,
});

describe("fitView", () => {
  it("fits a tall drawing between the toolbars (real case: 572×776 in a 681×781 canvas)", () => {
    const b = { x0: 0, y0: 0, x1: 572, y1: 776 };
    const v = fitView(b, { width: 681, height: 781 });
    const top = onScreen(b.x0, b.y0, v);
    const bottom = onScreen(b.x1, b.y1, v);
    expect(top.y).toBeGreaterThanOrEqual(TOOLBAR_INSETS.top - 0.5);
    expect(bottom.y).toBeLessThanOrEqual(781 - TOOLBAR_INSETS.bottom + 0.5);
    expect(top.x).toBeGreaterThanOrEqual(TOOLBAR_INSETS.left - 0.5);
    expect(bottom.x).toBeLessThanOrEqual(681 - TOOLBAR_INSETS.right + 0.5);
    expect(v.zoom).toBeLessThan(1);
  });

  it("keeps a small drawing at 100%, centred in the free area", () => {
    const b = { x0: 100, y0: 100, x1: 300, y1: 200 };
    const v = fitView(b, { width: 681, height: 781 });
    expect(v.zoom).toBe(1);
    const c = onScreen(200, 150, v);
    expect(c.x).toBeCloseTo(TOOLBAR_INSETS.left + (681 - TOOLBAR_INSETS.left - TOOLBAR_INSETS.right) / 2);
    expect(c.y).toBeCloseTo(781 / 2);
  });

  it("computes scene bounds", () => {
    expect(sceneBounds([])).toBeNull();
    expect(
      sceneBounds([
        { x: 10, y: 20, width: 5, height: 5 },
        { x: -4, y: 0, width: 2, height: 40 },
      ]),
    ).toEqual({ x0: -4, y0: 0, x1: 15, y1: 40 });
  });
});

describe("sceneBounds with arrows (review of a real diagram, 2026-09-25)", () => {
  it("uses an arrow's points, which can run up or left of its start", () => {
    // A feedback arrow starting at the bottom (y 3882) and ending at the top (y 874).
    const arrow = {
      x: -22,
      y: 3882,
      width: 583,
      height: 3654,
      points: [
        [0, 0],
        [164, 476],
        [534, -3008],
      ],
    };
    const shape = { x: 0, y: 0, width: 100, height: 60 };
    expect(sceneBounds([shape, arrow])).toEqual({ x0: -22, y0: 0, x1: 512, y1: 4358 });
  });
});
