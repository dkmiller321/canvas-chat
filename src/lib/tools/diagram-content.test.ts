import { describe, expect, it } from "vitest";
import { ToolError } from "./document";
import { diagramContent } from "./index";

describe("create_diagram input (G10)", () => {
  it("passes Mermaid through and keeps other sources for the browser", () => {
    expect(diagramContent({ mermaid: "flowchart LR\n  a --> b" })).toEqual({ mermaid: "flowchart LR\n  a --> b" });
    expect(diagramContent({ source: { language: "d2", code: "a -> b" } })).toEqual({
      source: { language: "d2", code: "a -> b" },
    });
    const graph = { nodes: [{ id: "a" }], edges: [{ from: "a", to: "b" }] };
    expect(diagramContent({ graph })).toEqual({ source: { language: "graph", code: JSON.stringify(graph, null, 2) } });
  });

  it("turns syntax errors into a tool error the model can act on", () => {
    const call = () => diagramContent({ source: { language: "dot", code: "digraph {\n  a -> ;\n}" } });
    expect(call).toThrow(ToolError);
    expect(call).toThrow(/Could not read the diagram: line 2: .*Fix it and call create_diagram again/);
    expect(() => diagramContent({ graph: { nodes: [{ id: "a" }, { id: "a" }] } })).toThrow(ToolError);
  });
});
