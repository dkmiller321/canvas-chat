import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { parseArtifactContext } from "./context";
import { planResponse, type MockMode, type MockStep } from "./mock-scripts";
import { TITLE_INSTRUCTIONS } from "./title";
import { TOOL_NAMES } from "@/lib/tools/schemas";

const TOOL_PAUSE_MS = 400;
const WORDS_PER_CHUNK = 3;

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const finish = (unified: LanguageModelV4FinishReason["unified"]): LanguageModelV4FinishReason => ({ unified, raw: unified });

function systemText(prompt: LanguageModelV4Prompt): string {
  return prompt
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  const last = prompt.findLast((m) => m.role === "user");
  if (!last || last.role !== "user") return "";
  return last.content.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function plan(options: LanguageModelV4CallOptions, modelId: string): MockStep {
  const system = systemText(options.prompt);
  const toolNames = (options.tools ?? []).map((t) => t.name);
  const mode: MockMode = system.startsWith(TITLE_INSTRUCTIONS)
    ? "title"
    : toolNames.includes(TOOL_NAMES.rewriteSelection)
      ? "rewrite"
      : "chat";
  return planResponse({
    mode,
    lastUser: lastUserText(options.prompt),
    modelId,
    context: parseArtifactContext(system),
    afterTool: options.prompt.at(-1)?.role === "tool",
  });
}

export function chunkWords(text: string, perChunk = WORDS_PER_CHUNK): string[] {
  const words = text.match(/\s*\S+\s*/g) ?? [text];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += perChunk) chunks.push(words.slice(i, i + perChunk).join(""));
  return chunks;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Scripted model for MOCK_LLM=1. It speaks the AI SDK LanguageModelV4 protocol,
 * so streamText, tool execution, persistence and the UI run unchanged.
 */
export function createMockModel(modelId: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "mock",
    modelId,
    supportedUrls: {},

    async doGenerate(options) {
      const step = plan(options, modelId);
      const content: LanguageModelV4Content[] = [];
      if (step.type === "text") content.push({ type: "text", text: step.text });
      if (step.type === "tool") {
        await sleep(TOOL_PAUSE_MS, options.abortSignal);
        content.push({
          type: "tool-call",
          toolCallId: `mock-${crypto.randomUUID()}`,
          toolName: step.toolName,
          input: JSON.stringify(step.input),
        });
      }
      return {
        content,
        finishReason: finish(step.type === "tool" ? "tool-calls" : "stop"),
        usage: USAGE,
        warnings: [],
      };
    },

    async doStream(options) {
      const step = plan(options, modelId);
      const signal = options.abortSignal;

      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        async start(controller) {
          try {
            controller.enqueue({ type: "stream-start", warnings: [] });
            if (step.type === "text") {
              const id = crypto.randomUUID();
              controller.enqueue({ type: "text-start", id });
              for (const delta of chunkWords(step.text)) {
                controller.enqueue({ type: "text-delta", id, delta });
                await sleep(step.chunkDelayMs, signal);
              }
              controller.enqueue({ type: "text-end", id });
            }
            if (step.type === "tool") {
              await sleep(TOOL_PAUSE_MS, signal);
              const id = `mock-${crypto.randomUUID()}`;
              const input = JSON.stringify(step.input);
              controller.enqueue({ type: "tool-input-start", id, toolName: step.toolName });
              for (let i = 0; i < input.length; i += 40) {
                controller.enqueue({ type: "tool-input-delta", id, delta: input.slice(i, i + 40) });
                await sleep(10, signal);
              }
              controller.enqueue({ type: "tool-input-end", id });
              controller.enqueue({ type: "tool-call", toolCallId: id, toolName: step.toolName, input });
            }
            controller.enqueue({
              type: "finish",
              usage: USAGE,
              finishReason: finish(step.type === "tool" ? "tool-calls" : "stop"),
            });
            controller.close();
          } catch (err) {
            // Aborted by the client (stop button): end the stream without more output.
            controller.error(err);
          }
        },
      });
      return { stream };
    },
  };
}
