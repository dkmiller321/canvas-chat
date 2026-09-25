import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE, cleanTitle } from "./title";

describe("cleanTitle (C5)", () => {
  it("keeps a plain title", () => {
    expect(cleanTitle("Backend Onboarding Guide")).toBe("Backend Onboarding Guide");
  });

  it("takes the first line when the model keeps writing, and strips Markdown", () => {
    // Seen from inclusionai/ling-3.0-flash-vl with reasoning off (2026-09-25).
    expect(cleanTitle("**Backend Engineer Onboarding Guide**\n\n**Welcome**\n\nJoin us as we")).toBe(
      "Backend Engineer Onboarding Guide",
    );
    expect(cleanTitle("\n# Coffee Brewing Basics\nSome text")).toBe("Coffee Brewing Basics");
  });

  it("strips quotes, a Title: prefix and trailing punctuation", () => {
    expect(cleanTitle('"Quarterly Plan Draft."')).toBe("Quarterly Plan Draft");
    expect(cleanTitle("Title: Login Flow Diagram")).toBe("Login Flow Diagram");
  });

  it("falls back to the default for empty output", () => {
    expect(cleanTitle("")).toBe(DEFAULT_TITLE);
    expect(cleanTitle("  \n ** \n")).toBe(DEFAULT_TITLE);
  });
});
