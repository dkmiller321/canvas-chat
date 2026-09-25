import {
  DiagramSyntaxError,
  type Graph,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type NodeShape,
} from "./graph";

/**
 * Mermaid flowchart → Graph (G10). Used on the server to check the model's
 * Mermaid before a diagram is created (so it gets line-numbered errors), and in
 * the browser to draw it, so what is accepted is exactly what is drawn.
 * Supports node shapes, all link forms with labels, chains, `&` lists,
 * subgraphs (nested) and `;`, and ignores styling lines.
 */

const ID = /^[\wÀ-￿](?:[\wÀ-￿]|-(?=[\wÀ-￿]))*/;

/** Shape openers, longest first, with their closers and shape. */
const SHAPES: { open: string; close: string[]; shape: NodeShape }[] = [
  { open: "(((", close: [")))"], shape: "ellipse" },
  { open: "((", close: ["))"], shape: "ellipse" },
  { open: "([", close: ["])"], shape: "rectangle" },
  { open: "[(", close: [")]"], shape: "ellipse" },
  { open: "[[", close: ["]]"], shape: "rectangle" },
  { open: "[/", close: ["/]", "\\]"], shape: "rectangle" },
  { open: "[\\", close: ["\\]", "/]"], shape: "rectangle" },
  { open: "{{", close: ["}}"], shape: "rectangle" },
  { open: "@{", close: ["}"], shape: "rectangle" },
  { open: "(", close: [")"], shape: "rectangle" },
  { open: "[", close: ["]"], shape: "rectangle" },
  { open: "{", close: ["}"], shape: "diamond" },
  { open: ">", close: ["]"], shape: "rectangle" },
];

const IGNORED = /^(classDef|class|style|linkStyle|click|accTitle|accDescr|title)\b/;

export function isFlowchart(src: string): boolean {
  return /^(flowchart|graph)\b/i.test(headerLine(src)?.text ?? "");
}

function headerLine(src: string): { text: string; index: number } | undefined {
  const lines = src.split("\n");
  let k = 0;
  // Front matter (--- … ---) and %% comments/directives come before the header.
  if (lines[0]?.trim() === "---") {
    k = lines.findIndex((l, i) => i > 0 && l.trim() === "---") + 1;
  }
  for (; k < lines.length; k++) {
    const t = lines[k]!.replace(/%%.*$/, "").trim();
    if (t) return { text: t, index: k };
  }
  return undefined;
}

