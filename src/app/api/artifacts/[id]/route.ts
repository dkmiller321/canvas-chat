import { z } from "zod";
import { deleteArtifact, getArtifact, updateArtifact } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const uuid = z.string().uuid();
const patch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    language: z.string().trim().min(1).max(40).optional(),
  })
  .refine((p) => p.title !== undefined || p.language !== undefined, "Nothing to update");

export async function GET(_req: Request, { params }: Ctx) {
  const id = uuid.safeParse((await params).id);
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact) return new Response("Not found", { status: 404 });
  return Response.json(artifact);
}

/** Rename, or change a code artifact's language (D12, D8). */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  const body = patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues }, { status: 400 });
  const updated = await updateArtifact(id.data, body.data);
  if (!updated) return new Response("Not found", { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = uuid.safeParse((await params).id);
  if (!id.success || !(await deleteArtifact(id.data))) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
