import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";
import { createMockModel } from "./mock";

/** The model for a request: the scripted mock when MOCK_LLM=1, otherwise OpenRouter. */
export function getModel(modelId: string): LanguageModel {
  const e = env();
  if (!e.allowedModels.includes(modelId)) throw new Error(`Model not allowed: ${modelId}`);
  if (e.mockLlm) return createMockModel(modelId);
  return createOpenRouter({ apiKey: e.openRouterApiKey }).chat(modelId);
}
