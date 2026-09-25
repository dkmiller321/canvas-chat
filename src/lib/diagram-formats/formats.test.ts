import { describe, expect, it } from "vitest";
import { parseD2 } from "./d2";
import { parseDot } from "./dot";
import { normalizeGraph, parseGraphJson } from "./graph";
import { parseSource } from "./index";
import { parsePlantUml } from "./plantuml";

const labels = (g: { nodes: { label: string }[] }) => g.nodes.map((n) => n.label);
const pairs = (g: { edges: { from: string; to: string }[] }) => g.edges.map((e) => `${e.from}>${e.to}`);

describe("neutral graph (G10)", () => {
  it("fills defaults, creates nodes for unknown edge ends and keeps groups", () => {
    const g = normalizeGraph({
      nodes: [{ id: "api", label: "API", group: "be" }],
      edges: [{ from: "web", to: "api", label: "HTTPS", arrow: "end" }],
      groups: [{ id: "be", label: "Backend" }],
    });
    expect(g.direction).toBe("right");
    expect(g.nodes).toEqual([
      { id: "api", label: "API", shape: "rectangle", group: "be" },
      { id: "web", label: "web", shape: "rectangle" },
    ]);
    expect(g.edges).toEqual([{ from: "web", to: "api", label: "HTTPS" }]);
    expect(g.groups).toEqual([{ id: "be", label: "Backend", parent: undefined }]);
  });

  it("rejects duplicate ids and unknown groups with a readable message", () => {
    expect(() => normalizeGraph({ nodes: [{ id: "a" }, { id: "a" }] })).toThrow('node id "a" is used twice');
    expect(() => normalizeGraph({ nodes: [{ id: "a", group: "x" }] })).toThrow('unknown group "x"');
    expect(() => parseGraphJson("{nodes: [")).toThrow("not valid JSON");
    expect(() => parseGraphJson('{"nodes": []}')).toThrow("nodes");
  });
});

describe("Graphviz DOT (G10)", () => {
  it("reads the S26 pipeline: labels, shapes, rankdir and edge chains", () => {
    const g = parseDot(
      'digraph G {\n  rankdir=LR;\n  build [label="Build"];\n  test [label="Test"];\n  deploy [label="Deploy", shape=diamond];\n  build -> test -> deploy;\n}',
    );
    expect(g.direction).toBe("right");
    expect(labels(g)).toEqual(["Build", "Test", "Deploy"]);
    expect(g.nodes[2]!.shape).toBe("diamond");
    expect(pairs(g)).toEqual(["build>test", "test>deploy"]);
  });

  it("handles clusters, defaults, comments, quoted ids, subgraph ends and undirected graphs", () => {
    const g = parseDot(`digraph {
      // comment
      node [shape=ellipse];
      /* block
         comment */
      subgraph cluster_be {
        label = "Back end";
        api; "job queue" [shape=box];
      }
      web -> {api "job queue"} [label="calls", style=dashed];
      # hash comment
    }`);
    expect(g.direction).toBe("down");
    expect(g.groups).toEqual([{ id: "be", label: "Back end" }]);
    expect(g.nodes.find((n) => n.id === "api")).toMatchObject({ shape: "ellipse", group: "be" });
    expect(g.nodes.find((n) => n.id === "job queue")).toMatchObject({ shape: "rectangle", group: "be" });
    expect(g.edges).toEqual([
      { from: "web", to: "api", label: "calls", dashed: true },
      { from: "web", to: "job queue", label: "calls", dashed: true },
    ]);
    const u = parseDot("graph { a -- b }");
    expect(u.edges).toEqual([{ from: "a", to: "b", arrow: "none" }]);
  });

  it("reports errors with a line number", () => {
    expect(() => parseDot("digraph {\n  a -> ;\n}")).toThrow("line 2");
    expect(() => parseDot("digraph {\n  a -> b\n")).toThrow('missing "}"');
    expect(() => parseDot("flowchart LR")).toThrow("digraph");
    expect(() => parseDot("graph { a -> b }")).toThrow("undirected");
  });
});

