import { describe, expect, it } from "vitest";
import { ToolError } from "./document";
import { applyDiagramOps, sceneLabelList } from "./diagram";
import { summarizeScene, type Scene, type SceneElement } from "./scene";

function shape(id: string, label: string, x: number): SceneElement[] {
  return [
    { id, type: "rectangle", x, y: 0, width: 120, height: 60, boundElements: [{ id: `${id}-t`, type: "text" }] },
    { id: `${id}-t`, type: "text", x: x + 30, y: 20, width: 60, height: 25, text: label, containerId: id },
  ];
}

function arrow(id: string, from: string, to: string): SceneElement {
  return {
    id,
    type: "arrow",
    x: 0,
    y: 0,
    width: 50,
    height: 0,
    startBinding: { elementId: from, focus: 0, gap: 5 },
    endBinding: { elementId: to, focus: 0, gap: 5 },
  };
}

function loginFlow(): Scene {
  return {
    type: "excalidraw",
    version: 2,
    elements: [
      ...shape("u", "User", 0),
      ...shape("l", "Login", 250),
      ...shape("d", "Dashboard", 500),
      arrow("a1", "u", "l"),
      arrow("a2", "l", "d"),
    ],
  };
}

describe("summarizeScene", () => {
  it("folds bound text into labels and shows connections", () => {
    expect(summarizeScene(loginFlow())).toEqual([
      { id: "u", type: "rectangle", label: "User", x: 0, y: 0, w: 120, h: 60 },
      { id: "l", type: "rectangle", label: "Login", x: 250, y: 0, w: 120, h: 60 },
      { id: "d", type: "rectangle", label: "Dashboard", x: 500, y: 0, w: 120, h: 60 },
      { id: "a1", type: "arrow", x: 0, y: 0, w: 50, h: 0, from: "u", to: "l" },
      { id: "a2", type: "arrow", x: 0, y: 0, w: 50, h: 0, from: "l", to: "d" },
    ]);
  });
});

describe("applyDiagramOps", () => {
  it("adds a labelled Cache box and an arrow from Login without touching original ids (S12)", () => {
    const before = loginFlow();
    const after = applyDiagramOps(before, [
      { op: "add", id: "cache", type: "rectangle", label: "Cache" },
      { op: "add", type: "arrow", from: "l", to: "cache" },
    ]);
    expect(sceneLabelList(after)).toEqual(["User", "Login", "Dashboard", "Cache"]);
    for (const id of ["u", "l", "d", "a1", "a2"]) expect(after.elements.some((e) => e.id === id)).toBe(true);

    const cache = after.elements.find((e) => e.type === "rectangle" && !["u", "l", "d"].includes(e.id));
    const newArrow = after.elements.find((e) => e.type === "arrow" && !["a1", "a2"].includes(e.id));
    expect(newArrow?.startBinding?.elementId).toBe("l");
    expect(newArrow?.endBinding?.elementId).toBe(cache?.id);
    // Placed below Login, not on top of anything.
    expect(cache!.y).toBeGreaterThan(60);
    // Both ends know about the arrow so Excalidraw keeps it attached.
    expect(after.elements.find((e) => e.id === "l")?.boundElements).toContainEqual({ id: newArrow?.id, type: "arrow" });
    // The input scene is not mutated.
    expect(before.elements).toHaveLength(8);
  });

  it("relabels via the bound text element", () => {
    const after = applyDiagramOps(loginFlow(), [{ op: "relabel", id: "l", label: "Sign in" }]);
    expect(sceneLabelList(after)).toContain("Sign in");
    expect(after.elements.find((e) => e.id === "l-t")?.text).toBe("Sign in");
  });

  it("removes a shape with its label and connected arrows", () => {
    const after = applyDiagramOps(loginFlow(), [{ op: "remove", id: "d" }]);
    const deleted = after.elements.filter((e) => e.isDeleted).map((e) => e.id);
    expect(deleted.sort()).toEqual(["a2", "d", "d-t"]);
    expect(after.elements.find((e) => e.id === "l")?.boundElements).toEqual([{ id: "l-t", type: "text" }]);
  });

  it("restyles an element", () => {
    const after = applyDiagramOps(loginFlow(), [
      { op: "restyle", id: "u", backgroundColor: "#ffc9c9", strokeStyle: "dashed" },
    ]);
    expect(after.elements.find((e) => e.id === "u")).toMatchObject({
      backgroundColor: "#ffc9c9",
      strokeStyle: "dashed",
    });
  });

  it("fails on an unknown id and changes nothing", () => {
    expect(() => applyDiagramOps(loginFlow(), [{ op: "relabel", id: "nope", label: "x" }])).toThrow(ToolError);
  });

  it("keeps a hand-drawn shape (E2E-22)", () => {
    const scene = loginFlow();
    scene.elements.push({ id: "hand", type: "rectangle", x: 700, y: 300, width: 80, height: 40 });
    const after = applyDiagramOps(scene, [{ op: "add", id: "cache", type: "rectangle", label: "Cache" }]);
    expect(after.elements.find((e) => e.id === "hand")).toMatchObject({ x: 700, y: 300 });
  });
});

describe("preset operation (G7)", () => {
  it("restyles every shape without changing ids or positions", () => {
    const before = loginFlow();
    const after = applyDiagramOps(before, [{ op: "preset", preset: "monochrome" }]);
    for (const r of after.elements.filter((e) => e.type === "rectangle")) {
      expect(r).toMatchObject({ strokeColor: "#1e1e1e", backgroundColor: "transparent" });
      const orig = before.elements.find((e) => e.id === r.id);
      expect([r.x, r.y]).toEqual([orig?.x, orig?.y]);
    }
  });
});
