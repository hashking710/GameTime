import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(url?: string) {
  if (!_db) {
    const pool = new Pool({
      connectionString: url ?? process.env.DATABASE_URL,
      max: 10,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