describe("D2 (G10)", () => {
  it("reads the S28 cloud: containers, dotted paths, labels and direction", () => {
    const g = parseD2(
      "direction: down\naws: AWS {\n  lb: Load balancer\n  app: App\n  lb -> app\n}\nusers: Users\nusers -> aws.lb: HTTPS",
    );
    expect(g.direction).toBe("down");
    expect(g.groups).toEqual([{ id: "aws", label: "AWS" }]);
    expect(g.nodes).toEqual([
      { id: "aws.lb", label: "Load balancer", shape: "rectangle", group: "aws" },
      { id: "aws.app", label: "App", shape: "rectangle", group: "aws" },
      { id: "users", label: "Users", shape: "rectangle" },
    ]);
    expect(g.edges).toEqual([
      { from: "aws.lb", to: "aws.app" },
      { from: "users", to: "aws.lb", label: "HTTPS" },
    ]);
  });

  it("handles shapes, chains, all four operators, comments, dashes and edges to containers", () => {
    const g = parseD2(`# comment
direction: right
db: Database { shape: cylinder }
user.shape: person
Load balancer -> web server -> db: query  # trailing comment
a <- b
a <-> c
a -- d
a -> d: sync { style.stroke-dash: 3 }
cluster: { x; y }
user -> cluster`);
    expect(g.direction).toBe("right");
    expect(g.nodes.find((n) => n.id === "user")!.shape).toBe("ellipse");
    expect(g.nodes.find((n) => n.id === "db")).toMatchObject({ label: "Database", shape: "rectangle" });
    expect(pairs(g)).toEqual([
      "Load balancer>web server",
      "web server>db",
      "b>a",
      "a>c",
      "a>d",
      "a>d",
      "user>cluster.x",
    ]);
    expect(g.edges[1]!.label).toBe("query");
    expect(g.edges[3]!.arrow).toBe("both");
    expect(g.edges[4]!.arrow).toBe("none");
    expect(g.edges[5]!.dashed).toBe(true);
  });

  it("reads the README example: inline containers with ; separators", () => {
    const g = parseD2(`direction: right
users: Users { shape: person }
cloud: Cloud {
  app: App tier { api: API; jobs: Workers }
  data: Data { pg: Postgres; redis: Redis }
}
users -> cloud.app.api: HTTPS
cloud.app.api -> cloud.data.pg: SQL`);
    expect(g.nodes.map((n) => [n.id, n.label, n.group])).toEqual([
      ["users", "Users", undefined],
      ["cloud.app.api", "API", "cloud.app"],
      ["cloud.app.jobs", "Workers", "cloud.app"],
      ["cloud.data.pg", "Postgres", "cloud.data"],
      ["cloud.data.redis", "Redis", "cloud.data"],
    ]);
    expect(g.groups!.map((x) => [x.id, x.label, x.parent])).toEqual([
      ["cloud", "Cloud", undefined],
      ["cloud.app", "App tier", "cloud"],
      ["cloud.data", "Data", "cloud"],
    ]);
    expect(g.edges.map((e) => e.label)).toEqual(["HTTPS", "SQL"]);
  });

  it("reports errors with a line number", () => {
    expect(() => parseD2("a -> {")).toThrow("line 1");
    expect(() => parseD2("a: {\n  b\n")).toThrow('line 1: missing "}"');
    expect(() => parseD2("direction: sideways")).toThrow("direction");
  });
});

