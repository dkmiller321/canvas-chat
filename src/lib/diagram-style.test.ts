import { describe, expect, it } from "vitest";
import { PALETTE, paletteIndex, styleElements } from "./diagram-style";

const box = (id: string, x: number, y: number, w = 100, h = 50, extra = {}) => ({ id, type: "rectangle", x, y, width: w, height: h, backgroundColor: "transparent", ...extra });

describe("styleElements", () => {
  it("gives each shape the next palette colour with hachure and styles arrows and text", () => {
    const out = styleElements([
      box("a", 0, 0),
      box("b", 200, 0),
      { id: "t", type: "text", x: 10, y: 10, width: 50, height: 20, containerId: "a" },
      { id: "r", type: "arrow", x: 100, y: 25, width: 100, height: 0 },
    ]);
    expect(out[0]).toMatchObject({ backgroundColor: PALETTE[0].fill, strokeColor: PALETTE[0].stroke, fillStyle: "hachure" });
    expect(out[1]).toMatchObject({ backgroundColor: PALETTE[1].fill, strokeColor: PALETTE[1].stroke });
    expect(out[2]).toMatchObject({ strokeColor: "#1e1e1e" });
    expect(out[3]).toMatchObject({ strokeColor: "#495057", strokeWidth: 2 });
  });

  it("turns a shape that contains others into a dashed, unfilled group frame", () => {
    const out = styleElements([box("frame", 0, 0, 500, 300), box("inner", 50, 50)]);
    expect(out[0]).toMatchObject({ backgroundColor: "transparent", strokeStyle: "dashed" });
    expect(out[1]).toMatchObject({ backgroundColor: PALETTE[0].fill });
  });

  it("keeps colours the model chose", () => {
    const out = styleElements([box("a", 0, 0, 100, 50, { backgroundColor: "#ff0000" })]);
    expect(out[0]).toMatchObject({ backgroundColor: "#ff0000", fillStyle: "hachure" });
  });

  it("counts filled shapes to pick the next colour", () => {
    expect(paletteIndex(styleElements([box("a", 0, 0), box("b", 200, 0)]))).toBe(2);
  });
});
