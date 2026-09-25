import "dotenv/config";
import { runMigrations } from "./migrate";

await runMigrations();
process.exit(0);
