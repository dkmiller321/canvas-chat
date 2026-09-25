import { consumeStream, convertToModelMessages, stepCountIs, streamText, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { saveMessage, syncMessages, upsertConversation } from "@/lib/conversations";
import { env } from "@/lib/env";
import { loadArtifactContext } from "@/lib/llm/artifact-context";
import { buildInstructions } from "@/lib/llm/context";
import { getModel } from "@/lib/llm/provider";
import { chatTools } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const chatRequest = z.object({
  id: z.string().uuid(),
  messages: z.array(z.unknown()).min(1),
  model: z.string(),
  /** The artifact shown in the canvas, if any. */
  openArtifactId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = chatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { id, model, openArtifactId } = parsed.data;
  if (!env().allowedModels.includes(model)) return Response.json({ error: "Model not allowed" }, { status: 400 });
  const messages = await validateUIMessages<UIMessage>({ messages: parsed.data.messages });

  // The client's list is the history: regenerate and edit-resend drop later messages.
  await upsertConversation(id, model);
  await syncMessages(id, messages);

  const result = streamText({
    model: getModel(model),
    instructions: buildInstructions(await loadArtifactContext(id, openArtifactId ?? null)),
    messages: await convertToModelMessages(messages),
    tools: chatTools(id),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Without this the reply has no stable id, and stored replies overwrite each other.
    generateMessageId: () => crypto.randomUUID(),
    // Persist the reply even when the user pressed stop (partial text is kept).
    onFinish: async ({ responseMessage }) => {
      if (responseMessage.parts.length > 0) await saveMessage(id, responseMessage);
    },
    consumeSseStream: consumeStream,
  });
}
