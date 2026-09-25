import { z } from "zod";
import { restoreVersion } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

const body = z.object({ versionNo: z.number().int().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!id.success) return new Response("Not found", { status: 404 });
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const version = await restoreVersion(id.data, parsed.data.versionNo);
  if (!version) return new Response("Not found", { status: 404 });
  return Response.json(version, { status: 201 });
}
