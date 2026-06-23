import { loadEnv, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { getRedis } from "@gametime/cache";
import { SportsDbCollector } from "./collector";
import { z } from "zod";

const env = loadEnv(
  z.object({
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    SPORTSDB_API_KEY: z.string().default("3"),
  }),
);

const db = getDb(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);

const collector = new SportsDbCollector(
  "sportsdb",
  db,
  redis,
  "*/15 * * * *",
  env.SPORTSDB_API_KEY,
);
collector.start();

onShutdown(async () => {
  redis.disconnect();
});
