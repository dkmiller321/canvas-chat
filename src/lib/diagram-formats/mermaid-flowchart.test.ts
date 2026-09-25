import { describe, expect, it } from "vitest";
import { isFlowchart, parseFlowchart } from "./mermaid-flowchart";

const pairs = (g: { edges: { from: string; to: string }[] }) => g.edges.map((e) => `${e.from}>${e.to}`);

describe("Mermaid flowchart parser (G10)", () => {
  it("detects flowcharts", () => {
    expect(isFlowchart("flowchart LR\n  A --> B")).toBe(true);
    expect(isFlowchart("%% c\ngraph TD\n  A --> B")).toBe(true);
    expect(isFlowchart("sequenceDiagram\n  A->>B: hi")).toBe(false);
  });

  it("reads the S11 login flow", () => {
    const g = parseFlowchart("flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]");
    expect(g.direction).toBe("right");
    expect(g.nodes).toEqual([
      { id: "A", label: "User", shape: "rectangle" },
      { id: "B", label: "Login", shape: "rectangle" },
      { id: "C", label: "Dashboard", shape: "rectangle" },
    ]);
    expect(pairs(g)).toEqual(["A>B", "B>C"]);
  });

  it("reads shapes, quoted labels, line breaks and every link form", () => {
    const g = parseFlowchart(`graph TD
  s([Start]) --> d{Valid?}
  d -->|yes| db[(Orders DB)]
  d -- no --> e((Error))
  db -.-> log[["Audit<br/>log"]]
  db ==> api>API]
  e --- h{{Hexagon}}
  e <--> f["Label with (parens) and [brackets]"]
  f -. retry .-> s
  f == done ==> z[/Out/]`);
    expect(g.direction).toBe("down");
    const shape = Object.fromEntries(g.nodes.map((n) => [n.id, n.shape]));
    expect(shape).toMatchObject({
      s: "rectangle",
      d: "diamond",
      db: "ellipse",
      e: "ellipse",
      log: "rectangle",
      h: "rectangle",
    });
    expect(g.nodes.find((n) => n.id === "log")!.label).toBe("Audit\nlog");
    expect(g.nodes.find((n) => n.id === "f")!.label).toBe("Label with (parens) and [brackets]");
    const byPair = Object.fromEntries(g.edges.map((e) => [`${e.from}>${e.to}`, e]));
    expect(byPair["d>db"]).toEqual({ from: "d", to: "db", label: "yes" });
    expect(byPair["d>e"]).toEqual({ from: "d", to: "e", label: "no" });
    expect(byPair["db>log"]).toEqual({ from: "db", to: "log", dashed: true });
    expect(byPair["db>api"]).toEqual({ from: "db", to: "api" });
    expect(byPair["e>h"]).toEqual({ from: "e", to: "h", arrow: "none" });
    expect(byPair["e>f"]).toEqual({ from: "e", to: "f", arrow: "both" });
    expect(byPair["f>s"]).toEqual({ from: "f", to: "s", label: "retry", dashed: true });
    expect(byPair["f>z"]).toEqual({ from: "f", to: "z", label: "done" });
  });

  it("reads chains, & lists, semicolons, comments and styling lines", () => {
    const g = parseFlowchart(`flowchart LR
  %% comment
  a & b --> c --> d & e; x --> y
  classDef hot fill:#f96
  class a hot
  style b fill:#bbf
  linkStyle 0 stroke:#f00
  click a "https://example.com"
  c:::hot --> y`);
    expect(pairs(g)).toEqual(["a>c", "b>c", "c>d", "c>e", "x>y", "c>y"]);
  });

  it("reads links written without spaces", () => {
    const g = parseFlowchart("graph LR\nA-->B\nB-->|ok|C[Done]\nC-.->A\nA---D");
    expect(g.edges).toEqual([
      { from: "A", to: "B" },
      { from: "B", to: "C", label: "ok" },
      { from: "C", to: "A", dashed: true },
      { from: "A", to: "D", arrow: "none" },
    ]);
  });

  it("turns subgraphs into (nested) groups", () => {
    const g = parseFlowchart(`flowchart TB
  subgraph cloud [Cloud]
    subgraph app["App tier"]
      api[API]
    end
    db[(DB)]
  end
  user --> api --> db`);
    expect(g.groups).toEqual([
      { id: "cloud", label: "Cloud" },
      { id: "app", label: "App tier", parent: "cloud" },
    ]);
    expect(g.nodes.find((n) => n.id === "api")!.group).toBe("app");
    expect(g.nodes.find((n) => n.id === "db")!.group).toBe("cloud");
    expect(g.nodes.find((n) => n.id === "user")!.group).toBeUndefined();
  });

  it("moves nodes defined earlier into a subgraph that lists them (real model output)", () => {
    // inclusionai/ling-3.0-flash-vl, 2026-09-25: edges first, subgraphs at the end.
    const g = parseFlowchart(`flowchart LR
    B((Browser)) -->|1. Add to cart| GW[API Gateway]
    GW -->|2. Forward| OS[Orders Service]
    OS -->|3. Create order| DB[(Orders DB)]

    subgraph Client
        B
    end
    subgraph Backend
        GW
        OS
        DB
    end`);
    expect(Object.fromEntries(g.nodes.map((n) => [n.id, n.group]))).toEqual({
      B: "Client",
      GW: "Backend",
      OS: "Backend",
      DB: "Backend",
    });
    expect(g.nodes.find((n) => n.id === "B")).toMatchObject({ label: "Browser", shape: "ellipse" });
  });

  it("unwraps a shape nested inside another shape's label (real model output)", () => {
    // inclusionai/ling-3.0-flash-vl, 2026-09-25: showed as ["Orders DB"].
    const g = parseFlowchart('flowchart TD\n  OS --> DB[(["Orders DB"])]');
    expect(g.nodes.find((n) => n.id === "DB")).toMatchObject({ label: "Orders DB", shape: "ellipse" });
  });

  it("points at the line of a real model mistake: swapped closing brackets", () => {
    // From inclusionai/ling-3.0-flash-vl, 2026-09-25.
    const src = `flowchart LR
    Browser(["🌐 Browser"])
    GW(["API Gateway"])
    OS(["Orders Service")]
    PP(["Payments Provider"])`;
    expect(() => parseFlowchart(src)).toThrow(/^line 4: .*"\]\)"/);
  });

  it("reports other errors with a line number", () => {
    expect(() => parseFlowchart("flowchart LR\n  A --> ")).toThrow("line 2");
    expect(() => parseFlowchart("flowchart LR\n  subgraph x\n  A --> B")).toThrow('line 2: missing "end"');
    expect(() => parseFlowchart("flowchart LR\n  A[unclosed --> B")).toThrow("line 2");
    expect(() => parseFlowchart("flowchart LR\n  end")).toThrow("line 2");
  });
});
