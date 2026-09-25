/** Pure document tools: (input, current Markdown) → new Markdown. Route handlers only persist the result. */

export class ToolError extends Error {}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
}

function snippet(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Apply exact-match find/replace edits in order (PRD D4). All or nothing: if any
 * `find` is missing or ambiguous, throw and leave the document untouched, so the
 * model can retry with the error text.
 */
export function applyEdits(markdown: string, edits: { find: string; replace: string }[]): string {
  let out = markdown;
  edits.forEach(({ find, replace }, i) => {
    const n = occurrences(out, find);
    if (n === 0) {
      throw new ToolError(
        `Edit ${i + 1} failed: the text "${snippet(find)}" was not found in the current document. Copy the find text exactly from the current content.`,
      );
    }
    if (n > 1) {
      throw new ToolError(
        `Edit ${i + 1} failed: the text "${snippet(find)}" appears ${n} times. Include more surrounding text so it matches once.`,
      );
    }
    const at = out.indexOf(find);
    out = out.slice(0, at) + replace + out.slice(at + find.length);
  });
  return out;
}

/**
 * Replace the selected Markdown with the model's rewrite (PRD D5/D6). A selection
 * equal to the whole document replaces the whole body. When the passage appears
 * more than once, the first occurrence is replaced.
 */
export function rewriteSelection(markdown: string, selected: string, replacement: string): string {
  const sel = selected.trim();
  if (!sel) throw new ToolError("The selection is empty.");
  if (sel === markdown.trim()) return replacement;
  const at = markdown.indexOf(sel);
  if (at === -1) {
    throw new ToolError(`The selected text "${snippet(sel)}" was not found in the saved document.`);
  }
  return markdown.slice(0, at) + replacement.trim() + markdown.slice(at + sel.length);
}
