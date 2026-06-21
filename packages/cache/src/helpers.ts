import type { RedisClient } from "./client";
import { CacheTTL } from "./keys";

export async function getOrSet<T>(
  redis: RedisClient,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.DEFAULT,
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const fresh = await fetcher();
  await redis.set(key, JSON.stringify(fresh), "EX", ttl);
  return fresh;
}

export async function invalidatePattern(
  redis: RedisClient,
  pattern: string,
): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
