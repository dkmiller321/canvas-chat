import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const DB = "postgres://u:p@localhost:5433/db";

describe("parseEnv", () => {
  it("falls back to the mock models when MOCK_LLM=1", () => {
    const e = parseEnv({ DATABASE_URL: DB, MOCK_LLM: "1", ALLOWED_MODELS: "", DEFAULT_MODEL: "", TASK_MODEL: "" });
    expect(e.allowedModels).toEqual(["mock/alpha", "mock/beta"]);
    expect(e.defaultModel).toBe("mock/alpha");
    expect(e.taskModel).toBe("mock/alpha");
    expect(e.mockLlm).toBe(true);
  });

  it("requires an API key outside mock mode", () => {
    expect(() => parseEnv({ DATABASE_URL: DB, MOCK_LLM: "0", ALLOWED_MODELS: "a/b" })).toThrow(/OPENROUTER_API_KEY/);
  });

  it("rejects a default model that is not allowed", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: DB, OPENROUTER_API_KEY: "k", ALLOWED_MODELS: "a/b,c/d", DEFAULT_MODEL: "x/y" }),
    ).toThrow(/DEFAULT_MODEL/);
  });

  it("parses a real configuration", () => {
    const e = parseEnv({
      DATABASE_URL: DB,
      OPENROUTER_API_KEY: "k",
      ALLOWED_MODELS: " a/b , c/d ",
      DEFAULT_MODEL: "c/d",
      TASK_MODEL: "a/b",
      PORT: "4000",
    });
    expect(e).toMatchObject({ allowedModels: ["a/b", "c/d"], defaultModel: "c/d", taskModel: "a/b", port: 4000 });
    expect(e.mockLlm).toBe(false);
  });

  it("requires DATABASE_URL", () => {
    expect(() => parseEnv({ MOCK_LLM: "1" })).toThrow(/Invalid environment/);
  });
});
