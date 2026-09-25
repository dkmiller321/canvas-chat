import { z } from "zod";
import { env } from "@/lib/env";
import { deleteConversation, getConversation, updateConversation } from "@/lib/conversations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const id = z.string().uuid();
const patch = z
  .object({ title: z.string().trim().min(1).max(200).optional(), model: z.string().optional() })
  .refine((p) => p.title !== undefined || p.model !== undefined, "Nothing to update");

export async function GET(_req: Request, { params }: Ctx) {
  const parsed = id.safeParse((await params).id);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const conversation = await getConversation(parsed.data);
  if (!conversation) return new Response("Not found", { status: 404 });
  return Response.json(conversation);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const parsedId = id.safeParse((await params).id);
  if (!parsedId.success) return new Response("Not found", { status: 404 });
  const body = patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues }, { status: 400 });
  if (body.data.model && !env().allowedModels.includes(body.data.model)) {
    return Response.json({ error: "Model not allowed" }, { status: 400 });
  }
  const row = await updateConversation(parsedId.data, body.data);
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json({ id: row.id, title: row.title, model: row.model });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const parsed = id.safeParse((await params).id);
  if (!parsed.success || !(await deleteConversation(parsed.data))) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
