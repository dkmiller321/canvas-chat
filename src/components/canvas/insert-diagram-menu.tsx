"use client";

import type { Editor } from "@tiptap/react";
import { Shapes } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Insert diagram" in the formatting toolbar (E4): embeds a live diagram from this conversation. */
export function InsertDiagramMenu({
  editor,
  diagrams,
}: {
  editor: Editor | null;
  diagrams: { id: string; title: string }[];
}) {
  const disabled = !editor?.isEditable;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="insert-diagram"
          aria-label="Insert diagram"
          title="Insert diagram"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
        >
          <Shapes />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>Embed a diagram from this chat</DropdownMenuLabel>
        {diagrams.length === 0 ? (
          <DropdownMenuItem disabled>No diagrams yet — ask for one or use New → Diagram</DropdownMenuItem>
        ) : (
          diagrams.map((d) => (
            <DropdownMenuItem
              key={d.id}
              data-testid="insert-diagram-option"
              onSelect={() => editor?.chain().focus().insertContent({ type: "diagramEmbed", attrs: d }).run()}
            >
              <Shapes /> {d.title}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
