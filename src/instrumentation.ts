export async function register() {
  // Migrations need Node APIs; skip the edge runtime. NEXT_RUNTIME is set by Next itself.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/db/migrate");
    await runMigrations();
  }
}
