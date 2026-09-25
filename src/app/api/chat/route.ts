import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { saveMessage, setGeneratedTitle, syncMessages, upsertConversation } from "@/lib/conversations";
import { env } from "@/lib/env";
import { loadArtifactContext } from "@/lib/llm/artifact-context";
import { buildInstructions } from "@/lib/llm/context";
import { generateTitle } from "@/lib/llm/generate-title";
import { getModel } from "@/lib/llm/provider";
import { DEFAULT_TITLE } from "@/lib/llm/title";
import { getSettings } from "@/lib/settings";
import { chatTools } from "@/lib/tools";
import { ToolError } from "@/lib/tools/document";

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
  const conversation = await upsertConversation(id, model);
  await syncMessages(id, messages);

  // Title a new conversation from its first message, alongside the reply (C5).
  const firstUser = messages.find((m) => m.role === "user");
  const firstText = firstUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  const title =
    conversation.title === DEFAULT_TITLE && firstText
      ? getSettings()
          .then((s) => generateTitle(s.taskModel, firstText, req.signal))
          .then((t) => setGeneratedTitle(id, t))
      : null;

  const result = streamText({
    model: getModel(model),
    instructions: buildInstructions(await loadArtifactContext(id, openArtifactId ?? null)),
    messages: await convertToModelMessages(messages),
    tools: chatTools(id),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
  });

  // Tool failures meant for the model (e.g. "text not found") are useful to the user too;
  // anything else stays generic so server details don't leak.
  const onError = (error: unknown) => (error instanceof ToolError ? error.message : "An error occurred.");

  const stream = createUIMessageStream({
    originalMessages: messages,
    // Without this the reply has no stable id, and stored replies overwrite each other.
    generateId: () => crypto.randomUUID(),
    onError,
    execute: async ({ writer }) => {
      writer.merge(result.toUIMessageStream({ onError }));
      if (title) {
        // A failed title is not worth failing the reply for; the conversation keeps "New chat".
        const t = await title.catch(() => null);
        if (t) writer.write({ type: "data-title", data: { title: t }, transient: true });
      }
    },
    // Persist the reply even when the user pressed stop (partial text is kept).
    onFinish: async ({ responseMessage }) => {
      if (responseMessage.parts.length > 0) await saveMessage(id, responseMessage);
    },
  });

  return createUIMessageStreamResponse({ stream, consumeSseStream: consumeStream });
}
