import type { ElementSummary } from "@/lib/tools/scene";

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

/** Code quick actions (Open Canvas parity, D8). */
export const CODE_QUICK_ACTIONS = [
  {
    id: "comments",
    label: "Add comments",
    instruction: "Add concise comments explaining the code. Change nothing else.",
  },
  { id: "logs", label: "Add logging", instruction: "Add useful logging statements. Change nothing else." },
  { id: "fix-bugs", label: "Fix bugs", instruction: "Find and fix bugs. Keep the behaviour otherwise the same." },
  { id: "optimize", label: "Optimise", instruction: "Improve performance and readability without changing behaviour." },
  { id: "port-python", label: "Port to Python", instruction: "Rewrite this code in idiomatic Python." },
  { id: "port-typescript", label: "Port to TypeScript", instruction: "Rewrite this code in idiomatic TypeScript." },
] as const;

export type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"] | (typeof CODE_QUICK_ACTIONS)[number]["id"];

export function quickActionInstruction(id: QuickActionId): string {
  const action = [...QUICK_ACTIONS, ...CODE_QUICK_ACTIONS].find((a) => a.id === id);
  if (!action) throw new Error(`Unknown quick action ${id}`);
  return `quick:${action.id} — ${action.instruction}`;
}

/** Message format for "Ask AI" on selected diagram shapes (G6). */

export type DiagramRewriteRequest = {
  artifactId: string;
  instruction: string;
  selectedIds: string[];
  elements: ElementSummary[];
};

export const DIAGRAM_REWRITE_INSTRUCTIONS = `You change the selected shapes of an Excalidraw diagram.
Call update_diagram exactly once. Remove, relabel or restyle only the selected ids; you may add new elements connected to them.
Element ids and positions are in the element list.`;

export function buildDiagramRewriteMessage(r: DiagramRewriteRequest): string {
  return [
    `Diagram id: ${r.artifactId}`,
    `Selected ids: ${r.selectedIds.join(", ")}`,
    `Instruction: ${r.instruction}`,
    `<elements>\n${JSON.stringify(r.elements)}\n</elements>`,
  ].join("\n\n");
}

export function parseDiagramRewriteMessage(text: string): DiagramRewriteRequest | null {
  const artifactId = text.match(/^Diagram id: (.+)$/m)?.[1];
  const selected = text.match(/^Selected ids: (.*)$/m)?.[1];
  const instruction = text.match(/^Instruction: (.+)$/m)?.[1];
  const elements = text.match(/<elements>\n([\s\S]*?)\n<\/elements>/)?.[1];
  if (!artifactId || selected === undefined || !instruction || elements === undefined) return null;
  return {
    artifactId,
    instruction,
    selectedIds: selected
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    elements: JSON.parse(elements) as ElementSummary[],
  };
}
