import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { clearLibrary } from "@/lib/library";
import { resetSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Test-only: wipe user data and restore default settings. 404 unless MOCK_LLM=1. */
export async function POST() {
  if (!env().mockLlm) return new Response("Not found", { status: 404 });
  await db.execute(sql`truncate table artifact_versions, artifacts, messages, conversations restart identity cascade`);
  await resetSettings();
  await clearLibrary();
  return Response.json({ ok: true });
}