describe("PlantUML (G10)", () => {
  it("reads the S27 component diagram: actors, components, databases and aliases", () => {
    const r = parsePlantUml(
      '@startuml\nactor User\n[Web App] as web\ndatabase "Orders DB" as db\nUser --> web : browses\nweb --> db : reads\n@enduml',
    );
    if (!("graph" in r)) throw new Error("expected a graph");
    expect(r.graph.nodes).toEqual([
      { id: "User", label: "User", shape: "ellipse" },
      { id: "web", label: "Web App", shape: "rectangle" },
      { id: "db", label: "Orders DB", shape: "rectangle" },
    ]);
    expect(r.graph.edges).toEqual([
      { from: "User", to: "web", label: "browses" },
      { from: "web", to: "db", label: "reads" },
    ]);
  });

  it("turns the S29 sequence diagram into Mermaid", () => {
    const r = parsePlantUml("@startuml\nAlice -> Bob : Hello\nBob --> Alice : Hi\n@enduml");
    expect(r).toEqual({ mermaid: "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi" });
    const named = parsePlantUml(
      'participant "Web App" as W\nactor User\nUser -> W : open\nalt ok\nW --> User : page\nend',
    );
    expect(named).toEqual({
      mermaid:
        "sequenceDiagram\n  participant W as Web App\n  actor User\n  User->>W: open\n  alt ok\n  W-->>User: page\n  end",
    });
  });

  it("reads class diagrams: bodies, members, inheritance and packages", () => {
    const r = parsePlantUml(`@startuml
package Zoo {
  class Animal {
    +name: String
  }
  class Dog
}
Animal <|-- Dog
Dog "1" *-- "many" Leg : has
Animal ..> Food
@enduml`);
    if (!("graph" in r)) throw new Error("expected a graph");
    const g = r.graph;
    expect(g.groups).toEqual([{ id: "Zoo", label: "Zoo" }]);
    expect(g.nodes.find((n) => n.id === "Animal")).toMatchObject({ group: "Zoo" });
    expect(g.nodes.find((n) => n.id === "Animal")!.label).toContain("+name: String");
    expect(g.edges).toEqual([
      { from: "Dog", to: "Animal" },
      { from: "Leg", to: "Dog", label: "has" },
      { from: "Animal", to: "Food", dashed: true },
    ]);
  });

  it("reads state and use-case diagrams, and direction", () => {
    const s = parsePlantUml("[*] --> Idle\nIdle --> Running : start\nRunning --> [*]");
    if (!("graph" in s)) throw new Error("expected a graph");
    expect(s.graph.nodes.filter((n) => n.small)).toHaveLength(2);
    const u = parsePlantUml("left to right direction\n:Shopper: --> (Checkout)\nrectangle Store {\n  (Browse)\n}");
    if (!("graph" in u)) throw new Error("expected a graph");
    expect(u.graph.direction).toBe("right");
    expect(u.graph.nodes.map((n) => [n.label, n.shape])).toEqual([
      ["Shopper", "ellipse"],
      ["Checkout", "ellipse"],
      ["Browse", "ellipse"],
    ]);
    expect(u.graph.nodes.find((n) => n.label === "Browse")!.group).toBe("Store");
  });

  it("ignores comments, notes and skinparams, and rejects what it can't read", () => {
    const r = parsePlantUml(
      "' comment\nskinparam monochrome true\nskinparam class {\n  BackgroundColor red\n}\nnote as N\n text\nend note\n[A] --> [B]",
    );
    expect("graph" in r && r.graph.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(() => parsePlantUml("start\n:step;\nstop")).toThrow("activity diagrams are not supported");
    expect(() => parsePlantUml("[A] --> [B]\n!!!")).toThrow("line 2");
    expect(() => parsePlantUml("package P {\n[A]")).toThrow('missing "}"');
  });
});

describe("parseSource", () => {
  it("routes each language to its parser", () => {
    expect(parseSource("graph", '{"nodes":[{"id":"a"}]}')).toMatchObject({ graph: { nodes: [{ id: "a" }] } });
    expect(parseSource("dot", "digraph { a -> b }")).toMatchObject({ graph: { edges: [{ from: "a", to: "b" }] } });
    expect(parseSource("d2", "a -> b")).toMatchObject({ graph: { edges: [{ from: "a", to: "b" }] } });
    expect(parseSource("plantuml", "A -> B : hi")).toHaveProperty("mermaid");
  });
});
