"use client";

import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Sparkles } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";

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
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [asking, setAsking] = useState<{ markdown: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  const editor = useEditor({
    extensions: [StarterKit, TableKit, Markdown],
    content,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "data-testid": "doc-editor",
        "aria-label": "Document",
        class: "doc-prose min-h-full px-8 py-6 outline-none focus-visible:outline-none",
      },
    },
    onUpdate: ({ editor }) => onUserChangeRef.current(() => editor.getMarkdown()),
    onSelectionUpdate: ({ editor }) => {
      const wrap = wrapRef.current;
      if (!wrap || !editor.isEditable || editor.state.selection.empty) {
        setToolbar(null);
        return;
      }
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const box = wrap.getBoundingClientRect();
      setToolbar({
        top: Math.max(start.top, 0) - box.top + wrap.scrollTop - 40,
        left: Math.min((start.left + end.left) / 2, box.right - 60) - box.left,
      });
    },
  });

  useImperativeHandle(ref, () => ({ selectionMarkdown: () => (editor ? selectionMarkdown(editor) : null) }), [editor]);

  // Replace content only when the version shown changes, never on every keystroke.
  const shownKey = useRef(contentKey);
  useEffect(() => {
    if (!editor || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    editor.commands.setContent(content, { contentType: "markdown", emitUpdate: false });
    setToolbar(null);
    setAsking(null);
  }, [editor, content, contentKey]);

  useEffect(() => {
    editor?.setEditable(editable, false);
    if (!editable) {
      setToolbar(null);
      setAsking(null);
    }
  }, [editor, editable]);

  function submitAsk() {
    if (!asking || !instruction.trim()) return;
    onAskAi(asking.markdown, instruction.trim());
    setAsking(null);
    setToolbar(null);
    setInstruction("");
  }

  return (
    <div ref={wrapRef} className="relative h-full overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
      {toolbar && (
        <div className="absolute z-10" style={{ top: toolbar.top, left: toolbar.left }}>
          {asking ? (
            <form
              className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
              onSubmit={(e) => {
                e.preventDefault();
                submitAsk();
              }}
            >
              <input
                data-testid="ask-ai-input"
                aria-label="Ask AI about the selection"
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAsking(null);
                }}
                placeholder="Rewrite, shorten, expand…"
                className="h-8 w-64 rounded-md bg-transparent px-2 text-sm outline-none"
              />
              <Button data-testid="ask-ai-submit" type="submit" size="sm" disabled={!instruction.trim()}>
                Apply
              </Button>
            </form>
          ) : (
            <Button
              data-testid="ask-ai-button"
              size="sm"
              variant="outline"
              className="bg-popover shadow-md"
              // Keep the editor selection when the button takes the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const md = editor ? selectionMarkdown(editor) : null;
                if (md) setAsking({ markdown: md });
              }}
            >
              <Sparkles /> Ask AI
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
