import {
  loadEnv,
  onShutdown,
  validatePandaScoreApiKey,
} from "@gametime/shared";
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

const db = getDb(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);

const collector = new PandaScoreMatchCollector(
  "pandascore",
  db,
  redis,
  "*/5 * * * *",
  env.PANDASCORE_API_KEY,
);
await validatePandaScoreApiKey(env.PANDASCORE_API_KEY, "collector-pandascore");
collector.start();

onShutdown(async () => {
  redis.disconnect();
});
