import { convertToModelMessages, stepCountIs, streamText, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";
import { buildInstructions } from "@/lib/llm/context";
import { getModel } from "@/lib/llm/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const chatRequest = z.object({
  id: z.string().uuid(),
  messages: z.array(z.unknown()).min(1),
  model: z.string(),
});

export async function POST(req: Request) {
  const parsed = chatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { model } = parsed.data;
  if (!env().allowedModels.includes(model)) return Response.json({ error: "Model not allowed" }, { status: 400 });
  const messages = await validateUIMessages<UIMessage>({ messages: parsed.data.messages });

  const result = streamText({
    model: getModel(model),
    instructions: buildInstructions({ artifacts: [], open: null }),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
}
