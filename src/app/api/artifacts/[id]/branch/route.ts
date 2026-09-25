import { z } from "zod";
import { branchArtifact } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

const body = z.object({ versionNo: z.number().int().min(1) });

/** Branch a new artifact from any version (A3). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!id.success) return new Response("Not found", { status: 404 });
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const copy = await branchArtifact(id.data, parsed.data.versionNo);
  if (!copy) return new Response("Not found", { status: 404 });
  return Response.json(copy, { status: 201 });
}
