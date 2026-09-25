import type { ElementSummary } from "@/lib/tools/scene";

/** Artifact state included in the model's instructions on every turn (PRD A5). */

export type ArtifactListing = { id: string; kind: "document" | "diagram"; title: string; version: number };

export type OpenArtifact =
  | (ArtifactListing & { kind: "document"; content: string })
  | (ArtifactListing & { kind: "diagram"; elements: ElementSummary[] });

export type ArtifactContext = { artifacts: ArtifactListing[]; open: OpenArtifact | null };

const BASE_INSTRUCTIONS = `You are Canvas Chat, an assistant that writes documents and diagrams beside the conversation.

- When the user asks for a document (plan, spec, essay, notes…), call create_document instead of pasting it into the chat.
- To change an existing document, call edit_document with small exact find/replace edits copied verbatim from the current content. Never rewrite the whole document to change one part.
- When the user asks for a diagram, call create_diagram with Mermaid source. Use element skeletons only for freeform sketches.
- To change an existing diagram, call update_diagram with operations that reference element ids from the element list below. Do not redraw it.
- The content below is the current state, including the user's manual edits. Always work from it.
- After a tool call, reply with one short sentence.`;

export function buildInstructions(ctx: ArtifactContext): string {
  return [
    BASE_INSTRUCTIONS,
    `<artifacts>\n${JSON.stringify(ctx.artifacts)}\n</artifacts>`,
    `<open_artifact>\n${JSON.stringify(ctx.open)}\n</open_artifact>`,
  ].join("\n\n");
}

/** Inverse of buildInstructions; used by the mock model, which reads the same context a real model gets. */
export function parseArtifactContext(instructions: string): ArtifactContext {
  const grab = (tag: string) => instructions.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`))?.[1];
  const artifacts = grab("artifacts");
  const open = grab("open_artifact");
  return {
    artifacts: artifacts ? (JSON.parse(artifacts) as ArtifactListing[]) : [],
    open: open ? (JSON.parse(open) as OpenArtifact | null) : null,
  };
}
