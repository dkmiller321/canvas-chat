import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A diagram embedded in a document (E4). Stored in Markdown as
 * `![Title](diagram://<artifact id>)` on its own line, so documents stay plain
 * Markdown and always show the diagram's current version. Shared by the editor
 * (which adds a live node view) and the server-side exporters.
 */

export const DIAGRAM_EMBED_RE = /!\[([^\]\n]*)\]\(diagram:\/\/([0-9a-f-]{36})\)/g;

const BLOCK_RE = /^!\[([^\]\n]*)\]\(diagram:\/\/([0-9a-f-]{36})\)[ \t]*(?:\n+|$)/;

export function diagramIds(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(DIAGRAM_EMBED_RE)].map((m) => m[2]!))];
}

export const DiagramEmbedNode = Node.create({
  name: "diagramEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      title: { default: "Diagram" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-diagram-embed]",
        getAttrs: (el) => ({ id: el.getAttribute("data-diagram-embed"), title: el.getAttribute("data-title") }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-diagram-embed": node.attrs.id, "data-title": node.attrs.title }),
    ];
  },

  markdownTokenName: "diagramEmbed",

  markdownTokenizer: {
    name: "diagramEmbed",
    level: "block",
    start: (src: string) => src.search(/!\[[^\]\n]*\]\(diagram:\/\//),
    tokenize: (src: string) => {
      const m = BLOCK_RE.exec(src);
      if (!m) return undefined;
      return { type: "diagramEmbed", raw: m[0], title: m[1], id: m[2] };
    },
  },

  parseMarkdown: (token) => ({ type: "diagramEmbed", attrs: { id: token.id, title: token.title || "Diagram" } }),

  renderMarkdown: (node) =>
    `![${String(node.attrs?.title ?? "Diagram").replace(/[\]\n]/g, " ")}](diagram://${node.attrs?.id})`,
});
