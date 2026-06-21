import { loadEnv, createLogger, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { getRedis } from "@gametime/cache";
import { PandaScoreMatchCollector } from "./collector";
import { z } from "zod";

const env = loadEnv(
  z.object({
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    PANDASCORE_API_KEY: z.string(),
  }),
);

const logger = createLogger("collector-pandascore");
const db = getDb(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);

const collector = new PandaScoreMatchCollector(
  "pandascore",
  db,
  redis,
  "*/5 * * * *",
  env.PANDASCORE_API_KEY,
);
collector.start();

logger.info("PandaScore esports match collector started");

onShutdown(async () => {
  redis.disconnect();
});
