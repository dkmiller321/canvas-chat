import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

function create() {
  const client = postgres(env().databaseUrl, { max: 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

// Reuse one pool across dev hot reloads.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof create> };

export const db = (globalForDb.db ??= create());
export type Db = typeof db;
