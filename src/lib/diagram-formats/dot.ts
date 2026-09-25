import {
  DiagramSyntaxError,
  type Graph,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type NodeShape,
} from "./graph";

/**
 * Graphviz DOT → Graph (G10; subset in docs/DECISIONS.md #23): node and edge
 * statements with attributes, edge chains, `node`/`edge` defaults, `rankdir`,
 * and `subgraph cluster_*` as (nested) groups.
 */

type Token = { kind: "id" | "punct" | "edge"; value: string; line: number };

const PUNCT = new Set(["{", "}", "[", "]", "=", ";", ",", ":"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\n") {
      line++;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "#" && /(^|\n)[ \t]*$/.test(src.slice(0, i))) {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new DiagramSyntaxError("unclosed /* comment", line);
      line += (src.slice(i, end).match(/\n/g) ?? []).length;
      i = end + 2;
    } else if (c === '"') {
      const start = line;
      let value = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          const next = src[i + 1]!;
          value += next === "n" || next === "l" || next === "r" ? "\n" : next === '"' ? '"' : `\\${next}`;
          i += 2;
          continue;
        }
        if (src[i] === "\n") line++;
        value += src[i];
        i++;
      }
      if (i >= src.length) throw new DiagramSyntaxError("unclosed string", start);
      i++;
      tokens.push({ kind: "id", value, line: start });
    } else if (c === "<") {
      // HTML label: keep the text, drop the tags.
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === "<") depth++;
        else if (src[j] === ">" && --depth === 0) break;
      }
      if (j >= src.length) throw new DiagramSyntaxError("unclosed HTML label", line);
      const html = src.slice(i + 1, j);
      line += (html.match(/\n/g) ?? []).length;
      tokens.push({
        kind: "id",
        value: html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .trim(),
        line,
      });
      i = j + 1;
    } else if (c === "-" && (src[i + 1] === ">" || src[i + 1] === "-")) {
      tokens.push({ kind: "edge", value: src.slice(i, i + 2), line });
      i += 2;
    } else if (PUNCT.has(c)) {
      tokens.push({ kind: "punct", value: c, line });
      i++;
    } else {
      // Unquoted colours such as fillcolor=#dbeafe are strictly invalid DOT but common: read them as ids.
      const m = src.slice(i).match(/^(-?(?:\.\d+|\d+(?:\.\d*)?)|[A-Za-z_\u0080-￿][\w\u0080-￿]*|#[0-9A-Fa-f]{3,8}\b)/);
      if (!m) throw new DiagramSyntaxError(`unexpected "${c}"`, line);
      tokens.push({ kind: "id", value: m[1]!, line });
      i += m[1]!.length;
    }
  }
  return tokens;
}

type Attrs = Record<string, string>;
/** `cluster` is set only in a cluster's own statement list, where `label = …` names it. */
type Scope = { node: Attrs; edge: Attrs; group?: string; cluster?: GraphGroup };

const SHAPES: Record<string, NodeShape> = {
  ellipse: "ellipse",
  oval: "ellipse",
  circle: "ellipse",
  doublecircle: "ellipse",
  point: "ellipse",
  egg: "ellipse",
  diamond: "diamond",
  Mdiamond: "diamond",
  Msquare: "rectangle",
};

/** Record labels ("{a|b}") become lines. */
function cleanLabel(label: string): string {
  return label
    .replace(/^\{|\}$/g, "")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\\(.)/g, "$1")
    .trim();
}

