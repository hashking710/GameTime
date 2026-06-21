import { loadEnv, createLogger, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { getRedis } from "@gametime/cache";
import { OpenDotaCollector } from "./collector";
import { z } from "zod";

const env = loadEnv(
  z.object({
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
  }),
);

const logger = createLogger("collector-opendota");
const db = getDb(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);

const collector = new OpenDotaCollector(
  "opendota",
  db,
  redis,
  "*/10 * * * *",
);
collector.start();

logger.info("OpenDota collector started");

onShutdown(async () => {
  redis.disconnect();
});
