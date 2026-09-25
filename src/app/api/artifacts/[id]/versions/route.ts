import { z } from "zod";
import { VersionConflictError, addVersion, getArtifact, listVersions } from "@/lib/artifacts";
import { parseScene } from "@/lib/tools/scene";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  content: z.string(),
  author: z.enum(["user", "ai"]),
  baseVersionNo: z.number().int().min(0),
});

async function load(params: Ctx["params"]) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  return id.success ? getArtifact(id.data) : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const artifact = await load(params);
  if (!artifact) return new Response("Not found", { status: 404 });
  return Response.json(await listVersions(artifact.id));
}

/**
 * Save a version from the browser: manual edits (author "user"), or version 1 of
 * a diagram converted from the AI's Mermaid (author "ai", only while it has no versions).
 */
export async function POST(req: Request, { params }: Ctx) {
  const artifact = await load(params);
  if (!artifact) return new Response("Not found", { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { content, author, baseVersionNo } = parsed.data;

  if (author === "ai" && !(artifact.kind === "diagram" && baseVersionNo === 0)) {
    return Response.json({ error: "Only the first diagram conversion may be saved as the AI" }, { status: 403 });
  }
  if (artifact.kind === "diagram") {
    try {
      parseScene(content);
    } catch {
      return Response.json({ error: "Content is not an Excalidraw scene" }, { status: 400 });
    }
  }

  try {
    const version = await addVersion(artifact.id, content, author, { baseVersionNo });
    return Response.json(version, { status: 201 });
  } catch (err) {
    if (err instanceof VersionConflictError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
