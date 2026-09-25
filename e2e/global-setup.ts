import type { FullConfig } from "@playwright/test";

/**
 * Hit each route once so `next dev` compiles it before the timed assertions run.
 * Responses are ignored: this only warms the compiler.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const warm = (path: string, init?: RequestInit) => fetch(new URL(path, baseURL), init).catch(() => undefined);
  await warm("/");
  await warm("/settings");
  await warm("/c/00000000-0000-0000-0000-000000000000");
  await warm("/api/conversations");
  await warm("/api/conversations/00000000-0000-0000-0000-000000000000");
  await warm("/api/artifacts/00000000-0000-0000-0000-000000000000");
  await warm("/api/artifacts/00000000-0000-0000-0000-000000000000/versions");
  await warm("/api/chat", { method: "POST", body: "{}" });
  await warm("/api/settings");
}
