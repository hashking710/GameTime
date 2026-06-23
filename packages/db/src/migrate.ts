import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath, pathToFileURL } from "url";
import { getDb } from "./client";

export async function runMigrations() {
  const db = getDb();
  const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });
}

async function main() {
  await runMigrations();
  console.log("Migrations complete");
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
}
