import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

function create() {
  const client = postgres(env().databaseUrl, { max: 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof create>;

// One pool, reused across dev hot reloads. Created on first use, not at import:
// `next build` imports route modules without a runtime environment.
const globalForDb = globalThis as unknown as { db?: Db };

function instance(): Db {
  globalForDb.db ??= create();
  return globalForDb.db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = instance();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
