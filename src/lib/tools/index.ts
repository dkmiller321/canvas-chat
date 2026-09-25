import { tool } from "ai";
import { addVersion, createArtifact, getArtifact, type ArtifactDto, type ArtifactKind } from "@/lib/artifacts";
import { normalizeLanguage } from "@/lib/code-languages";
import { DiagramSyntaxError, parseSource } from "@/lib/diagram-formats";
import { normalizeGraph } from "@/lib/diagram-formats/graph";
import { isFlowchart, parseFlowchart } from "@/lib/diagram-formats/mermaid-flowchart";
import { applyDiagramOps } from "./diagram";
import { ToolError, applyEdits, rewriteSelection } from "./document";
import { parseScene } from "./scene";
import {
  createCodeInput,
  createDiagramInput,
  createDocumentInput,
  editDocumentInput,
  rewriteSelectionInput,
  updateDiagramInput,
  type DiagramOperation,
} from "./schemas";

/** Tool outputs, as the client sees them in message parts. */
export type CreateDocumentOutput = { artifactId: string; title: string; versionNo: number };
export type CreateCodeOutput = { artifactId: string; title: string; language: string; versionNo: number };
export type EditOutput = { artifactId: string; versionNo: number };
export type CreateDiagramOutput = {
  artifactId: string;
  title: string;
  mermaid?: string;
  /** Graph JSON or DOT/PlantUML/D2 source (G10), already checked; the browser draws it. */
  source?: { language: "graph" | "dot" | "plantuml" | "d2"; code: string };
  elements?: unknown[];
};

/** Validate and convert the diagram input before an artifact exists, so bad source fails with a readable error. */
export function diagramContent(input: {
  mermaid?: string;
  graph?: Parameters<typeof normalizeGraph>[0];
  source?: { language: "dot" | "plantuml" | "d2"; code: string };
  elements?: unknown[];
}): Omit<CreateDiagramOutput, "artifactId" | "title"> {
  try {
    if (input.mermaid) {
      // Flowcharts are checked here (other Mermaid types are converted, and can only fail, in the browser).
      if (isFlowchart(input.mermaid)) parseFlowchart(input.mermaid);
      return { mermaid: input.mermaid };
    }
    if (input.graph) {
      normalizeGraph(input.graph);
      return { source: { language: "graph", code: JSON.stringify(input.graph, null, 2) } };
    }
    if (input.source) {
      parseSource(input.source.language, input.source.code);
      return { source: input.source };
    }
    return { elements: input.elements };
  } catch (e) {
    if (e instanceof DiagramSyntaxError)
      throw new ToolError(`Could not read the diagram: ${e.message}. Fix it and call create_diagram again.`);
    throw e;
  }
}

