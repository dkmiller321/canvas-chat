/**
 * Editable fallback for Mermaid diagram types that mermaid-to-excalidraw only
 * renders as a flat image (G8): class, state, ER and mind-map diagrams are parsed
 * into a small graph and laid out as Excalidraw element skeletons (labelled
 * shapes and bound arrows) that the editor converts into real elements.
 */

import { type Graph, type GraphNode, graphToSkeleton } from "@/lib/diagram-formats/graph";

export { graphToSkeleton };

const lines = (src: string) =>
  src
    .split("\n")
    .map((l) => l.replace(/%%.*$/, ""))
    .filter((l) => l.trim());

function addNode(graph: Graph, id: string, init: Partial<GraphNode> = {}) {
  let node = graph.nodes.find((n) => n.id === id);
  if (!node) {
    node = { id, label: id, shape: "rectangle", ...init };
    graph.nodes.push(node);
  }
  return node;
}

function parseClass(src: string): Graph {
  const g: Graph = { nodes: [], edges: [] };
  const members = new Map<string, string[]>();
  let open: string | null = null;
  for (const raw of lines(src).slice(1)) {
    const line = raw.trim();
    if (open) {
      if (line === "}") open = null;
      else members.set(open, [...(members.get(open) ?? []), line]);
      continue;
    }
    const decl = line.match(/^class\s+([\w-]+)(?:~[^~]*~)?\s*(\{)?/);
    if (decl) {
      addNode(g, decl[1]!);
      if (decl[2]) open = decl[1]!;
      continue;
    }
    const member = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (member && !/(<\||\*|o|\.\.|--)/.test(member[1]!)) {
      addNode(g, member[1]!);
      members.set(member[1]!, [...(members.get(member[1]!) ?? []), member[2]!]);
      continue;
    }
    // Relations: A <|-- B, A *-- B, A o-- B, A --> B, A ..> B, A -- B, with an optional ": label".
    const rel = line.match(
      /^([\w-]+)\s*(?:"[^"]*"\s*)?(<\|--|\*--|o--|-->|\.\.>|\.\.\|>|--\|>|--\*|--o|--|\.\.)\s*(?:"[^"]*"\s*)?([\w-]+)(?:\s*:\s*(.+))?$/,
    );
    if (rel) {
      const [, a, op, b, label] = rel;
      addNode(g, a!);
      addNode(g, b!);
      // Inheritance points from child to parent.
      const reversed = op === "<|--" || op === "*--" || op === "o--";
      g.edges.push(reversed ? { from: b!, to: a!, label } : { from: a!, to: b!, label });
    }
  }
  for (const n of g.nodes) {
    const m = members.get(n.id);
    if (m?.length) n.label = `${n.id}\n${"─".repeat(Math.max(6, n.id.length))}\n${m.join("\n")}`;
  }
  return g;
}

function parseState(src: string): Graph {
  const g: Graph = { nodes: [], edges: [] };
  let starts = 0;
  let ends = 0;
  const endpoint = (name: string, asTarget: boolean) => {
    if (name !== "[*]") return addNode(g, name).id;
    const id = asTarget ? `__end${ends++}` : `__start${starts++}`;
    addNode(g, id, { label: asTarget ? "End" : "Start", shape: "ellipse", small: true });
    return id;
  };
  for (const raw of lines(src).slice(1)) {
    const line = raw.trim();
    const t = line.match(/^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/);
    if (t) {
      g.edges.push({ from: endpoint(t[1]!, false), to: endpoint(t[2]!, true), label: t[3] });
      continue;
    }
    const s = line.match(/^state\s+(?:"([^"]+)"\s+as\s+)?([\w-]+)/);
    if (s) addNode(g, s[2]!, { label: s[1] ?? s[2]! });
    const desc = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (desc) addNode(g, desc[1]!).label = `${desc[1]}\n${desc[2]}`;
  }
  return g;
}

/** ER crow's-foot ends as words: "||" one, "|o"/"o|" zero or one, "}|"/"|{" one or more, "}o"/"o{" zero or more. */
const CARDINALITY: Record<string, string> = {
  "||": "1",
  "|o": "0..1",
  "o|": "0..1",
  "}|": "1..*",
  "|{": "1..*",
  "}o": "0..*",
  "o{": "0..*",
};

function cardinality(op: string): string {
  const left = CARDINALITY[op.slice(0, 2)] ?? "?";
  const right = CARDINALITY[op.slice(-2)] ?? "?";
  return `${left} → ${right}`;
}

function parseEr(src: string): Graph {
  const g: Graph = { nodes: [], edges: [] };
  const attrs = new Map<string, string[]>();
  let open: string | null = null;
  for (const raw of lines(src).slice(1)) {
    const line = raw.trim();
    if (open) {
      if (line === "}") open = null;
      else attrs.set(open, [...(attrs.get(open) ?? []), line.replace(/\s+/g, " ")]);
      continue;
    }
    const block = line.match(/^([\w-]+)\s*\{$/);
    if (block) {
      addNode(g, block[1]!);
      open = block[1]!;
      continue;
    }
    const rel = line.match(/^([\w-]+)\s+([|o}{]{2}(?:--|\.\.)[|o}{]{2})\s+([\w-]+)\s*:\s*"?([^"]+?)"?$/);
    if (rel) {
      addNode(g, rel[1]!);
      addNode(g, rel[3]!);
      g.edges.push({ from: rel[1]!, to: rel[3]!, label: `${rel[4]} (${cardinality(rel[2]!)})`, arrow: "none" });
    }
  }
  for (const n of g.nodes) {
    const a = attrs.get(n.id);
    if (a?.length) n.label = `${n.id}\n${"─".repeat(Math.max(6, n.id.length))}\n${a.join("\n")}`;
  }
  return g;
}

function parseMindmap(src: string): Graph {
  const g: Graph = { nodes: [], edges: [] };
  const stack: { indent: number; id: string }[] = [];
  let n = 0;
  for (const raw of lines(src).slice(1)) {
    const indent = raw.length - raw.trimStart().length;
    let text = raw.trim();
    let shape: GraphNode["shape"] = "rectangle";
    // id((circle)), id(rounded), id[square], id{{hexagon}}, or plain text.
    const m = text.match(/^[\w-]*\s*(\(\(|\(|\[|\{\{|\)\)|\))(.+?)(\)\)|\)|\]|\}\}|\(\(|\()$/);
    if (m) {
      text = m[2]!.trim();
      if (m[1] === "((") shape = "ellipse";
    }
    const id = `m${n++}`;
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    const parent = stack.at(-1);
    addNode(g, id, { label: text, shape: parent ? "rectangle" : m ? shape : "ellipse" });
    if (parent) g.edges.push({ from: parent.id, to: id, arrow: "none" });
    stack.push({ indent, id });
  }
  return g;
}

/** Diagram type of a Mermaid source, from its first meaningful line. */
export function mermaidType(src: string): string {
  return (lines(src)[0] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function parseFallback(src: string): Graph | null {
  switch (mermaidType(src)) {
    case "classdiagram":
    case "classdiagram-v2":
      return parseClass(src);
    case "statediagram":
    case "statediagram-v2":
      return parseState(src);
    case "erdiagram":
      return parseEr(src);
    case "mindmap":
      return parseMindmap(src);
    default:
      return null;
  }
}
