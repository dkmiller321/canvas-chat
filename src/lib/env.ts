import { z } from "zod";

const MOCK_MODELS = ["mock/alpha", "mock/beta"];

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    OPENROUTER_API_KEY: z.string().optional().default(""),
    ALLOWED_MODELS: csv,
    DEFAULT_MODEL: z.string().optional().default(""),
    TASK_MODEL: z.string().optional().default(""),
    MOCK_LLM: z
      .enum(["0", "1", ""])
      .optional()
      .transform((v) => v === "1"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .transform((e) => {
    const allowedModels = e.ALLOWED_MODELS.length > 0 ? e.ALLOWED_MODELS : e.MOCK_LLM ? MOCK_MODELS : [];
    const defaultModel = e.DEFAULT_MODEL || allowedModels[0] || "";
    const taskModel = e.TASK_MODEL || defaultModel;
    return {
      databaseUrl: e.DATABASE_URL,
      openRouterApiKey: e.OPENROUTER_API_KEY,
      mockLlm: e.MOCK_LLM,
      allowedModels,
      defaultModel,
      taskModel,
      host: e.HOST,
      port: e.PORT,
    };
  })
  .superRefine((e, ctx) => {
    if (e.allowedModels.length === 0) {
      ctx.addIssue({ code: "custom", message: "ALLOWED_MODELS must list at least one model (or set MOCK_LLM=1)" });
    }
    for (const [name, value] of [
      ["DEFAULT_MODEL", e.defaultModel],
      ["TASK_MODEL", e.taskModel],
    ] as const) {
      if (!e.allowedModels.includes(value)) {
        ctx.addIssue({ code: "custom", message: `${name} (${value}) must be one of ALLOWED_MODELS` });
      }
    }
    if (!e.mockLlm && !e.openRouterApiKey) {
      ctx.addIssue({ code: "custom", message: "OPENROUTER_API_KEY is required unless MOCK_LLM=1" });
    }
  });

export type Env = z.output<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${result.error.issues.map((i) => `- ${i.message}`).join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** The validated environment, parsed once on first use. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