export function parseDot(src: string): Graph {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (offset = 0) => tokens[pos + offset];
  const lastLine = () => tokens[Math.min(pos, tokens.length - 1)]?.line ?? 1;
  const fail = (msg: string): never => {
    throw new DiagramSyntaxError(msg, peek()?.line ?? lastLine());
  };
  const isPunct = (v: string, offset = 0) => peek(offset)?.kind === "punct" && peek(offset)!.value === v;
  const expectPunct = (v: string) => {
    if (!isPunct(v)) fail(`expected "${v}" but found ${peek() ? `"${peek()!.value}"` : "the end"}`);
    pos++;
  };
  const isKeyword = (kw: string, offset = 0) => peek(offset)?.kind === "id" && peek(offset)!.value.toLowerCase() === kw;
  const id = (): string => {
    const t = peek();
    if (t?.kind !== "id") fail(`expected a name but found ${t ? `"${t.value}"` : "the end"}`);
    pos++;
    return t!.value;
  };

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];
  let direction: "right" | "down" = "down";
  let directed = true;
  let anon = 0;

  const attrList = (): Attrs => {
    const attrs: Attrs = {};
    while (isPunct("[")) {
      pos++;
      while (!isPunct("]")) {
        if (!peek()) fail('expected "]"');
        const key = id();
        let value = "true";
        if (isPunct("=")) {
          pos++;
          value = id();
        }
        attrs[key] = value;
        if (isPunct(",") || isPunct(";")) pos++;
      }
      pos++;
    }
    return attrs;
  };

  const touchNode = (name: string, scope: Scope, attrs: Attrs = {}) => {
    let node = nodes.get(name);
    if (!node) {
      node = { id: name, label: name, shape: "rectangle", ...(scope.group ? { group: scope.group } : {}) };
      nodes.set(name, node);
      applyNodeAttrs(node, scope.node);
    }
    applyNodeAttrs(node, attrs);
    return node;
  };
  const applyNodeAttrs = (node: GraphNode, attrs: Attrs) => {
    if (attrs.label !== undefined) node.label = cleanLabel(attrs.label === "\\N" ? node.id : attrs.label);
    if (attrs.shape !== undefined) node.shape = SHAPES[attrs.shape] ?? "rectangle";
    const fill = attrs.fillcolor ?? (attrs.style?.includes("filled") ? attrs.color : undefined);
    if (fill && fill.startsWith("#")) node.color = fill;
  };

  /** Statements until "}" (or the end, at the top level). Returns the node ids mentioned. */
  const stmtList = (scope: Scope, top: boolean): string[] => {
    const mentioned: string[] = [];
    for (;;) {
      if (!peek()) {
        if (top) return mentioned;
        fail('missing "}"');
      }
      if (isPunct("}")) {
        if (top) fail('unexpected "}"');
        pos++;
        return mentioned;
      }
      if (isPunct(";")) {
        pos++;
        continue;
      }
      mentioned.push(...stmt(scope));
    }
  };

  /** A node id or subgraph used as an edge end: the node ids it stands for. */
  const endpoint = (scope: Scope): string[] => {
    if (isPunct("{") || isKeyword("subgraph")) return subgraph(scope);
    const name = id();
    if (isPunct(":")) {
      // Port (and compass point): ignored.
      pos++;
      id();
      if (isPunct(":")) {
        pos++;
        id();
      }
    }
    touchNode(name, scope);
    return [name];
  };

  const subgraph = (scope: Scope): string[] => {
    let name = `subgraph${++anon}`;
    if (isKeyword("subgraph")) {
      pos++;
      if (peek()?.kind === "id") name = id();
    }
    const line = peek()?.line;
    expectPunct("{");
    const cluster = name.startsWith("cluster");
    let inner: Scope = { node: { ...scope.node }, edge: { ...scope.edge }, group: scope.group };
    let group: GraphGroup | undefined;
    if (cluster) {
      const groupId = name.replace(/^cluster_?/, "") || name;
      if (groups.some((g) => g.id === groupId))
        throw new DiagramSyntaxError(`cluster "${name}" is defined twice`, line);
      group = { id: groupId, label: groupId, ...(scope.group ? { parent: scope.group } : {}) };
      groups.push(group);
      inner = { ...inner, group: group.id, cluster: group };
    }
    return stmtList(inner, false);
  };

  const stmt = (scope: Scope): string[] => {
    const t = peek()!;
    // graph/node/edge defaults
    if (t.kind === "id" && ["graph", "node", "edge"].includes(t.value.toLowerCase()) && isPunct("[", 1)) {
      pos++;
      const attrs = attrList();
      if (t.value.toLowerCase() === "node") Object.assign(scope.node, attrs);
      if (t.value.toLowerCase() === "edge") Object.assign(scope.edge, attrs);
      if (t.value.toLowerCase() === "graph") graphAttr(scope, attrs);
      return [];
    }
    // key = value (graph attribute)
    if (t.kind === "id" && isPunct("=", 1)) {
      const key = id();
      pos++;
      graphAttr(scope, { [key]: id() });
      return [];
    }
    let ends = endpoint(scope);
    const mentioned = [...ends];
    if (peek()?.kind !== "edge") {
      // Node statement (or a bare subgraph).
      if (t.kind === "id" && t.value.toLowerCase() !== "subgraph") {
        touchNode(ends[0]!, scope, attrList());
      }
      return mentioned;
    }
    const chain: string[][] = [ends];
    const ops: string[] = [];
    while (peek()?.kind === "edge") {
      const op = peek()!;
      pos++;
      if (op.value === "->" && !directed)
        throw new DiagramSyntaxError('"->" in an undirected graph; use "--"', op.line);
      ops.push(op.value);
      ends = endpoint(scope);
      mentioned.push(...ends);
      chain.push(ends);
    }
    const attrs = { ...scope.edge, ...attrList() };
    for (let k = 0; k < ops.length; k++) {
      for (const from of chain[k]!)
        for (const to of chain[k + 1]!) {
          const dir = attrs.dir ?? (directed ? "forward" : "none");
          const reverse = dir === "back";
          const edge: GraphEdge = { from: reverse ? to : from, to: reverse ? from : to };
          if (attrs.label) edge.label = cleanLabel(attrs.label);
          if (attrs.style && /dashed|dotted/.test(attrs.style)) edge.dashed = true;
          if (dir === "both") edge.arrow = "both";
          if (dir === "none" || attrs.arrowhead === "none") edge.arrow = "none";
          edges.push(edge);
        }
    }
    return mentioned;
  };
  const graphAttr = (scope: Scope, attrs: Attrs) => {
    if (attrs.rankdir) direction = /^(LR|RL)$/i.test(attrs.rankdir) ? "right" : "down";
    if (attrs.label !== undefined && scope.cluster) scope.cluster.label = cleanLabel(attrs.label);
  };

  // [strict] (graph | digraph) [id] { ... }
  if (isKeyword("strict")) pos++;
  if (isKeyword("digraph")) directed = true;
  else if (isKeyword("graph")) directed = false;
  else fail('a DOT file starts with "digraph" or "graph"');
  pos++;
  if (peek()?.kind === "id") pos++;
  expectPunct("{");
  stmtList({ node: {}, edge: {} }, false);
  if (peek()) fail(`unexpected "${peek()!.value}" after the closing "}"`);

  const list = [...nodes.values()];
  if (!list.length) throw new DiagramSyntaxError("the graph has no nodes");
  return { direction, nodes: list, edges, ...(groups.length ? { groups } : {}) };
}
