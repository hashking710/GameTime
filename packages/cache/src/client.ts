import Redis from "ioredis";
import { createLogger } from "@gametime/shared";

const logger = createLogger("cache");

export type RedisClient = InstanceType<typeof Redis>;

let _redis: RedisClient | null = null;

export function getRedis(url?: string): RedisClient {
  if (!_redis) {
    _redis = new Redis(url ?? process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        logger.warn({ attempt: times }, `Redis reconnecting in ${delay}ms`);
        return delay;
      },
    });
    _redis.on("error", (err: Error) => logger.error({ err }, "Redis error"));
    _redis.on("connect", () => logger.info("Redis connected"));
  }
  return _redis;
}
