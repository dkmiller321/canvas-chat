import { describe, expect, it } from "vitest";
import { COFFEE_MARKDOWN } from "@/lib/llm/mock-scripts";
import { ToolError, applyEdits, rewriteSelection } from "./document";

describe("applyEdits", () => {
  it("applies a targeted edit and leaves the rest untouched (S6)", () => {
    const out = applyEdits(COFFEE_MARKDOWN, [
      { find: "Coffee is a brewed drink.", replace: "Coffee is a beverage prepared from roasted beans." },
    ]);
    expect(out).toBe(
      COFFEE_MARKDOWN.replace("Coffee is a brewed drink.", "Coffee is a beverage prepared from roasted beans."),
    );
  });

  it("builds on a manual edit (S7 after E2E-09)", () => {
    const manual = COFFEE_MARKDOWN.replace("Use fresh beans.", "Use fresh beans. My note.");
    const out = applyEdits(manual, [
      { find: "Use fresh beans.", replace: "Use fresh beans.\n\n## Conclusion\n\nEnjoy responsibly." },
    ]);
    expect(out).toContain("My note.");
    expect(out).toContain("## Conclusion\n\nEnjoy responsibly.");
  });

  it("applies several edits in order", () => {
    expect(
      applyEdits("a b c", [
        { find: "a", replace: "x" },
        { find: "x b", replace: "y" },
      ]),
    ).toBe("y c");
  });

  it("fails the whole call when any find is missing (S8)", () => {
    expect(() =>
      applyEdits(COFFEE_MARKDOWN, [
        { find: "Use fresh beans.", replace: "changed" },
        { find: "TEXT THAT DOES NOT EXIST", replace: "x" },
      ]),
    ).toThrow(ToolError);
    expect(() => applyEdits(COFFEE_MARKDOWN, [{ find: "TEXT THAT DOES NOT EXIST", replace: "x" }])).toThrow(
      /Edit 1 failed: the text "TEXT THAT DOES NOT EXIST" was not found/,
    );
  });

  it("rejects an ambiguous find", () => {
    expect(() => applyEdits("same same", [{ find: "same", replace: "x" }])).toThrow(/appears 2 times/);
  });
});

describe("rewriteSelection", () => {
  it("replaces only the selected paragraph (S9)", () => {
    expect(rewriteSelection(COFFEE_MARKDOWN, "Use fresh beans.", "Grind beans fresh.")).toBe(
      COFFEE_MARKDOWN.replace("Use fresh beans.", "Grind beans fresh."),
    );
  });

  it("replaces the whole body when the selection is the whole document (S10)", () => {
    const upper = COFFEE_MARKDOWN.replaceAll("Coffee", "COFFEE");
    expect(rewriteSelection(COFFEE_MARKDOWN, `${COFFEE_MARKDOWN}\n`, upper)).toBe(upper);
  });

  it("errors when the selection is not in the document", () => {
    expect(() => rewriteSelection(COFFEE_MARKDOWN, "Tea", "x")).toThrow(/not found/);
  });
});
