import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { ensureDefaultSettings } from "@/lib/settings";
import { db } from "./client";

/** Apply pending migrations and seed default settings. Runs at server startup. */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  await ensureDefaultSettings();
}
