import { describe, expect, it } from "vitest";
import { ToolError } from "./document";
import { checkSelectionScope } from "./index";

describe("checkSelectionScope (G6)", () => {
  it("allows changes to selected shapes and new elements connected to them", () => {
    expect(() =>
      checkSelectionScope(
        [
          { op: "restyle", id: "login", strokeColor: "#e03131" },
          { op: "add", id: "cache", type: "rectangle", label: "Cache" },
          { op: "add", type: "arrow", from: "login", to: "cache" },
          { op: "relabel", id: "cache", label: "Redis" },
        ],
        ["login"],
      ),
    ).not.toThrow();
  });

  it("rejects changes to shapes that are not selected", () => {
    expect(() => checkSelectionScope([{ op: "remove", id: "user" }], ["login"])).toThrow(ToolError);
    expect(() => checkSelectionScope([{ op: "relabel", id: "user", label: "x" }], ["login"])).toThrow(/not selected/);
  });

  it("rejects whole-diagram presets", () => {
    expect(() => checkSelectionScope([{ op: "preset", preset: "monochrome" }], ["login"])).toThrow(/selected shapes/);
  });
});
