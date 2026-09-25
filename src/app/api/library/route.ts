import { z } from "zod";
import { getLibrary, saveLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

// Library items are Excalidraw's own format; only the outer shape is checked here.
const body = z.object({
  items: z.array(z.object({ id: z.string(), elements: z.array(z.unknown()) }).passthrough()).max(2000),
});

export async function GET() {
  return Response.json({ items: await getLibrary() });
}

export async function PUT(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  await saveLibrary(parsed.data.items);
  return Response.json({ count: parsed.data.items.length });
}
