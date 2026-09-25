"use client";

import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Sparkles } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { KeepSelection, showKeptSelection } from "./keep-selection";

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
};

function selectionMarkdown(editor: Editor): string | null {
  const { selection } = editor.state;
  if (selection.empty || !editor.markdown) return null;
  const json = { type: "doc", content: selection.content().content.toJSON() as object[] };
  const md = editor.markdown.serialize(json).trim();
  return md || null;
}

export function DocumentEditor({ ref, content, contentKey, editable, onUserChange, onAskAi }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Where the selection sits, relative to the scroll container.
  const [anchor, setAnchor] = useState<{ above: number; below: number; left: number } | null>(null);
  const [asking, setAsking] = useState<{ markdown: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  const editor = useEditor({
    extensions: [StarterKit, TableKit, Markdown, KeepSelection],
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

  return (
    <div ref={wrapRef} className="relative h-full overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
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
  );
}
