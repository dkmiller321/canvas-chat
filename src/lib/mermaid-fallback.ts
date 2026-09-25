/**
 * Editable fallback for Mermaid diagram types that mermaid-to-excalidraw only
 * renders as a flat image (G8): class, state, ER and mind-map diagrams are parsed
 * into a small graph and laid out as Excalidraw element skeletons (labelled
 * shapes and bound arrows) that the editor converts into real elements.
 */

export type GraphNode = { id: string; label: string; shape: "rectangle" | "ellipse" | "diamond"; small?: boolean };
export type GraphEdge = { from: string; to: string; label?: string };
export type Graph = { kind: "class" | "state" | "er" | "mindmap"; nodes: GraphNode[]; edges: GraphEdge[] };

export type Skeleton =
  | {
      type: "rectangle" | "ellipse" | "diamond";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label?: { text: string };
      backgroundColor?: string;
    }
  | {
      type: "arrow";
      x: number;
      y: number;
      start: { id: string };
      end: { id: string };
      label?: { text: string };
      endArrowhead?: "arrow" | null;
    };

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
  const g: Graph = { kind: "class", nodes: [], edges: [] };
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
  const g: Graph = { kind: "state", nodes: [], edges: [] };
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
  const g: Graph = { kind: "er", nodes: [], edges: [] };
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
      g.edges.push({ from: rel[1]!, to: rel[3]!, label: `${rel[4]} (${cardinality(rel[2]!)})` });
    }
  }
  for (const n of g.nodes) {
    const a = attrs.get(n.id);
    if (a?.length) n.label = `${n.id}\n${"─".repeat(Math.max(6, n.id.length))}\n${a.join("\n")}`;
  }
  return g;
}

function parseMindmap(src: string): Graph {
  const g: Graph = { kind: "mindmap", nodes: [], edges: [] };
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
    if (parent) g.edges.push({ from: parent.id, to: id });
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

const FONT = 20;
const CHAR = FONT * 0.55;
const LINE = FONT * 1.35;

function size(node: GraphNode) {
  if (node.small) return { width: 36, height: 36 };
  const rows = node.label.split("\n");
  const width = Math.max(120, Math.max(...rows.map((r) => r.length)) * CHAR + 48);
  const height = Math.max(60, rows.length * LINE + 28);
  return node.shape === "ellipse" ? { width: width * 1.2, height: height * 1.2 } : { width, height };
}

/** Left-to-right layered positions (mind maps: a tree fanning out to the right). */
function positions(g: Graph): Map<string, { x: number; y: number; width: number; height: number }> {
  const out = new Map<string, { x: number; y: number; width: number; height: number }>();
  const sizes = new Map(g.nodes.map((n) => [n.id, size(n)]));
  const children = new Map<string, string[]>();
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) {
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const seen = new Set<string>();
  const visit = (id: string, r: number) => {
    if (seen.has(id) || (rank.get(id) ?? -1) >= r) return;
    rank.set(id, r);
    seen.add(id);
    for (const c of children.get(id) ?? []) visit(c, r + 1);
    seen.delete(id);
  };
  for (const n of g.nodes) if ((indeg.get(n.id) ?? 0) === 0) visit(n.id, 0);
  for (const n of g.nodes) if (!rank.has(n.id)) visit(n.id, 0);

  const columns: string[][] = [];
  for (const n of g.nodes) (columns[rank.get(n.id)!] ??= []).push(n.id);
  const gapX = g.kind === "mindmap" ? 90 : 120;
  const gapY = 50;
  let x = 0;
  for (const col of columns) {
    if (!col) continue;
    const w = Math.max(...col.map((id) => sizes.get(id)!.width));
    const h = col.reduce((s, id) => s + sizes.get(id)!.height, 0) + gapY * (col.length - 1);
    let y = -h / 2;
    for (const id of col) {
      const s = sizes.get(id)!;
      out.set(id, { x: x + (w - s.width) / 2, y, ...s });
      y += s.height + gapY;
    }
    x += w + gapX;
  }
  return out;
}

export function graphToSkeleton(g: Graph): Skeleton[] {
  const pos = positions(g);
  const shapes: Skeleton[] = g.nodes.map((n) => {
    const p = pos.get(n.id)!;
    return {
      type: n.shape,
      id: n.id,
      ...p,
      ...(n.small ? { backgroundColor: "#1e1e1e" } : { label: { text: n.label } }),
    };
  });
  const arrows: Skeleton[] = g.edges.map((e) => {
    const a = pos.get(e.from)!;
    return {
      type: "arrow",
      x: a.x + a.width,
      y: a.y + a.height / 2,
      start: { id: e.from },
      end: { id: e.to },
      ...(e.label ? { label: { text: e.label } } : {}),
      endArrowhead: g.kind === "er" || g.kind === "mindmap" ? null : "arrow",
    };
  });
  return [...shapes, ...arrows];
}
