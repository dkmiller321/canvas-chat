import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { DiagramEmbedNode } from "@/lib/diagram-embed";

// The same extensions as the editor, so exports read Markdown exactly as the canvas does.
let manager: MarkdownManager | undefined;

export function parseMarkdown(markdown: string): JSONContent {
  manager ??= new MarkdownManager({
    extensions: [StarterKit, TableKit, TaskList, TaskItem.configure({ nested: true }), DiagramEmbedNode],
  });
  return manager.parse(markdown);
}
