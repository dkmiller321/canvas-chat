import { z } from "zod";
import { getArtifact } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact) return new Response("Not found", { status: 404 });
  return Response.json(artifact);
}
