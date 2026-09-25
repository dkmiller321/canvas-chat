import { z } from "zod";
import { getArtifact } from "@/lib/artifacts";
import { markdownToDocx } from "@/lib/export/docx";
import { markdownToPdf } from "@/lib/export/pdf";
import { languageExtension } from "@/lib/code-languages";
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
  const format = z.enum(["md", "pdf", "docx", "code"]).safeParse(new URL(req.url).searchParams.get("format"));
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact || artifact.kind === "diagram" || !artifact.currentVersion) {
    return new Response("Not found", { status: 404 });
  }
  // Code artifacts download as a source file named for their language (D8).
  if (artifact.kind === "code") {
    if (!format.success || format.data !== "code") {
      return Response.json({ error: "code artifacts export with format=code" }, { status: 400 });
    }
    return new Response(artifact.currentVersion.content, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${slugify(artifact.title)}.${languageExtension(artifact.language)}"`,
        "cache-control": "no-store",
      },
    });
  }
  if (!format.success || format.data === "code") {
    return Response.json({ error: "documents export with format md, pdf or docx" }, { status: 400 });
  }

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
