import { z } from "zod";
import { getArtifact } from "@/lib/artifacts";
import { markdownToDocx } from "@/lib/export/docx";
import { markdownToPdf } from "@/lib/export/pdf";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORMATS = {
  md: { type: "text/markdown; charset=utf-8", ext: "md" },
  pdf: { type: "application/pdf", ext: "pdf" },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
} as const;

/** Document exports (E1, E2). Diagram exports run in the browser with Excalidraw's own exporters (E3). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const format = z.enum(["md", "pdf", "docx"]).safeParse(new URL(req.url).searchParams.get("format"));
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact || artifact.kind !== "document" || !artifact.currentVersion) {
    return new Response("Not found", { status: 404 });
  }
  if (!format.success) return Response.json({ error: "format must be md, pdf or docx" }, { status: 400 });

  const markdown = artifact.currentVersion.content;
  const body =
    format.data === "md"
      ? markdown
      : format.data === "pdf"
        ? await markdownToPdf(markdown, artifact.title)
        : await markdownToDocx(markdown, artifact.title);
  const { type, ext } = FORMATS[format.data];
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${slugify(artifact.title)}.${ext}"`,
      "cache-control": "no-store",
    },
  });
}
