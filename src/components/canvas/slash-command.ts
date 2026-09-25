import { Extension, type Editor, type Range } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";

/** "/" command menu (D10): blocks the Markdown round-trip supports. */

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: "Heading 1",
    hint: "Large section title",
    keywords: ["title", "h1"],
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Section",
    keywords: ["subtitle", "h2"],
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Subsection",
    keywords: ["h3"],
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    hint: "Simple list",
    keywords: ["ul", "unordered", "list"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "Numbered list",
    hint: "Ordered steps",
    keywords: ["ol", "ordered", "list"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Task list",
    hint: "Checklist with checkboxes",
    keywords: ["todo", "checkbox", "checklist"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Callout or citation",
    keywords: ["blockquote"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "Monospaced code",
    keywords: ["pre", "snippet"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    hint: "3 × 3 with a header row",
    keywords: ["grid"],
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Horizontal rule",
    keywords: ["hr", "line", "separator"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
];

export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q) || i.keywords.some((k) => k.includes(q)));
}

/** What the React menu renders; null when closed. */
export type SlashMenuState = {
  items: SlashItem[];
  selected: number;
  rect: DOMRect | null;
  choose: (item: SlashItem) => void;
} | null;

type Options = {
  /** Items offered, e.g. extended with "Diagram" when the conversation has diagrams. */
  getItems: () => SlashItem[];
  onState: (state: SlashMenuState) => void;
};

const key = new PluginKey("slashCommand");

export const SlashCommand = Extension.create<Options>({
  name: "slashCommand",

  addOptions() {
    return { getItems: () => SLASH_ITEMS, onState: () => {} };
  },

  addProseMirrorPlugins() {
    const { onState, getItems } = this.options;
    let current: { props: SuggestionProps<SlashItem>; selected: number } | null = null;

    const publish = () => {
      if (!current) return onState(null);
      const { props, selected } = current;
      onState({
        items: props.items,
        selected,
        rect: props.clientRect?.() ?? null,
        choose: (item) => props.command(item),
      });
    };

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: key,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query, getItems()),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => {
            current = { props, selected: 0 };
            publish();
          },
          onUpdate: (props) => {
            current = { props, selected: Math.min(current?.selected ?? 0, Math.max(props.items.length - 1, 0)) };
            publish();
          },
          onKeyDown: ({ event }) => {
            if (!current) return false;
            const count = current.props.items.length;
            if (event.key === "Escape") {
              current = null;
              publish();
              return true;
            }
            if (count === 0) return false;
            if (event.key === "ArrowDown") {
              current.selected = (current.selected + 1) % count;
              publish();
              return true;
            }
            if (event.key === "ArrowUp") {
              current.selected = (current.selected - 1 + count) % count;
              publish();
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const item = current.props.items[current.selected];
              if (item) current.props.command(item);
              return true;
            }
            return false;
          },
          onExit: () => {
            current = null;
            publish();
          },
        }),
      }),
    ];
  },
});
