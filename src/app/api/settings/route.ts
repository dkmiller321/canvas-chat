import { z } from "zod";
import { env } from "@/lib/env";
import { getSettings, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ...(await getSettings()), allowedModels: env().allowedModels });
}

export async function PUT(req: Request) {
  const allowed = env().allowedModels;
  const model = z.string().refine((m) => allowed.includes(m), "Model not allowed");
  const parsed = z.object({ defaultModel: model, taskModel: model }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  await saveSettings(parsed.data);
  return Response.json(parsed.data);
}
