import { generateText, stepCountIs, streamText, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildInstructions } from "./context";
import { createMockModel } from "./mock";
import { TITLE_INSTRUCTIONS } from "./title";

const instructions = buildInstructions({ artifacts: [], open: null });

describe("mock model through the real AI SDK pipeline", () => {
  it("streams S1 as several text deltas", async () => {
    const result = streamText({ model: createMockModel("mock/alpha"), instructions, prompt: "Say hello" });
    const deltas: string[] = [];
    for await (const d of result.textStream) deltas.push(d);
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe("Hello! I am the mock model and streaming works.");
  });

  it("runs a tool call, then the follow-up text in a second step", async () => {
    const calls: unknown[] = [];
    const result = streamText({
      model: createMockModel("mock/alpha"),
      instructions,
      prompt: "Write a document about coffee",
      stopWhen: stepCountIs(5),
      tools: {
        create_document: tool({
          inputSchema: z.object({ title: z.string(), markdown: z.string() }),
          execute: async (input) => {
            calls.push(input);
            return { ok: true };
          },
        }),
      },
    });
    expect(await result.text).toBe("I drafted the Coffee Guide.");
    expect(calls).toEqual([{ title: "Coffee Guide", markdown: expect.stringContaining("## Brewing") }]);
  });

  it("stops emitting when aborted", async () => {
    const controller = new AbortController();
    const result = streamText({
      model: createMockModel("mock/alpha"),
      instructions,
      prompt: "Write a long story",
      abortSignal: controller.signal,
    });
    let received = "";
    try {
      for await (const d of result.textStream) {
        received += d;
        if (received.length > 20) controller.abort();
      }
    } catch {
      // Abort surfaces as an error or an early end, depending on timing.
    }
    expect(received.length).toBeLessThan("word ".length * 200);
  });

  it("answers title requests with Mock Title", async () => {
    const { text } = await generateText({
      model: createMockModel("mock/alpha"),
      instructions: TITLE_INSTRUCTIONS,
      prompt: "Say hello",
    });
    expect(text).toBe("Mock Title");
  });

  it("reports the model id for S4", async () => {
    const { text } = await generateText({ model: createMockModel("mock/beta"), instructions, prompt: "Which model?" });
    expect(text).toBe("Mock reply from mock/beta");
  });
});
