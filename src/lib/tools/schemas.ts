import { z } from "zod";

/** Input schemas for the agent tools. Shared by the tool definitions, the mock model and the unit tests. */

export const createDocumentInput = z.object({
  title: z.string().min(1).describe("Short document title"),
  markdown: z.string().describe("Full document body in Markdown"),
});

export const editDocumentInput = z.object({
  artifact_id: z.string().describe("Id of the document to edit"),
  edits: z
    .array(
      z.object({
        find: z.string().min(1).describe("Exact text currently in the document, copied verbatim"),
        replace: z.string().describe("Replacement text"),
      }),
    )
    .min(1)
    .describe("Targeted find-and-replace edits, applied in order. Every find must match exactly."),
});

export const rewriteSelectionInput = z.object({
  artifact_id: z.string().describe("Id of the document"),
  selected_text: z.string().min(1).describe("The selected Markdown, copied verbatim from the request"),
  replacement: z.string().describe("Markdown that replaces the selection"),
});

const skeletonElement = z.object({
  type: z.enum(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]),
  id: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional().describe("Text content for type=text"),
  label: z.object({ text: z.string() }).optional().describe("Label inside a shape or on an arrow"),
  start: z.object({ id: z.string() }).optional().describe("Arrow start: id of a shape in this list"),
  end: z.object({ id: z.string() }).optional().describe("Arrow end: id of a shape in this list"),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
});
export type SkeletonElement = z.infer<typeof skeletonElement>;

export const createDiagramInput = z
  .object({
    title: z.string().min(1).describe("Short diagram title"),
    mermaid: z.string().optional().describe("Mermaid source (preferred for flowcharts, sequences and similar)"),
    elements: z.array(skeletonElement).optional().describe("Excalidraw element skeletons, for freeform sketches only"),
  })
  .refine((v) => Boolean(v.mermaid) !== Boolean(v.elements?.length), {
    message: "Provide exactly one of mermaid or elements",
  });

const color = z.string().describe("CSS colour, e.g. #1e1e1e");
const shapeType = z.enum(["rectangle", "ellipse", "diamond", "text", "arrow"]);

export const diagramOperation = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    id: z.string().optional().describe("Temporary id so later operations in this call can refer to the new element"),
    type: shapeType,
    label: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    from: z.string().optional().describe("For arrows: id of the start element"),
    to: z.string().optional().describe("For arrows: id of the end element"),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
  }),
  z.object({ op: z.literal("remove"), id: z.string() }),
  z.object({ op: z.literal("relabel"), id: z.string(), label: z.string() }),
  z.object({
    op: z.literal("restyle"),
    id: z.string(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    strokeWidth: z.number().optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid"]).optional(),
  }),
]);
export type DiagramOperation = z.infer<typeof diagramOperation>;

export const updateDiagramInput = z.object({
  artifact_id: z.string().describe("Id of the diagram to change"),
  operations: z.array(diagramOperation).min(1),
});

export type CreateDocumentInput = z.infer<typeof createDocumentInput>;
export type EditDocumentInput = z.infer<typeof editDocumentInput>;
export type RewriteSelectionInput = z.infer<typeof rewriteSelectionInput>;
export type CreateDiagramInput = z.infer<typeof createDiagramInput>;
export type UpdateDiagramInput = z.infer<typeof updateDiagramInput>;

export const TOOL_NAMES = {
  createDocument: "create_document",
  editDocument: "edit_document",
  rewriteSelection: "rewrite_selection",
  createDiagram: "create_diagram",
  updateDiagram: "update_diagram",
} as const;
