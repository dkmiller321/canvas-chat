import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getArtifact } from "@/lib/artifacts";
import { env } from "@/lib/env";
import { getModel } from "@/lib/llm/provider";
import { CODE_REWRITE_INSTRUCTIONS, REWRITE_INSTRUCTIONS, buildRewriteMessage } from "@/lib/llm/rewrite-prompt";
import { getSettings } from "@/lib/settings";
import { rewriteTools } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  instruction: z.string().trim().min(1).max(2000),
  /** Selected Markdown; null means the whole document. */
  selectedText: z.string().nullable(),
  /** Quick actions run on the cheaper task model (PRD cost control). */
  mode: z.enum(["ask", "quick"]),
  model: z.string(),
});

/** Highlight-to-edit and quick actions (D5, D6) via the rewrite_selection tool. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact || artifact.kind === "diagram" || !artifact.currentVersion) {
    return new Response("Not found", { status: 404 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { instruction, selectedText, mode, model } = parsed.data;

  const settings = await getSettings();
  const modelId =
    mode === "quick" ? settings.taskModel : env().allowedModels.includes(model) ? model : settings.defaultModel;
  const document = artifact.currentVersion.content;

  const result = await generateText({
    model: getModel(modelId),
    instructions: artifact.kind === "code" ? CODE_REWRITE_INSTRUCTIONS : REWRITE_INSTRUCTIONS,
    prompt: buildRewriteMessage({
      artifactId: artifact.id,
      instruction,
      selectedText: selectedText ?? document,
      document,
    }),
    tools: rewriteTools(artifact.id),
    toolChoice: { type: "tool", toolName: "rewrite_selection" },
    stopWhen: stepCountIs(1),
    abortSignal: req.signal,
  });

  const failure = result.content.find((p) => p.type === "tool-error");
  if (failure)
    return Response.json(
      { error: String(failure.error instanceof Error ? failure.error.message : failure.error) },
      { status: 422 },
    );
  const done = result.toolResults.find((r) => r.toolName === "rewrite_selection");
  if (!done) return Response.json({ error: "The model did not return a rewrite. Try again." }, { status: 422 });
  return Response.json(done.output);
}
