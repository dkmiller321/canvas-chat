import { InvalidToolInputError } from "ai";
import { describe, expect, it } from "vitest";
import { explainCallError, withDeadline } from "./call-limits";

describe("call limits (real-model testing, 2026-09-25)", () => {
  it("aborts at the deadline", async () => {
    const signal = withDeadline(new AbortController().signal, 20);
    await new Promise((r) => setTimeout(r, 60));
    expect(signal.aborted).toBe(true);
    expect(explainCallError(signal.reason, 60_000)).toBe(
      "The model took longer than 60 s. Try again, or choose a faster model.",
    );
  });

  it("explains a malformed tool call in plain words and leaves other errors alone", () => {
    const malformed = new InvalidToolInputError({
      toolName: "update_diagram",
      toolInput: '{"x": -82.5714285714285.',
      cause: new Error("JSON"),
    });
    expect(explainCallError(malformed, 1000)).toBe("The model's reply was malformed. Try again.");
    expect(explainCallError(new Error("boom"), 1000)).toBeNull();
  });
});
