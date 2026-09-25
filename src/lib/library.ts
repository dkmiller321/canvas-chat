import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

/** The user's Excalidraw shape library (G9), kept as one settings row. */
const KEY = "excalidraw_library";

export async function getLibrary(): Promise<unknown[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  if (!row) return [];
  const items = JSON.parse(row.value) as unknown;
  return Array.isArray(items) ? items : [];
}

export async function saveLibrary(items: unknown[]) {
  const value = JSON.stringify(items);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function clearLibrary() {
  await db.delete(settings).where(eq(settings.key, KEY));
}
