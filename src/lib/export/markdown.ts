import { TableKit } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";

// The same extensions as the editor, so exports read Markdown exactly as the canvas does.
let manager: MarkdownManager | undefined;

export function parseMarkdown(markdown: string): JSONContent {
  manager ??= new MarkdownManager({ extensions: [StarterKit, TableKit] });
  return manager.parse(markdown);
}
