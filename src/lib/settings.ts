import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { env } from "@/lib/env";

export type AppSettings = { defaultModel: string; taskModel: string };

const KEYS = { defaultModel: "default_model", taskModel: "task_model" } as const;

export function defaultSettings(): AppSettings {
  return { defaultModel: env().defaultModel, taskModel: env().taskModel };
}

/** Insert missing settings rows; never overwrites saved values. */
export async function ensureDefaultSettings() {
  const d = defaultSettings();
  await db
    .insert(settings)
    .values([
      { key: KEYS.defaultModel, value: d.defaultModel },
      { key: KEYS.taskModel, value: d.taskModel },
    ])
    .onConflictDoNothing();
}

export async function resetSettings() {
  await db.delete(settings).where(inArray(settings.key, Object.values(KEYS)));
  await ensureDefaultSettings();
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const d = defaultSettings();
  const allowed = env().allowedModels;
  // A saved model that is no longer allowed falls back to the env default.
  const pick = (value: string | undefined, fallback: string) => (value && allowed.includes(value) ? value : fallback);
  return {
    defaultModel: pick(byKey.get(KEYS.defaultModel), d.defaultModel),
    taskModel: pick(byKey.get(KEYS.taskModel), d.taskModel),
  };
}

export async function saveSettings(next: AppSettings) {
  for (const [field, key] of Object.entries(KEYS) as [keyof AppSettings, string][]) {
    await db
      .insert(settings)
      .values({ key, value: next[field] })
      .onConflictDoUpdate({ target: settings.key, set: { value: next[field] } });
  }
}