async function loadOwned(conversationId: string, artifactId: string, kinds: ArtifactKind[]): Promise<ArtifactDto> {
  const artifact = await getArtifact(artifactId);
  if (!artifact || artifact.conversationId !== conversationId || !kinds.includes(artifact.kind)) {
    throw new ToolError(`No ${kinds.join(" or ")} with id ${artifactId} in this conversation.`);
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

    create_code: tool({
      description: "Create a new code artifact (a program, script or source file) and open it in the code canvas.",
      inputSchema: createCodeInput,
      execute: async ({ title, language, code }): Promise<CreateCodeOutput> => {
        const lang = normalizeLanguage(language);
        const { id, versionNo } = await createArtifact({
          conversationId,
          kind: "code",
          title,
          content: code,
          author: "ai",
          language: lang,
        });
        return { artifactId: id, title, language: lang, versionNo };
      },
    }),

    edit_document: tool({
      description:
        "Edit an existing document or code artifact with exact find/replace pairs. The whole call fails if any find text is not found exactly once.",
      inputSchema: editDocumentInput,
      execute: async ({ artifact_id, edits }): Promise<EditOutput> => {
        const artifact = await loadOwned(conversationId, artifact_id, ["document", "code"]);
        const next = applyEdits(current(artifact), edits);
        const version = await addVersion(artifact.id, next, "ai");
        return { artifactId: artifact.id, versionNo: version.versionNo };
      },
    }),

    create_diagram: tool({
      description:
        "Create a diagram artifact from exactly one of: Mermaid source, a graph (nodes, edges, groups), Graphviz DOT/PlantUML/D2 source, or Excalidraw element skeletons. It is converted into an editable Excalidraw drawing.",
      inputSchema: createDiagramInput,
      execute: async (input): Promise<CreateDiagramOutput> => {
        const content = diagramContent(input);
        // Version 1 is saved by the browser after converting (docs/DECISIONS.md #2).
        const { id } = await createArtifact({
          conversationId,
          kind: "diagram",
          title: input.title,
          content: null,
          author: "ai",
        });
        return { artifactId: id, title: input.title, ...content };
      },
    }),

    update_diagram: tool({
      description:
        "Change an existing diagram with add/remove/relabel/restyle operations that reference element ids from the element list. Never redraw the whole diagram.",
      inputSchema: updateDiagramInput,
      execute: async ({ artifact_id, operations }): Promise<EditOutput> => {
        const artifact = await loadOwned(conversationId, artifact_id, ["diagram"]);
        const next = applyDiagramOps(parseScene(current(artifact)), operations);
        const version = await addVersion(artifact.id, JSON.stringify(next), "ai");
        return { artifactId: artifact.id, versionNo: version.versionNo };
      },
    }),
  };
}

/**
 * The highlight-to-edit / quick-action tool, bound to one document and its selection
 * (null: the whole document). The model sends only the replacement text.
 */
export function rewriteTools(artifactId: string, selection: string | null) {
  return {
    rewrite_selection: tool({
      description: "Replace the selected passage (or the whole document, if nothing is selected) with rewritten text.",
      inputSchema: rewriteSelectionInput,
      execute: async ({ replacement }): Promise<EditOutput> => {
        const artifact = await getArtifact(artifactId);
        if (!artifact || artifact.kind === "diagram") throw new ToolError("Document not found.");
        const next = selection === null ? replacement : rewriteSelection(current(artifact), selection, replacement);
        const version = await addVersion(artifactId, next, "ai");
        return { artifactId, versionNo: version.versionNo };
      },
    }),
  };
}

/**
 * Operations allowed when the user asked about specific shapes (G6): changes to
 * the selected ids only, plus new elements (which may connect to them).
 */
export function checkSelectionScope(operations: DiagramOperation[], selectedIds: string[]): void {
  const allowed = new Set(selectedIds);
  for (const op of operations) {
    if (op.op === "add") {
      if (op.id) allowed.add(op.id);
      continue;
    }
    if (op.op === "preset") throw new ToolError("Restyle only the selected shapes, not the whole diagram.");
    if (!allowed.has(op.id)) {
      throw new ToolError(`Element ${op.id} is not selected. Only change: ${selectedIds.join(", ")}.`);
    }
  }
}

/** update_diagram restricted to the user's selection, for "Ask AI" on selected shapes. */
export function diagramSelectionTools(artifactId: string, selectedIds: string[]) {
  return {
    update_diagram: tool({
      description:
        "Change the selected shapes with add/remove/relabel/restyle operations. Only the selected ids may be removed, relabelled or restyled.",
      inputSchema: updateDiagramInput,
      execute: async ({ artifact_id, operations }): Promise<EditOutput> => {
        if (artifact_id !== artifactId) throw new ToolError(`Use artifact_id ${artifactId}.`);
        checkSelectionScope(operations, selectedIds);
        const artifact = await getArtifact(artifactId);
        if (!artifact || artifact.kind !== "diagram") throw new ToolError("Diagram not found.");
        const next = applyDiagramOps(parseScene(current(artifact)), operations);
        const version = await addVersion(artifactId, JSON.stringify(next), "ai");
        return { artifactId, versionNo: version.versionNo };
      },
    }),
  };
}
