/** Message format for highlight-to-edit and quick actions (rewrite_selection). */

export type RewriteRequest = { artifactId: string; instruction: string; selectedText: string; document: string };

export const REWRITE_INSTRUCTIONS = `You edit one selected passage of a Markdown document.
Call rewrite_selection exactly once. Copy selected_text verbatim from the request and put the rewritten Markdown in replacement.
Change only the selection, following the instruction. Keep Markdown formatting.`;

export function buildRewriteMessage(r: RewriteRequest): string {
  return [
    `Document id: ${r.artifactId}`,
    `Instruction: ${r.instruction}`,
    `<selection>\n${r.selectedText}\n</selection>`,
    `<document>\n${r.document}\n</document>`,
  ].join("\n\n");
}

export function parseRewriteMessage(text: string): RewriteRequest | null {
  const artifactId = text.match(/^Document id: (.+)$/m)?.[1];
  const instruction = text.match(/^Instruction: (.+)$/m)?.[1];
  const selectedText = text.match(/<selection>\n([\s\S]*?)\n<\/selection>/)?.[1];
  const document = text.match(/<document>\n([\s\S]*?)\n<\/document>/)?.[1];
  if (!artifactId || !instruction || selectedText === undefined || document === undefined) return null;
  return { artifactId, instruction, selectedText, document };
}

/** Quick actions (D6). The `quick:<id>` prefix is what the mock model matches on. */
export const QUICK_ACTIONS = [
  { id: "shorter", label: "Make shorter", instruction: "Make it shorter while keeping the key points." },
  { id: "longer", label: "Make longer", instruction: "Expand it with more detail." },
  { id: "simpler", label: "Simpler reading level", instruction: "Rewrite it at a simpler reading level." },
  { id: "advanced", label: "Advanced reading level", instruction: "Rewrite it at a more advanced reading level." },
  { id: "formal", label: "More formal", instruction: "Rewrite it in a more formal tone." },
  { id: "casual", label: "More casual", instruction: "Rewrite it in a more casual tone." },
  { id: "emoji", label: "Add emoji", instruction: "Add fitting emoji without changing the wording." },
  { id: "grammar", label: "Fix grammar", instruction: "Fix spelling and grammar only." },
  { id: "translate-es", label: "Translate to Spanish", instruction: "Translate it into Spanish." },
  { id: "translate-fr", label: "Translate to French", instruction: "Translate it into French." },
] as const;

export type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

export function quickActionInstruction(id: QuickActionId): string {
  const action = QUICK_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`Unknown quick action ${id}`);
  return `quick:${action.id} — ${action.instruction}`;
}
