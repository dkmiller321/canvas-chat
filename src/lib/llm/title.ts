export const TITLE_INSTRUCTIONS = `Write a title of at most six words for a conversation that starts with the user's message below.
Reply with the title only: no quotes, no trailing punctuation.`;

export const DEFAULT_TITLE = "New chat";

/**
 * The title from a model's reply. Some models ignore "title only" and go on to
 * answer the message, or wrap the title in Markdown, so keep the first line and
 * strip formatting, quotes, a "Title:" prefix and trailing punctuation.
 */
export function cleanTitle(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return DEFAULT_TITLE;
  const title = line
    .replace(/^#+\s*/, "")
    .replace(/[*_`]+/g, "")
    .replace(/^title\s*:\s*/i, "")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.:!]+$/g, "")
    .trim()
    .slice(0, 80);
  return title || DEFAULT_TITLE;
}
