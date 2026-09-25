import {
  DiagramSyntaxError,
  type Graph,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type NodeShape,
} from "./graph";

/**
 * PlantUML → Graph or Mermaid (G10; subset in docs/DECISIONS.md #23).
 * Sequence diagrams become Mermaid `sequenceDiagram` source, drawn by
 * mermaid-to-excalidraw. Class, component, use-case, deployment and state
 * diagrams become a graph.
 */

export type PlantUmlResult = { graph: Graph } | { mermaid: string };

type Line = { text: string; no: number };

/** Content lines with comments, notes, legends and skinparam blocks removed. */
function contentLines(src: string): Line[] {
  const raw = src.split("\n");
  const out: Line[] = [];
  let skipUntil: RegExp | null = null;
  let braceSkip = 0;
  let inBlockComment = false;
  for (let k = 0; k < raw.length; k++) {
    let text = raw[k]!.replace(/\r$/, "");
    const no = k + 1;
    if (inBlockComment) {
      const end = text.indexOf("'/");
      if (end < 0) continue;
      text = text.slice(end + 2);
      inBlockComment = false;
    }
    const open = text.indexOf("/'");
    if (open >= 0) {
      const end = text.indexOf("'/", open + 2);
      if (end < 0) {
        inBlockComment = true;
        text = text.slice(0, open);
      } else text = text.slice(0, open) + text.slice(end + 2);
    }
    text = text.trim();
    if (skipUntil) {
      if (skipUntil.test(text)) skipUntil = null;
      continue;
    }
    if (braceSkip) {
      braceSkip += (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
      continue;
    }
    if (!text || text.startsWith("'")) continue;
    if (/^@(start|end)\w*/i.test(text)) continue;
    if (
      /^(skinparam|hide|show|title|caption|header|footer|scale|!|autoactivate|newpage|allowmixing|set\s+separator)\b/i.test(
        text,
      )
    ) {
      if (/^skinparam\b.*\{\s*$/i.test(text)) braceSkip = 1;
      continue;
    }
    if (/^(r|h)?note\b/i.test(text) && !/:/.test(text)) {
      skipUntil = /^end\s*(r|h)?note$/i;
      continue;
    }
    if (/^(r|h)?note\b/i.test(text)) continue;
    if (/^legend\b/i.test(text)) {
      skipUntil = /^end\s*legend$/i;
      continue;
    }
    out.push({ text, no });
  }
  return out;
}

// ---- sequence diagrams --------------------------------------------------------

const PARTICIPANT = /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+)$/i;
const MESSAGE = /^("[^"]+"|[\w.]+)\s*(<?-{1,2}>{0,2}|<{1,2}-{1,2})\s*("[^"]+"|[\w.]+)\s*(?::\s*(.*))?$/;
const SEQUENCE_ONLY =
  /^(participant|activate|deactivate|destroy|autonumber|alt|else|opt|loop|par|break|critical|group|end|return|ref|box|==|\.\.\.|\|\|\||create)\b|^(==|\.\.\.)/i;
const GRAPH_ONLY =
  /(\[\*\])|(^|\s)\[[^\]]+\]|(^|\s)\([^)]+\)|^(class|interface|enum|abstract|annotation|usecase|component|node|package|rectangle|cloud|frame|folder|namespace|state|object|artifact|card|file|storage|agent|hexagon|stack|together)\b|\{\s*$|^(left to right|top to bottom) direction|--\|>|<\|--|\*--|--\*|o--|--o|\.\.>|<\.\.|\.\.\|>|<\|\.\./i;

function isSequence(lines: Line[]): boolean {
  if (lines.some((l) => GRAPH_ONLY.test(l.text))) return false;
  return lines.some((l) => MESSAGE.test(l.text) || SEQUENCE_ONLY.test(l.text));
}

function toMermaidSequence(lines: Line[]): string {
  const out = ["sequenceDiagram"];
  const ids = new Map<string, string>();
  const declared = new Set<string>();
  const idOf = (name: string) => {
    const clean = name.replace(/^"|"$/g, "");
    let id = ids.get(clean);
    if (!id) {
      id = clean.replace(/\W+/g, "_") || `p${ids.size + 1}`;
      ids.set(clean, id);
      if (id !== clean && !declared.has(id)) {
        declared.add(id);
        out.push(`  participant ${id} as ${clean}`);
      }
    }
    return id;
  };
  for (const { text, no } of lines) {
    const p = text.match(PARTICIPANT);
    if (p) {
      const kind = p[1]!.toLowerCase() === "actor" ? "actor" : "participant";
      // participant "Long name" as L  |  participant L as "Long name"  |  participant Name
      const rest = p[2]!.replace(/\s*<<.*>>/, "").replace(/\s+#\w+$/, "");
      const m = rest.match(/^("[^"]+"|[\w.]+)(?:\s+as\s+("[^"]+"|[\w.]+))?/);
      if (!m) throw new DiagramSyntaxError(`can't read participant "${rest}"`, no);
      const a = m[1]!.replace(/^"|"$/g, "");
      const b = m[2]?.replace(/^"|"$/g, "");
      const [label, alias] = b ? (m[1]!.startsWith('"') ? [a, b] : [b, a]) : [a, a];
      const id = alias.replace(/\W+/g, "_");
      ids.set(alias, id);
      ids.set(label, id);
      declared.add(id);
      out.push(`  ${kind} ${id}${label !== id ? ` as ${label}` : ""}`);
      continue;
    }
    const msg = text.match(MESSAGE);
    if (msg) {
      const [, a, arrow, b, label] = msg;
      const reversed = arrow!.startsWith("<");
      const from = idOf(reversed ? b! : a!);
      const to = idOf(reversed ? a! : b!);
      const dashed = arrow!.includes("--");
      out.push(`  ${from}${dashed ? "-->>" : "->>"}${to}: ${label?.trim() || " "}`);
      continue;
    }
    const block = text.match(/^(alt|else|opt|loop|par|critical|break|group|end)\b\s*(.*)$/i);
    if (block) {
      const kw = block[1]!.toLowerCase();
      const mapped = kw === "group" ? "rect rgb(240, 240, 240)" : kw === "break" || kw === "critical" ? "opt" : kw;
      out.push(`  ${mapped}${block[2] && kw !== "group" && kw !== "end" ? ` ${block[2]}` : ""}`);
      continue;
    }
    const act = text.match(/^(activate|deactivate)\s+("[^"]+"|[\w.]+)/i);
    if (act) {
      out.push(`  ${act[1]!.toLowerCase()} ${idOf(act[2]!)}`);
      continue;
    }
    if (/^autonumber\b/i.test(text)) {
      out.push("  autonumber");
      continue;
    }
    if (/^(==|\.\.\.|\|\|\||return|destroy|ref|box|end\s*box|create)/i.test(text)) continue;
    throw new DiagramSyntaxError(`can't read "${text}" in a sequence diagram`, no);
  }
  return out.join("\n");
}

// ---- graph diagrams --------------------------------------------------------------

const ELEMENT_SHAPES: Record<string, NodeShape> = {
  actor: "ellipse",
  person: "ellipse",
  usecase: "ellipse",
  boundary: "ellipse",
  control: "ellipse",
  entity: "ellipse",
  interface: "ellipse",
  circle: "ellipse",
  hexagon: "diamond",
};
const ELEMENT_KINDS =
  "actor|person|usecase|component|node|database|rectangle|cloud|queue|interface|class|enum|abstract\\s+class|abstract|annotation|artifact|boundary|control|entity|collections|file|folder|frame|storage|agent|card|hexagon|stack|label|state|object|package|namespace|circle";
const CONTAINERS =
  /^(package|namespace|frame|folder|rectangle|node|cloud|component|database|card|stack|storage|together|state)$/i;
const DECL = new RegExp(`^(${ELEMENT_KINDS})\\s+(.+?)\\s*(\\{)?$`, "i");
// endpoint: "Label" | [Component] | (Use case) | :Actor: | [*] | name
const END = String.raw`("[^"]+"|\[\*\]|\[[^\]]+\]|\([^)]+\)|:[^:\s][^:]*:|[\w.]+)`;
const ARROW = String.raw`((?:<\||[<*o#x+^}])?[-.]+(?:\[[^\]]*\])?(?:(?:left|right|up|down|le|ri|do|u|d|l|r)[-.]+)?(?:\[[^\]]*\])?(?:\|>|[>*o#x+^{])?)`;
const RELATION = new RegExp(`^${END}\\s*(?:"[^"]*"\\s*)?${ARROW}\\s*(?:"[^"]*"\\s*)?${END}\\s*(?::\\s*(.*))?$`, "i");

function toGraph(lines: Line[]): Graph {
  let direction: "right" | "down" = "down";
  const nodes = new Map<string, GraphNode>();
  const byName = new Map<string, string>();
  const members = new Map<string, string[]>();
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];
  const stack: ({ kind: "group"; id: string } | { kind: "class"; id: string } | { kind: "skip" })[] = [];
  let starts = 0;
  let ends = 0;

  const currentGroup = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const s = stack[k]!;
      if (s.kind === "group") return s.id;
    }
    return undefined;
  };
  const unquote = (s: string) => s.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  const add = (id: string, label: string, shape: NodeShape) => {
    let node = nodes.get(id);
    if (!node) {
      const group = currentGroup();
      node = { id, label, shape, ...(group ? { group } : {}) };
      nodes.set(id, node);
    }
    byName.set(label, id);
    byName.set(id, id);
    return node;
  };

  /** Resolve an arrow end (declaring it when new). `asTarget` decides whether [*] is a start or an end. */
  const endpoint = (raw: string, asTarget: boolean): string => {
    if (raw === "[*]") {
      const id = asTarget ? `__end${++ends}` : `__start${++starts}`;
      nodes.set(id, { id, label: asTarget ? "End" : "Start", shape: "ellipse", small: true });
      return id;
    }
    const known = byName.get(unquote(raw));
    if (known) return known;
    if (raw.startsWith("[")) return add(unquote(raw.slice(1, -1)), unquote(raw.slice(1, -1)), "rectangle").id;
    if (raw.startsWith("(")) return add(unquote(raw.slice(1, -1)), unquote(raw.slice(1, -1)), "ellipse").id;
    if (raw.startsWith(":")) return add(raw.slice(1, -1).trim(), raw.slice(1, -1).trim(), "ellipse").id;
    return add(unquote(raw), unquote(raw), "rectangle").id;
  };

  /** `Name`, `"Label" as alias`, `alias as "Label"`, `[Label] as alias`, with stereotypes and colours dropped. */
  const nameAndAlias = (rest: string, no: number) => {
    const clean = rest
      .replace(/<<[^>]*>>/g, "")
      .replace(/\s#[\w#]+(\s|$)/g, " ")
      .replace(/\s*\[\[.*?\]\]/g, "")
      .trim();
    const m = clean.match(
      /^("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:]+:|[\w.$-]+)(?:\s+as\s+("[^"]+"|[\w.$-]+))?\s*(?::\s*(.*))?$/i,
    );
    if (!m) throw new DiagramSyntaxError(`can't read "${rest}"`, no);
    const strip = (s: string) => unquote(s.replace(/^[[(:]|[\])]$|:$/g, "")).trim();
    const first = strip(m[1]!);
    const second = m[2] ? strip(m[2]) : undefined;
    if (!second) return { id: first, label: first, desc: m[3] };
    // Quoted or bracketed first part is the label; otherwise the second one is.
    return /^["[(:]/.test(m[1]!) ? { id: second, label: first, desc: m[3] } : { id: first, label: second, desc: m[3] };
  };

  for (const { text, no } of lines) {
    const top = stack.at(-1);
    if (top?.kind === "class") {
      if (text === "}") stack.pop();
      else members.set(top.id, [...(members.get(top.id) ?? []), text]);
      continue;
    }
    if (text === "}") {
      if (!stack.length) throw new DiagramSyntaxError('unexpected "}"', no);
      stack.pop();
      continue;
    }
    if (/^left to right direction$/i.test(text)) {
      direction = "right";
      continue;
    }
    if (/^top to bottom direction$/i.test(text)) {
      direction = "down";
      continue;
    }
    if (/^(start|stop|endif|endwhile|repeat|fork|partition)\b|^:.*;$|^(if|while|elseif)\s*\(/i.test(text)) {
      throw new DiagramSyntaxError("activity diagrams are not supported; use a graph or Mermaid flowchart", no);
    }

    const rel = text.match(RELATION);
    if (rel) {
      const [, a, arrow, b, label] = rel;
      // Heads: > and |> point right; <, <|, * (composition) and o (aggregation) point left.
      const bare = arrow!.replace(/\[[^\]]*\]/g, "");
      const leftHead = /^(<\||[<*o])/.test(bare);
      const rightHead = /(\|>|[>*o])$/.test(bare);
      const from = endpoint(a!, false);
      const to = endpoint(b!, true);
      const edge: GraphEdge = leftHead && !rightHead ? { from: to, to: from } : { from, to };
      if (label?.trim()) edge.label = label.trim();
      if (bare.includes(".")) edge.dashed = true;
      if (leftHead && rightHead) edge.arrow = "both";
      if (!leftHead && !rightHead) edge.arrow = "none";
      edges.push(edge);
      continue;
    }

    const decl = text.match(DECL);
    if (decl) {
      const kind = decl[1]!.toLowerCase().replace(/\s+/g, " ");
      const opens = Boolean(decl[3]);
      const { id, label, desc } = nameAndAlias(decl[2]!, no);
      const isClass = /^(class|interface|enum|abstract|abstract class|annotation|object|entity)$/.test(kind);
      if (opens && isClass) {
        add(id, label, "rectangle");
        stack.push({ kind: "class", id });
        continue;
      }
      if (opens && (CONTAINERS.test(kind) || kind === "together")) {
        if (kind === "together") {
          stack.push({ kind: "skip" });
          continue;
        }
        if (groups.some((g) => g.id === id)) throw new DiagramSyntaxError(`"${id}" is defined twice`, no);
        const parent = currentGroup();
        groups.push({ id, label, ...(parent ? { parent } : {}) });
        byName.set(label, id);
        byName.set(id, id);
        stack.push({ kind: "group", id });
        continue;
      }
      if (opens) throw new DiagramSyntaxError(`"${kind}" can't hold other elements here`, no);
      const node = add(id, label, ELEMENT_SHAPES[kind] ?? "rectangle");
      if (desc) node.label = `${label}\n${desc}`;
      continue;
    }

    // [Component] as alias, (Use case) as alias, :Actor: as alias — declared on their own.
    const short = text.match(/^(\[[^\]]+\]|\([^)]+\)|:[^:]+:)(?:\s+as\s+([\w.$-]+))?$/);
    if (short) {
      const { id, label } = nameAndAlias(text, no);
      add(id, label, short[1]!.startsWith("[") ? "rectangle" : "ellipse");
      continue;
    }

    // Name : member (class members, state descriptions)
    const member = text.match(/^("[^"]+"|[\w.$-]+)\s*:\s*(.+)$/);
    if (member) {
      const id = byName.get(unquote(member[1]!)) ?? add(unquote(member[1]!), unquote(member[1]!), "rectangle").id;
      members.set(id, [...(members.get(id) ?? []), member[2]!]);
      continue;
    }
    throw new DiagramSyntaxError(`can't read "${text}"`, no);
  }
  if (stack.length) throw new DiagramSyntaxError('missing "}"', lines.at(-1)?.no);

  for (const [id, list] of members) {
    const node = nodes.get(id);
    if (node) node.label = `${node.label}\n${"─".repeat(Math.max(6, node.label.length))}\n${list.join("\n")}`;
  }
  // A group referenced by an arrow can't be drawn as an arrow end: attach it to its first member.
  const groupIds = new Set(groups.map((g) => g.id));
  const firstMember = (gid: string): string | undefined =>
    [...nodes.values()].find((n) => n.group === gid)?.id ??
    groups
      .filter((g) => g.parent === gid)
      .map((g) => firstMember(g.id))
      .find(Boolean);
  for (const e of edges) {
    if (groupIds.has(e.from)) e.from = firstMember(e.from) ?? e.from;
    if (groupIds.has(e.to)) e.to = firstMember(e.to) ?? e.to;
  }
  if (!nodes.size) throw new DiagramSyntaxError("the diagram has no elements");
  return { direction, nodes: [...nodes.values()], edges, ...(groups.length ? { groups } : {}) };
}

export function parsePlantUml(src: string): PlantUmlResult {
  const lines = contentLines(src);
  if (!lines.length) throw new DiagramSyntaxError("the diagram is empty");
  return isSequence(lines) ? { mermaid: toMermaidSequence(lines) } : { graph: toGraph(lines) };
}
