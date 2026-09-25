import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getArtifact } from "@/lib/artifacts";
import { env } from "@/lib/env";
import { getModel } from "@/lib/llm/provider";
import { DIAGRAM_REWRITE_INSTRUCTIONS, buildDiagramRewriteMessage } from "@/lib/llm/rewrite-prompt";
import { getSettings } from "@/lib/settings";
import { diagramSelectionTools } from "@/lib/tools";
import { parseScene, summarizeScene } from "@/lib/tools/scene";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  selectedIds: z.array(z.string().min(1)).min(1).max(200),
  instruction: z.string().trim().min(1).max(2000),
  model: z.string(),
});

/** "Ask AI" about selected diagram shapes (G6), via update_diagram restricted to the selection. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const artifact = id.success ? await getArtifact(id.data) : null;
  if (!artifact || artifact.kind !== "diagram" || !artifact.currentVersion) {
    return new Response("Not found", { status: 404 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { selectedIds, instruction, model } = parsed.data;
  const modelId = env().allowedModels.includes(model) ? model : (await getSettings()).defaultModel;

  const result = await generateText({
    model: getModel(modelId),
    instructions: DIAGRAM_REWRITE_INSTRUCTIONS,
    prompt: buildDiagramRewriteMessage({
      artifactId: artifact.id,
      instruction,
      selectedIds,
      elements: summarizeScene(parseScene(artifact.currentVersion.content)),
    }),
    tools: diagramSelectionTools(artifact.id, selectedIds),
    toolChoice: { type: "tool", toolName: "update_diagram" },
    stopWhen: stepCountIs(1),
    abortSignal: req.signal,
  });

  const failure = result.content.find((p) => p.type === "tool-error");
  if (failure) {
    const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
    return Response.json({ error: message }, { status: 422 });
  }
  const done = result.toolResults.find((r) => r.toolName === "update_diagram");
  if (!done) return Response.json({ error: "The model did not change the diagram. Try again." }, { status: 422 });
  return Response.json(done.output);
}
