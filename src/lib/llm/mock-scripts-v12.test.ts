import { describe, expect, it } from "vitest";
import { parseSource } from "@/lib/diagram-formats";
import { normalizeGraph } from "@/lib/diagram-formats/graph";
import { createDiagramInput } from "@/lib/tools/schemas";
import { planResponse, type MockRequest } from "./mock-scripts";

const chat = (lastUser: string): MockRequest => ({
  mode: "chat",
  lastUser,
  modelId: "mock/alpha",
  context: { artifacts: [], open: null },
  afterTool: false,
});

const SCRIPTS = [
  { prompt: "Draw an architecture graph", title: "Architecture", kind: "graph" },
  { prompt: "Draw a dot graph", title: "Pipeline", kind: "dot" },
  { prompt: "Draw a plantuml diagram", title: "Shop", kind: "plantuml" },
  { prompt: "Draw a d2 diagram", title: "Cloud", kind: "d2" },
  { prompt: "Draw a plantuml sequence", title: "Handshake", kind: "plantuml" },
];

describe("stage 16 mock scripts (G10)", () => {
  it.each(SCRIPTS)("$prompt → a valid create_diagram call that parses", ({ prompt, title, kind }) => {
    const step = planResponse(chat(prompt));
    expect(step).toMatchObject({ type: "tool", toolName: "create_diagram" });
    const input = createDiagramInput.parse((step as { input: unknown }).input);
    expect(input.title).toBe(title);
    if (kind === "graph") {
      expect(normalizeGraph(input.graph!).nodes).toHaveLength(4);
    } else {
      expect(input.source!.language).toBe(kind);
      expect(() => parseSource(input.source!.language, input.source!.code)).not.toThrow();
    }
  });

  it("create_diagram input takes exactly one kind of source", () => {
    expect(
      createDiagramInput.safeParse({
        title: "x",
        mermaid: "flowchart LR\n a-->b",
        source: { language: "d2", code: "a" },
      }).success,
    ).toBe(false);
    expect(createDiagramInput.safeParse({ title: "x" }).success).toBe(false);
    expect(createDiagramInput.safeParse({ title: "x", source: { language: "d2", code: "a -> b" } }).success).toBe(true);
  });
});
