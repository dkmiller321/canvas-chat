"use client";

import { Markdown } from "@tiptap/markdown";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, type Editor, type Range } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Sparkles } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormatToolbar } from "./format-toolbar";
import { KeepSelection, showKeptSelection } from "./keep-selection";
import { SlashCommand, type SlashMenuState } from "./slash-command";
import { SyncSelectionOnKey } from "./sync-selection";
import { DiagramEmbed } from "./diagram-embed-view";
import { InsertDiagramMenu } from "./insert-diagram-menu";
import { SLASH_ITEMS, type SlashItem } from "./slash-command";

export type DocumentEditorHandle = {
  /** Markdown of the current selection, or null when nothing is selected. */
  selectionMarkdown: () => string | null;
};

type Props = {
  ref?: Ref<DocumentEditorHandle>;
  content: string;
  /** Changing this replaces the editor content with `content` (new version, version switch). */
  contentKey: string;
  editable: boolean;
  /** Called on every user edit; serialise lazily (debounced) because large documents are slow to convert. */
  onUserChange: (getMarkdown: () => string) => void;
  onAskAi: (selectedMarkdown: string, instruction: string) => void;
  /** Outline rail: "auto" shows it when the canvas is wide enough. */
  outline: "auto" | "show" | "hide";
  onWordCount: (words: number) => void;
  /** Diagrams in this conversation, offered by "Insert diagram" and the slash menu (E4). */
  diagrams: { id: string; title: string }[];
};

type Heading = { level: number; text: string; pos: number };
type DocInfo = { headings: Heading[]; words: number };

/** Outline and word count (D12), recomputed when the document changes. */
function docInfo(editor: Editor): DocInfo {
  const headings: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") headings.push({ level: Number(node.attrs.level), text: node.textContent, pos });
    return node.type.name !== "heading";
  });
  const words = editor.getText({ blockSeparator: " " }).split(/\s+/).filter(Boolean).length;
  return { headings, words };
}

function selectionMarkdown(editor: Editor): string | null {
  const { selection } = editor.state;
  if (selection.empty || !editor.markdown) return null;
  const json = { type: "doc", content: selection.content().content.toJSON() as object[] };
  const md = editor.markdown.serialize(json).trim();
  return md || null;
}

