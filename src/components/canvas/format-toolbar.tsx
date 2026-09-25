"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  SquareCode,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToolProps = {
  testId: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: ReactNode;
};

function Tool({ testId, label, active, disabled, onRun, children }: ToolProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection: the click must not move focus first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;

/** Formatting toolbar (D10) and, while the cursor is in a table, table controls (D11). */
export function FormatToolbar({ editor, extra }: { editor: Editor | null; extra?: ReactNode }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            editable: e.isEditable,
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            link: e.isActive("link"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            paragraph: e.isActive("paragraph"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            task: e.isActive("taskList"),
            quote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            table: e.isActive("table"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  if (!editor || !s) return null;
  const off = !s.editable;
  const chain = () => editor.chain().focus();

  function applyLink() {
    const href = (linkDraft ?? "").trim();
    if (href) chain().extendMarkRange("link").setLink({ href }).run();
    else chain().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
  }

  return (
    <div className="shrink-0 border-b bg-background/95">
      <div
        data-testid="format-toolbar"
        role="toolbar"
        aria-label="Formatting"
        className="flex items-center gap-0.5 overflow-x-auto px-4 py-1.5"
      >
        <Tool testId="format-undo" label="Undo" disabled={off || !s.canUndo} onRun={() => chain().undo().run()}>
          <Undo2 />
        </Tool>
        <Tool testId="format-redo" label="Redo" disabled={off || !s.canRedo} onRun={() => chain().redo().run()}>
          <Redo2 />
        </Tool>
        <Divider />
        <Tool
          testId="format-paragraph"
          label="Text"
          active={s.paragraph}
          disabled={off}
          onRun={() => chain().setParagraph().run()}
        >
          <Pilcrow />
        </Tool>
        <Tool
          testId="format-h1"
          label="Heading 1"
          active={s.h1}
          disabled={off}
          onRun={() => chain().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 />
        </Tool>
        <Tool
          testId="format-h2"
          label="Heading 2"
          active={s.h2}
          disabled={off}
          onRun={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 />
        </Tool>
        <Tool
          testId="format-h3"
          label="Heading 3"
          active={s.h3}
          disabled={off}
          onRun={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 />
        </Tool>
        <Divider />
        <Tool testId="format-bold" label="Bold" active={s.bold} disabled={off} onRun={() => chain().toggleBold().run()}>
          <Bold />
        </Tool>
        <Tool
          testId="format-italic"
          label="Italic"
          active={s.italic}
          disabled={off}
          onRun={() => chain().toggleItalic().run()}
        >
          <Italic />
        </Tool>
        <Tool
          testId="format-strike"
          label="Strikethrough"
          active={s.strike}
          disabled={off}
          onRun={() => chain().toggleStrike().run()}
        >
          <Strikethrough />
        </Tool>
        <Tool
          testId="format-code"
          label="Inline code"
          active={s.code}
          disabled={off}
          onRun={() => chain().toggleCode().run()}
        >
          <Code />
        </Tool>
        <Tool
          testId="format-link"
          label="Link"
          active={s.link || linkDraft !== null}
          disabled={off}
          onRun={() =>
            setLinkDraft(linkDraft === null ? ((editor.getAttributes("link").href as string | undefined) ?? "") : null)
          }
        >
          <Link2 />
        </Tool>
        <Divider />
        <Tool
          testId="format-bullet-list"
          label="Bulleted list"
          active={s.bullet}
          disabled={off}
          onRun={() => chain().toggleBulletList().run()}
        >
          <List />
        </Tool>
        <Tool
          testId="format-ordered-list"
          label="Numbered list"
          active={s.ordered}
          disabled={off}
          onRun={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered />
        </Tool>
        <Tool
          testId="format-task-list"
          label="Task list"
          active={s.task}
          disabled={off}
          onRun={() => chain().toggleTaskList().run()}
        >
          <ListChecks />
        </Tool>
        <Tool
          testId="format-quote"
          label="Quote"
          active={s.quote}
          disabled={off}
          onRun={() => chain().toggleBlockquote().run()}
        >
          <Quote />
        </Tool>
        <Tool
          testId="format-code-block"
          label="Code block"
          active={s.codeBlock}
          disabled={off}
          onRun={() => chain().toggleCodeBlock().run()}
        >
          <SquareCode />
        </Tool>
        <Tool
          testId="insert-table"
          label="Insert table"
          disabled={off || s.table}
          onRun={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table2 />
        </Tool>
        {extra}
      </div>

      {linkDraft !== null && (
        <form
          className="flex items-center gap-2 border-t px-4 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          <input
            aria-label="Link URL"
            autoFocus
            value={linkDraft}
            placeholder="https://… (empty removes the link)"
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLinkDraft(null);
            }}
            className="h-7 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent">
            Apply
          </button>
        </form>
      )}

      {s.table && !off && (
        <div
          data-testid="table-toolbar"
          role="toolbar"
          aria-label="Table"
          className="flex items-center gap-0.5 border-t bg-muted/40 px-4 py-1 text-xs text-muted-foreground"
        >
          <span className="mr-1 font-medium">Table</span>
          <Tool testId="table-add-row" label="Add row below" onRun={() => chain().addRowAfter().run()}>
            <Rows3 />
          </Tool>
          <Tool testId="table-delete-row" label="Delete row" onRun={() => chain().deleteRow().run()}>
            <Rows3 className="text-destructive" />
          </Tool>
          <Tool testId="table-add-column" label="Add column to the right" onRun={() => chain().addColumnAfter().run()}>
            <Columns3 />
          </Tool>
          <Tool testId="table-delete-column" label="Delete column" onRun={() => chain().deleteColumn().run()}>
            <Columns3 className="text-destructive" />
          </Tool>
          <Divider />
          <Tool testId="table-delete" label="Delete table" onRun={() => chain().deleteTable().run()}>
            <Trash2 />
          </Tool>
        </div>
      )}
    </div>
  );
}