function cleanLabel(raw: string): string {
  return (
    raw
      .trim()
      // A shape nested in the label, as models sometimes write: [(["Orders DB"])].
      .replace(/^[[(]"([\s\S]*)"[\])]$/, "$1")
      .replace(/^"([\s\S]*)"$/, "$1")
      .replace(/^`([\s\S]*)`$/, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/#quot;/g, '"')
      .replace(/#amp;/g, "&")
      .trim()
  );
}

/** Split a line into statements at ";" outside quotes and brackets. */
function statements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && "([{".includes(c)) depth++;
    else if (!quoted && ")]}".includes(c)) depth = Math.max(0, depth - 1);
    if (c === ";" && !quoted && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseFlowchart(src: string): Graph {
  const header = headerLine(src);
  const head = header?.text.match(/^(flowchart|graph)\b\s*(\w+)?/i);
  if (!header || !head) throw new DiagramSyntaxError('a flowchart starts with "flowchart" or "graph"');
  const dir = (head[2] ?? "TB").toUpperCase();
  if (!["LR", "RL", "TB", "TD", "BT"].includes(dir)) {
    throw new DiagramSyntaxError(`unknown direction "${head[2]}"; use LR, RL, TB, TD or BT`, header.index + 1);
  }

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];
  const stack: { id: string; line: number }[] = [];

  const lines = src.split("\n");
  for (let k = header.index + 1; k < lines.length; k++) {
    const no = k + 1;
    const text = lines[k]!.replace(/%%.*$/, "").trim();
    if (!text) continue;
    for (const stmt of statements(text)) {
      if (IGNORED.test(stmt) || /^direction\s+\w+$/.test(stmt)) continue;
      if (stmt === "end") {
        if (!stack.length) throw new DiagramSyntaxError('"end" without a subgraph', no);
        stack.pop();
        continue;
      }
      const sub = stmt.match(/^subgraph\s+(.+)$/);
      if (sub) {
        const g = subgraphHeader(sub[1]!, no);
        if (groups.some((x) => x.id === g.id)) throw new DiagramSyntaxError(`subgraph "${g.id}" is defined twice`, no);
        const parent = stack.at(-1)?.id;
        groups.push({ ...g, ...(parent ? { parent } : {}) });
        stack.push({ id: g.id, line: no });
        continue;
      }
      statement(stmt, no);
    }
  }
  if (stack.length) throw new DiagramSyntaxError('missing "end" for this subgraph', stack.at(-1)!.line);

  function subgraphHeader(rest: string, no: number): { id: string; label: string } {
    const withTitle = rest.match(/^([\wÀ-￿-]+)\s*\[\s*(.*?)\s*\]$/);
    if (withTitle) return { id: withTitle[1]!, label: cleanLabel(withTitle[2]!) || withTitle[1]! };
    const title = cleanLabel(rest);
    if (!title) throw new DiagramSyntaxError("a subgraph needs a name", no);
    return { id: title, label: title };
  }

  function statement(stmt: string, no: number) {
    let pos = 0;
    const skip = () => {
      while (stmt[pos] === " " || stmt[pos] === "\t") pos++;
    };
    const fail = (msg: string): never => {
      throw new DiagramSyntaxError(msg, no);
    };

    /** One node reference, with an optional shape and label. Returns its id, or null if none starts here. */
    const node = (): string | null => {
      skip();
      const m = stmt.slice(pos).match(ID);
      if (!m) return null;
      const id = m[0];
      if (id === "end" || id === "subgraph") fail(`"${id}" can't be used as a node id`);
      pos += id.length;
      let label: string | undefined;
      let shape: NodeShape | undefined;
      const opener = SHAPES.find((s) => stmt.startsWith(s.open, pos));
      if (opener) {
        pos += opener.open.length;
        if (opener.open === "@{") {
          const end = stmt.indexOf("}", pos);
          if (end < 0) fail(`missing "}" to close the shape of ${id}`);
          const body = stmt.slice(pos, end);
          pos = end + 1;
          label = body.match(/label\s*:\s*"([^"]*)"/)?.[1];
          const kind = body.match(/shape\s*:\s*([\w-]+)/)?.[1] ?? "";
          shape = /circ|oval|ellipse|stadium|cyl|database|db/.test(kind)
            ? "ellipse"
            : /diam|decision|question/.test(kind)
              ? "diamond"
              : "rectangle";
        } else {
          skip();
          let raw: string;
          if (stmt[pos] === '"') {
            const close = stmt.indexOf('"', pos + 1);
            if (close < 0) fail(`unclosed quote in the label of ${id}`);
            raw = stmt.slice(pos, close + 1);
            pos = close + 1;
            skip();
            const closer = opener.close.find((c) => stmt.startsWith(c, pos));
            if (!closer) {
              fail(
                `expected "${opener.close[0]}" to close the shape of ${id}, found "${stmt.slice(pos, pos + opener.close[0]!.length) || "the end"}"`,
              );
            }
            pos += closer!.length;
          } else {
            const ends = opener.close.map((c) => ({ c, at: stmt.indexOf(c, pos) })).filter((e) => e.at >= 0);
            if (!ends.length) fail(`missing "${opener.close[0]}" to close the shape of ${id}`);
            const first = ends.sort((a, b) => a.at - b.at)[0]!;
            raw = stmt.slice(pos, first.at);
            pos = first.at + first.c.length;
          }
          label = cleanLabel(raw);
          shape = opener.shape;
        }
      }
      // :::className
      const cls = stmt.slice(pos).match(/^:::[\w-]+/);
      if (cls) pos += cls[0].length;
      const group = stack.at(-1)?.id;
      let n = nodes.get(id);
      if (!n) {
        n = { id, label: id, shape: "rectangle", ...(group ? { group } : {}) };
        nodes.set(id, n);
      } else if (group && (!n.group || stack.some((s) => s.id === n!.group))) {
        // As in Mermaid, a node mentioned inside a subgraph moves into it (from no
        // subgraph, or from one that encloses this one), even if defined earlier.
        n.group = group;
      }
      if (label !== undefined) n.label = label || id;
      if (shape) n.shape = shape;
      return id;
    };

    /** `a & b & c` */
    const nodeList = (): string[] | null => {
      const first = node();
      if (!first) return null;
      const ids = [first];
      for (;;) {
        skip();
        if (stmt[pos] !== "&") return ids;
        pos++;
        const next = node();
        if (!next) fail('expected a node after "&"');
        ids.push(next!);
      }
    };

    type Link = { label?: string; dashed?: boolean; arrow?: "none" | "both" };
    const link = (): Link | null => {
      skip();
      const rest = stmt.slice(pos);
      // Text inside the link: -- text -->, -. text .->, == text ==>
      const withText =
        rest.match(/^(<)?(--)\s+([^\s>|-][^|]*?)\s+(-{2,}>|-{3,})/) ??
        rest.match(/^(<)?(-\.)\s*([^\s.>-][^|]*?)\s*(\.-+>|\.-+)/) ??
        rest.match(/^(<)?(==)\s+([^\s=>][^|]*?)\s+(={2,}>|={3,})/);
      if (withText) {
        pos += withText[0].length;
        const head = withText[4]!.endsWith(">");
        return linkOf(Boolean(withText[1]), head, withText[2] === "-.", cleanLabel(withText[3]!));
      }
      const plain = rest.match(/^(<|[ox](?=[-=]))?(-{2,}|={2,}|-\.+-)(>|[ox](?=\s))?/);
      if (!plain || (!plain[3] && plain[2]!.length < 3)) return null;
      pos += plain[0].length;
      skip();
      let label: string | undefined;
      if (stmt[pos] === "|") {
        const close = stmt.indexOf("|", pos + 1);
        if (close < 0) fail('missing "|" after the link label');
        label = cleanLabel(stmt.slice(pos + 1, close));
        pos = close + 1;
      }
      return linkOf(Boolean(plain[1]), Boolean(plain[3]), plain[2]!.includes("."), label);
    };
    const linkOf = (start: boolean, end: boolean, dashed: boolean, label?: string): Link => ({
      ...(label ? { label } : {}),
      ...(dashed ? { dashed: true } : {}),
      ...(start && end ? { arrow: "both" as const } : !end ? { arrow: "none" as const } : {}),
    });

    let from = nodeList();
    if (!from) fail(`can't read "${stmt}"`);
    for (;;) {
      skip();
      if (pos >= stmt.length) return;
      const l = link();
      if (!l)
        fail(`expected an arrow like --> after "${stmt.slice(0, pos).trim()}", found "${stmt.slice(pos, pos + 12)}"`);
      const to = nodeList();
      if (!to) fail(`expected a node after the arrow`);
      for (const a of from!) for (const b of to!) edges.push({ from: a, to: b, ...l });
      from = to;
    }
  }

  // A link to a subgraph attaches to its first node.
  const groupIds = new Set(groups.map((g) => g.id));
  for (const id of groupIds) nodes.delete(id);
  const list = [...nodes.values()];
  const firstIn = (gid: string): string | undefined =>
    list.find((n) => n.group === gid)?.id ??
    groups
      .filter((g) => g.parent === gid)
      .map((g) => firstIn(g.id))
      .find(Boolean);
  const resolved = edges.flatMap((e) => {
    const from = groupIds.has(e.from) ? firstIn(e.from) : e.from;
    const to = groupIds.has(e.to) ? firstIn(e.to) : e.to;
    return from && to ? [{ ...e, from, to }] : [];
  });
  if (!list.length) throw new DiagramSyntaxError("the flowchart has no nodes");
  return {
    direction: dir === "LR" || dir === "RL" ? "right" : "down",
    nodes: list,
    edges: resolved,
    ...(groups.length ? { groups } : {}),
  };
}
