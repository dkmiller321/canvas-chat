import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import type { DiagramImage } from "./diagram-images";
import { parseMarkdown } from "./markdown";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const MONO = "Consolas";

function runs(nodes: JSONContent[] | undefined): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    const run = new TextRun({
      text: node.text,
      bold: marks.has("bold"),
      italics: marks.has("italic"),
      strike: marks.has("strike"),
      underline: marks.has("underline") ? {} : undefined,
      font: marks.has("code") ? MONO : undefined,
      style: marks.has("link") ? "Hyperlink" : undefined,
    });
    const link = node.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
    out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
  }
  return out;
}

type ListCtx = { kind: "bullet" | "ordered"; level: number; instance: number };

// Largest diagram size on an A4 page with default margins, in pixels at 96 dpi.
const MAX_IMAGE_WIDTH = 600;

class Converter {
  private orderedInstances = 0;

  constructor(private diagrams: Map<string, DiagramImage>) {}

  blocks(nodes: JSONContent[] | undefined, list?: ListCtx, indent = 0): (Paragraph | Table)[] {
    return (nodes ?? []).flatMap((n) => this.block(n, list, indent));
  }

  private block(node: JSONContent, list: ListCtx | undefined, indent: number): (Paragraph | Table)[] {
    const indentProp = indent ? { indent: { left: indent } } : {};
    switch (node.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6) - 1;
        return [new Paragraph({ heading: HEADINGS[level], children: runs(node.content) })];
      }
      case "paragraph":
        return [
          new Paragraph({
            children: runs(node.content),
            ...indentProp,
            ...(list &&
              (list.kind === "bullet"
                ? { bullet: { level: list.level } }
                : { numbering: { reference: "ordered", level: list.level, instance: list.instance } })),
          }),
        ];
      case "bulletList":
      case "orderedList": {
        const kind = node.type === "bulletList" ? "bullet" : "ordered";
        const level = list ? list.level + 1 : 0;
        const instance = kind === "ordered" ? ++this.orderedInstances : 0;
        return (node.content ?? []).flatMap((item) => {
          const [first, ...rest] = item.content ?? [];
          const ctx: ListCtx = { kind, level, instance };
          return [
            ...(first ? this.block(first, ctx, indent) : []),
            // Continuation paragraphs and nested lists inside the item.
            ...rest.flatMap((child) =>
              child.type === "bulletList" || child.type === "orderedList"
                ? this.block(child, ctx, indent)
                : this.block(child, undefined, indent + 720 * (level + 1)),
            ),
          ];
        });
      }
      case "codeBlock": {
        const text = (node.content ?? []).map((t) => t.text ?? "").join("");
        return text.split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line || " ", font: MONO, size: 20 })],
              shading: { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" },
              spacing: { before: 0, after: 0 },
              ...indentProp,
            }),
        );
      }
      case "blockquote":
        return this.blocks(node.content, undefined, indent + 720);
      case "horizontalRule":
        return [
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
          }),
        ];
      case "table":
        return [this.table(node)];
      case "taskList":
        return (node.content ?? []).flatMap((item) => {
          const [first, ...rest] = item.content ?? [];
          const box = new TextRun({ text: item.attrs?.checked ? "☑ " : "☐ " });
          return [
            new Paragraph({ children: [box, ...runs(first?.content)], ...indentProp }),
            ...rest.flatMap((child) => this.block(child, undefined, indent + 360)),
          ];
        });
      case "diagramEmbed": {
        const title = String(node.attrs?.title ?? "Diagram");
        const image = this.diagrams.get(String(node.attrs?.id));
        if (!image) return [new Paragraph({ children: [new TextRun({ text: `[Diagram: ${title}]`, italics: true })] })];
        // Screenshots are taken at 2x; scale to fit the page width.
        const scale = Math.min(1, MAX_IMAGE_WIDTH / image.width);
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: "png",
                data: image.png,
                transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
                altText: { name: title, title, description: title },
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title, size: 18, color: "57606A" })],
          }),
        ];
      }
      default:
        return node.content ? this.blocks(node.content, list, indent) : [];
    }
  }

  private table(node: JSONContent): Table {
    const rows = (node.content ?? []).map(
      (row) =>
        new TableRow({
          children: (row.content ?? []).map(
            (cell) =>
              new TableCell({
                children: (() => {
                  const inner = this.blocks(cell.content).filter((b): b is Paragraph => b instanceof Paragraph);
                  return inner.length > 0 ? inner : [new Paragraph("")];
                })(),
                shading:
                  cell.type === "tableHeader" ? { type: ShadingType.CLEAR, fill: "E5E7EB", color: "auto" } : undefined,
              }),
          ),
        }),
    );
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }
}

export async function markdownToDocx(
  markdown: string,
  title: string,
  diagrams = new Map<string, DiagramImage>(),
): Promise<Buffer> {
  const doc = parseMarkdown(markdown);
  const document = new Document({
    title,
    creator: "Canvas Chat",
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: [0, 1, 2, 3, 4].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: new Converter(diagrams).blocks(doc.content) }],
  });
  return Packer.toBuffer(document);
}
