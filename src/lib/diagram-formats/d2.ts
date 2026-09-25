import {
  DiagramSyntaxError,
  type Graph,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type NodeShape,
} from "./graph";

/**
 * D2 → Graph (G10; subset in docs/DECISIONS.md #23): shapes with labels,
 * connections (`->`, `<-`, `<->`, `--`) with chains and labels, containers
 * (nested, and addressed with dotted paths) as groups, `shape`, `direction` and
 * dashed strokes.
 */

const SHAPES: Record<string, NodeShape> = { circle: "ellipse", oval: "ellipse", person: "ellipse", diamond: "diamond" };
const RESERVED = new Set([
  "shape",
  "label",
  "style",
  "icon",
  "near",
  "tooltip",
  "link",
  "width",
  "height",
  "direction",
  "constraint",
  "class",
  "classes",
]);
const OPS = ["<->", "->", "<-", "--"];

type Pending = { from: string[]; to: string[]; op: string; label?: string; dashed?: boolean; line: number };
type Decl = { label?: string; shape?: string; line: number; order: number };

export function parseD2(src: string): Graph {
  let i = 0;
  let line = 1;
  let direction: "right" | "down" = "down";
  const decls = new Map<string, Decl>();
  const edges: Pending[] = [];
  let order = 0;

  const at = (s: string) => src.startsWith(s, i);
  const fail = (msg: string, l = line): never => {
    throw new DiagramSyntaxError(msg, l);
  };
  const skipSpaces = () => {
    while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\r")) i++;
  };
  const skipComment = () => {
    if (src[i] === "#") while (i < src.length && src[i] !== "\n") i++;
  };
  const declare = (path: string[], init: Partial<Decl> = {}) => {
    const key = path.join(".");
    let d = decls.get(key);
    if (!d) {
      d = { line, order: order++ };
      decls.set(key, d);
    }
    // Parents exist implicitly.
    for (let k = 1; k < path.length; k++) if (!decls.has(path.slice(0, k).join("."))) declare(path.slice(0, k));
    Object.assign(d, init);
    return d;
  };

  /** A key: quoted, or plain text up to an operator, ":", "{", "}", ";", "#" or the end of the line. */
  const readKey = (): string | null => {
    skipSpaces();
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i]!;
      const end = src.indexOf(q, i + 1);
      if (end < 0) fail("unclosed quote");
      const value = src.slice(i + 1, end);
      i = end + 1;
      return value;
    }
    let s = "";
    while (i < src.length && !/[:{};#\n]/.test(src[i]!) && !OPS.some((op) => at(op))) s += src[i++];
    s = s.trim();
    return s || null;
  };
  const splitPath = (key: string) => key.split(".").map((p) => p.trim().replace(/^["']|["']$/g, ""));
  const readOp = () => {
    skipSpaces();
    const op = OPS.find((o) => at(o));
    if (op) i += op.length;
    return op;
  };
  /** Label text after ":" up to "{", ";", "#", "}" or the end of the line. */
  const readValue = (): string => {
    skipSpaces();
    if (src[i] === '"' || src[i] === "'") return readKey() ?? "";
    let s = "";
    while (i < src.length && !/[{};#\n]/.test(src[i]!)) s += src[i++];
    return s.trim();
  };

  /** Statements until "}" (or the end, at the top level). */
  const block = (scope: string[], top: boolean, open = line) => {
    for (;;) {
      skipSpaces();
      skipComment();
      if (i >= src.length) {
        if (top) return;
        fail('missing "}"', open);
      }
      const c = src[i]!;
      if (c === "\n") {
        line++;
        i++;
        continue;
      }
      if (c === ";") {
        i++;
        continue;
      }
      if (c === "}") {
        if (top) fail('unexpected "}"');
        i++;
        return;
      }
      statement(scope);
    }
  };

  /** Attributes inside `x: { … }` that belong to x itself, or nested declarations. */
  const statement = (scope: string[]) => {
    const stmtLine = line;
    const first = readKey();
    if (first === null) fail(`expected a shape name but found "${src[i] ?? "the end"}"`);
    const chain = [first!];
    const ops: string[] = [];
    for (let op = readOp(); op; op = readOp()) {
      ops.push(op);
      const next = readKey();
      if (next === null) fail(`expected a shape name after "${op}"`);
      chain.push(next!);
    }
    skipSpaces();
    let value: string | undefined;
    if (src[i] === ":") {
      i++;
      value = readValue();
    }
    skipSpaces();
    const hasBlock = src[i] === "{";

    if (ops.length) {
      const paths = chain.map((k) => [...scope, ...splitPath(k)]);
      for (const p of paths) {
        if (RESERVED.has(p.at(-1)!)) fail(`"${p.at(-1)}" can't be used as a shape name`, stmtLine);
        declare(p);
      }
      const edgeAttrs: { dashed?: boolean } = {};
      if (hasBlock) {
        i++;
        edgeBlock(edgeAttrs, stmtLine);
      }
      for (let k = 0; k < ops.length; k++) {
        edges.push({
          from: paths[k]!,
          to: paths[k + 1]!,
          op: ops[k]!,
          ...(value ? { label: value } : {}),
          ...(edgeAttrs.dashed ? { dashed: true } : {}),
          line: stmtLine,
        });
      }
      return;
    }

    const path = [...scope, ...splitPath(first!)];
    const last = path.at(-1)!;
    if (path.length === 1 && last === "direction") {
      if (value === "right" || value === "left") direction = "right";
      else if (value === "down" || value === "up") direction = "down";
      else fail(`direction must be right, left, down or up`, stmtLine);
      return;
    }
    // x.shape: circle, x.label: Text, x.style.*: …
    const reservedAt = path.findIndex((p) => RESERVED.has(p));
    if (reservedAt >= 0) {
      const target = path.slice(0, reservedAt);
      const attr = path[reservedAt]!;
      if (!target.length) return; // e.g. a top-level "style" or "classes" block: ignored
      if (attr === "shape") declare(target, { shape: value });
      else if (attr === "label") declare(target, { label: value });
      if (hasBlock) {
        i++;
        skipBlock(stmtLine);
      }
      return;
    }
    declare(path, value ? { label: value } : {});
    if (hasBlock) {
      i++;
      block(path, false, stmtLine);
    }
  };

  /** `{ style.stroke-dash: 3 }` after a connection. */
  const edgeBlock = (attrs: { dashed?: boolean }, open: number) => {
    const start = i;
    skipBlock(open);
    const body = src.slice(start, i - 1);
    if (/stroke-dash\s*:\s*[1-9]/.test(body) || /animated\s*:\s*true/.test(body)) attrs.dashed = true;
  };
  const skipBlock = (open: number) => {
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      else if (src[i] === "\n") line++;
      i++;
    }
    if (depth > 0) fail('missing "}"', open);
  };

  block([], true);

  // Declarations with children are containers (groups); the rest are nodes.
  const keys = [...decls.keys()];
  const containers = new Set(keys.filter((k) => keys.some((o) => o.startsWith(`${k}.`))));
  const parentOf = (key: string) => {
    const parts = key.split(".");
    return parts.length > 1 ? parts.slice(0, -1).join(".") : undefined;
  };
  const groups: GraphGroup[] = [...containers]
    .sort((a, b) => decls.get(a)!.order - decls.get(b)!.order)
    .map((k) => {
      const parent = parentOf(k);
      return { id: k, label: decls.get(k)!.label ?? k.split(".").at(-1)!, ...(parent ? { parent } : {}) };
    });
  const nodes: GraphNode[] = keys
    .filter((k) => !containers.has(k))
    .sort((a, b) => decls.get(a)!.order - decls.get(b)!.order)
    .map((k) => {
      const d = decls.get(k)!;
      const group = parentOf(k);
      return {
        id: k,
        label: d.label ?? k.split(".").at(-1)!,
        shape: (d.shape && SHAPES[d.shape]) || "rectangle",
        ...(group ? { group } : {}),
      };
    });
  if (!nodes.length) throw new DiagramSyntaxError("the diagram has no shapes");

  // A connection to a container attaches to its first shape.
  const resolve = (path: string[]) => {
    const key = path.join(".");
    if (!containers.has(key)) return key;
    return nodes.find((n) => n.id.startsWith(`${key}.`))!.id;
  };
  const graphEdges: GraphEdge[] = edges.map((e) => {
    const [from, to] = e.op === "<-" ? [resolve(e.to), resolve(e.from)] : [resolve(e.from), resolve(e.to)];
    return {
      from,
      to,
      ...(e.label ? { label: e.label } : {}),
      ...(e.dashed ? { dashed: true } : {}),
      ...(e.op === "<->" ? { arrow: "both" as const } : e.op === "--" ? { arrow: "none" as const } : {}),
    };
  });
  return { direction, nodes, edges: graphEdges, ...(groups.length ? { groups } : {}) };
}
