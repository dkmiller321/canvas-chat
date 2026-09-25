import { describe, expect, it } from "vitest";
import { graphToSkeleton, mermaidType, parseFallback } from "./mermaid-fallback";

const labels = (src: string) =>
  graphToSkeleton(parseFallback(src)!)
    .map((s) => ("label" in s ? s.label?.text : undefined))
    .filter(Boolean)
    .join("\n");

describe("Mermaid fallback converter (G8)", () => {
  it("detects the diagram type", () => {
    expect(mermaidType("%% comment\nclassDiagram\n  class A")).toBe("classdiagram");
    expect(parseFallback("flowchart LR\n A-->B")).toBeNull();
  });

  it("class diagram: classes, members and inheritance from child to parent", () => {
    const g = parseFallback(
      "classDiagram\n  class Animal {\n    +name: string\n    +speak()\n  }\n  class Dog\n  Animal <|-- Dog",
    )!;
    expect(g.nodes.map((n) => n.id)).toEqual(["Animal", "Dog"]);
    expect(g.edges).toEqual([{ from: "Dog", to: "Animal", label: undefined }]);
    expect(labels("classDiagram\n  class Animal {\n    +name: string\n  }\n  class Dog\n  Animal <|-- Dog")).toContain(
      "+name: string",
    );
  });

  it("state diagram: start/end markers and labelled transitions", () => {
    const g = parseFallback(
      "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop\n  Running --> [*]",
    )!;
    expect(g.nodes.map((n) => n.label)).toEqual(["Start", "Idle", "Running", "End"]);
    expect(g.edges.find((e) => e.label === "start")).toMatchObject({ from: "Idle", to: "Running" });
  });

  it("ER diagram: entities, attributes and cardinality labels", () => {
    const src = "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name\n  }";
    const g = parseFallback(src)!;
    expect(g.nodes.map((n) => n.id)).toEqual(["CUSTOMER", "ORDER"]);
    expect(g.edges[0]).toMatchObject({ from: "CUSTOMER", to: "ORDER", label: "places (1 → 0..*)" });
    expect(labels(src)).toContain("string name");
  });

  it("mind map: indentation becomes a tree fanning out from the root", () => {
    const g = parseFallback("mindmap\n  root((Coffee))\n    Beans\n      Arabica\n    Brewing\n    Serving")!;
    expect(g.nodes.map((n) => n.label)).toEqual(["Coffee", "Beans", "Arabica", "Brewing", "Serving"]);
    expect(g.nodes[0]!.shape).toBe("ellipse");
    const root = g.nodes[0]!.id;
    expect(g.edges.filter((e) => e.from === root)).toHaveLength(3);
  });

  it("lays out shapes left to right without overlaps and binds every arrow", () => {
    const sk = graphToSkeleton(parseFallback("mindmap\n  root((Coffee))\n    Beans\n    Brewing\n    Serving")!);
    const shapes = sk.filter((s) => s.type !== "arrow") as {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
    for (const a of shapes)
      for (const b of shapes)
        if (a.id < b.id)
          expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(
            false,
          );
    for (const arrow of sk.filter((s) => s.type === "arrow")) {
      expect(shapes.map((s) => s.id)).toContain((arrow as { start: { id: string } }).start.id);
    }
  });
});