export function DocumentEditor({
  ref,
  content,
  contentKey,
  editable,
  onUserChange,
  onAskAi,
  outline,
  onWordCount,
  diagrams,
}: Props) {
  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;
  const wrapRef = useRef<HTMLDivElement>(null);
  // Where the selection sits, relative to the scroll container.
  const [anchor, setAnchor] = useState<{ above: number; below: number; left: number } | null>(null);
  const [asking, setAsking] = useState<{ markdown: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;
  const [info, setInfo] = useState<DocInfo>({ headings: [], words: 0 });
  const onWordCountRef = useRef(onWordCount);
  onWordCountRef.current = onWordCount;
  useEffect(() => onWordCountRef.current(info.words), [info.words]);
  const [slash, setSlash] = useState<SlashMenuState>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      KeepSelection,
      SyncSelectionOnKey,
      DiagramEmbed,
      SlashCommand.configure({
        onState: setSlash,
        getItems: (): SlashItem[] => [
          ...SLASH_ITEMS,
          ...diagramsRef.current.map((d) => ({
            id: `diagram-${d.id}`,
            label: `Diagram: ${d.title}`,
            hint: "Embed a live diagram",
            keywords: ["diagram", "drawing", "figure", d.title.toLowerCase()],
            run: (e: Editor, r: Range) =>
              e.chain().focus().deleteRange(r).insertContent({ type: "diagramEmbed", attrs: d }).run(),
          })),
        ],
      }),
    ],
    content,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "data-testid": "doc-editor",
        "aria-label": "Document",
        class: "doc-prose min-h-full px-10 pt-10 pb-32 outline-none focus-visible:outline-none",
      },
    },
    onCreate: ({ editor }) => setInfo(docInfo(editor)),
    onTransaction: ({ editor, transaction }) => {
      if (transaction.docChanged) setInfo(docInfo(editor));
    },
    onUpdate: ({ editor }) => onUserChangeRef.current(() => editor.getMarkdown()),
    onSelectionUpdate: ({ editor }) => {
      const wrap = wrapRef.current;
      if (!wrap || !editor.isEditable || editor.state.selection.empty) {
        setAnchor(null);
        return;
      }
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const box = wrap.getBoundingClientRect();
      setAnchor({
        above: start.top - box.top + wrap.scrollTop - 44,
        below: end.bottom - box.top + wrap.scrollTop + 8,
        left: Math.max(8, Math.min(start.left - box.left, box.width - 380)),
      });
    },
  });

  useImperativeHandle(ref, () => ({ selectionMarkdown: () => (editor ? selectionMarkdown(editor) : null) }), [editor]);

  function closeAsk() {
    setAsking(null);
    setInstruction("");
    if (editor) showKeptSelection(editor, null);
  }

  // Replace content only when the version shown changes, never on every keystroke.
  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (!editor || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    editor.commands.setContent(content, { contentType: "markdown", emitUpdate: false });
    setAnchor(null);
    setAsking(null);
  }, [editor, content, contentKey]);

  useEffect(() => {
    editor?.setEditable(editable, false);
    if (!editable) {
      setAnchor(null);
      setAsking(null);
    }
  }, [editor, editable]);

  function submitAsk() {
    if (!asking || !instruction.trim()) return;
    onAskAi(asking.markdown, instruction.trim());
    closeAsk();
    setAnchor(null);
  }

  const wrapBox = wrapRef.current?.getBoundingClientRect();

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Remount once the editor exists: useEditorState subscribes on mount. */}
        <FormatToolbar
          key={editor ? "ready" : "loading"}
          editor={editor}
          extra={<InsertDiagramMenu editor={editor} diagrams={diagrams} />}
        />
        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} className="h-full" />
          {slash && slash.rect && wrapBox && (
            <div
              data-testid="slash-menu"
              role="listbox"
              aria-label="Insert block"
              className="absolute z-20 w-64 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl"
              style={{
                top: slash.rect.bottom - wrapBox.top + (wrapRef.current?.scrollTop ?? 0) + 6,
                left: Math.min(slash.rect.left - wrapBox.left, wrapBox.width - 272),
              }}
            >
              {slash.items.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching blocks</p>
              ) : (
                slash.items.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={i === slash.selected}
                    data-testid="slash-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => slash.choose(item)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2 py-1.5 text-left",
                      i === slash.selected ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {anchor && asking && (
            <form
              className="absolute z-10 flex w-[360px] items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-xl ring-1 ring-black/5"
              style={{ top: anchor.below, left: anchor.left }}
              onSubmit={(e) => {
                e.preventDefault();
                submitAsk();
              }}
            >
              <Sparkles className="ml-1.5 size-4 shrink-0 text-ai" aria-hidden />
              <input
                data-testid="ask-ai-input"
                aria-label="Ask AI about the selection"
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeAsk();
                }}
                placeholder="Rewrite, shorten, expand…"
                className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none"
              />
              <Button data-testid="ask-ai-submit" type="submit" size="sm" disabled={!instruction.trim()}>
                Apply
              </Button>
            </form>
          )}
          {anchor && !asking && (
            <Button
              data-testid="ask-ai-button"
              size="sm"
              variant="outline"
              className="absolute z-10 rounded-full bg-popover shadow-md"
              style={{ top: anchor.above, left: anchor.left }}
              // Keep the editor selection when the button takes the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const md = editor ? selectionMarkdown(editor) : null;
                if (!editor || !md) return;
                const { from, to } = editor.state.selection;
                showKeptSelection(editor, { from, to });
                setAsking({ markdown: md });
              }}
            >
              <Sparkles className="text-ai" /> Ask AI
            </Button>
          )}
        </div>
      </div>
      <aside
        aria-label="Document outline"
        className={cn(
          "w-52 shrink-0 flex-col gap-3 overflow-y-auto border-l px-4 pt-10 pb-6 text-sm",
          outline === "show" ? "flex" : outline === "hide" ? "hidden" : "hidden @4xl:flex",
        )}
      >
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">On this page</p>
        <nav data-testid="doc-outline" className="flex flex-col gap-0.5">
          {info.headings.length === 0 && <span className="text-muted-foreground">No headings yet</span>}
          {info.headings.map((h) => (
            <button
              key={h.pos}
              type="button"
              onClick={() => {
                const dom = editor?.view.nodeDOM(h.pos);
                if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="truncate rounded px-1.5 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              style={{ paddingLeft: `${(h.level - 1) * 12 + 6}px` }}
            >
              {h.text || "Untitled heading"}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
