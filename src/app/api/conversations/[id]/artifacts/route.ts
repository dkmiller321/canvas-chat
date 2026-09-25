import { z } from "zod";
import { createArtifact, getArtifact } from "@/lib/artifacts";
import { upsertConversation } from "@/lib/conversations";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const EMPTY_SCENE = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "canvas-chat",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

const TITLES = { document: "Untitled document", diagram: "Untitled diagram", code: "Untitled code" } as const;

const body = z.object({
  kind: z.enum(["document", "diagram", "code"]),
  /** Creates the conversation on first use, like the first chat message does. */
  model: z.string(),
  title: z.string().trim().min(1).max(200).optional(),
  language: z.string().trim().min(1).max(40).optional(),
});

/** A blank artifact made by the user, without the AI (D12). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { kind, model, title, language } = parsed.data;
  if (!env().allowedModels.includes(model)) return Response.json({ error: "Model not allowed" }, { status: 400 });

  await upsertConversation(id.data, model);
  const created = await createArtifact({
    conversationId: id.data,
    kind,
    title: title ?? TITLES[kind],
    content: kind === "diagram" ? EMPTY_SCENE : "",
    author: "user",
    language: kind === "code" ? (language ?? "python") : null,
  });
  return Response.json(await getArtifact(created.id), { status: 201 });
}
