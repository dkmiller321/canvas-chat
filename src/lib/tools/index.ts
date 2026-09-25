import { tool } from "ai";
import { addVersion, createArtifact, getArtifact, type ArtifactDto, type ArtifactKind } from "@/lib/artifacts";
import { applyDiagramOps } from "./diagram";
import { ToolError, applyEdits, rewriteSelection } from "./document";
import { parseScene } from "./scene";
import {
  createDiagramInput,
  createDocumentInput,
  editDocumentInput,
  rewriteSelectionInput,
  updateDiagramInput,
} from "./schemas";

/** Tool outputs, as the client sees them in message parts. */
export type CreateDocumentOutput = { artifactId: string; title: string; versionNo: number };
export type EditOutput = { artifactId: string; versionNo: number };
export type CreateDiagramOutput = {
  artifactId: string;
  title: string;
  mermaid?: string;
  elements?: unknown[];
};

async function loadOwned(conversationId: string, artifactId: string, kind: ArtifactKind): Promise<ArtifactDto> {
  const artifact = await getArtifact(artifactId);
  if (!artifact || artifact.conversationId !== conversationId || artifact.kind !== kind) {
    throw new ToolError(`No ${kind} with id ${artifactId} in this conversation.`);
  }
  return artifact;
}

function current(artifact: ArtifactDto): string {
  if (!artifact.currentVersion) throw new ToolError(`"${artifact.title}" has no saved content yet. Try again shortly.`);
  return artifact.currentVersion.content;
}

/** The chat agent's tools, bound to one conversation. */
export function chatTools(conversationId: string) {
  return {
    create_document: tool({
      description: "Create a new Markdown document artifact and open it in the canvas.",
      inputSchema: createDocumentInput,
      execute: async ({ title, markdown }): Promise<CreateDocumentOutput> => {
        const { id, versionNo } = await createArtifact({
          conversationId,
          kind: "document",
          title,
          content: markdown,
          author: "ai",
        });
        return { artifactId: id, title, versionNo };
      },
    }),

    edit_document: tool({
      description:
        "Edit an existing document with exact find/replace pairs. The whole call fails if any find text is not found exactly once.",
      inputSchema: editDocumentInput,
      execute: async ({ artifact_id, edits }): Promise<EditOutput> => {
        const artifact = await loadOwned(conversationId, artifact_id, "document");
        const next = applyEdits(current(artifact), edits);
        const version = await addVersion(artifact.id, next, "ai");
        return { artifactId: artifact.id, versionNo: version.versionNo };
      },
    }),

    create_diagram: tool({
      description:
        "Create a diagram artifact from Mermaid source (preferred) or from Excalidraw element skeletons. It is converted into an editable Excalidraw drawing.",
      inputSchema: createDiagramInput,
      execute: async ({ title, mermaid, elements }): Promise<CreateDiagramOutput> => {
        // Version 1 is saved by the browser after converting (docs/DECISIONS.md #2).
        const { id } = await createArtifact({ conversationId, kind: "diagram", title, content: null, author: "ai" });
        return { artifactId: id, title, ...(mermaid ? { mermaid } : { elements }) };
      },
    }),

    update_diagram: tool({
      description:
        "Change an existing diagram with add/remove/relabel/restyle operations that reference element ids from the element list. Never redraw the whole diagram.",
      inputSchema: updateDiagramInput,
      execute: async ({ artifact_id, operations }): Promise<EditOutput> => {
        const artifact = await loadOwned(conversationId, artifact_id, "diagram");
        const next = applyDiagramOps(parseScene(current(artifact)), operations);
        const version = await addVersion(artifact.id, JSON.stringify(next), "ai");
        return { artifactId: artifact.id, versionNo: version.versionNo };
      },
    }),
  };
}

/** The highlight-to-edit / quick-action tool, bound to one document. */
export function rewriteTools(artifactId: string) {
  return {
    rewrite_selection: tool({
      description: "Replace the selected passage of the document with rewritten Markdown.",
      inputSchema: rewriteSelectionInput,
      execute: async ({ artifact_id, selected_text, replacement }): Promise<EditOutput> => {
        if (artifact_id !== artifactId) throw new ToolError(`Use artifact_id ${artifactId}.`);
        const artifact = await getArtifact(artifactId);
        if (!artifact || artifact.kind !== "document") throw new ToolError("Document not found.");
        const next = rewriteSelection(current(artifact), selected_text, replacement);
        const version = await addVersion(artifactId, next, "ai");
        return { artifactId, versionNo: version.versionNo };
      },
    }),
  };
}
