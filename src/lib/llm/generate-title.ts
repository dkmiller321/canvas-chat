import { generateText } from "ai";
import { getModel } from "./provider";
import { DEFAULT_TITLE, TITLE_INSTRUCTIONS } from "./title";

/** Short conversation title from the first user message, on the cheaper task model (C5). */
export async function generateTitle(
  taskModel: string,
  firstMessage: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const { text } = await generateText({
    model: getModel(taskModel),
    instructions: TITLE_INSTRUCTIONS,
    prompt: firstMessage.slice(0, 2000),
    maxOutputTokens: 30,
    abortSignal,
  });
  const title = text
    .trim()
    .replace(/^["'“”]+|["'“”.]+$/g, "")
    .trim()
    .slice(0, 80);
  return title || DEFAULT_TITLE;
}
