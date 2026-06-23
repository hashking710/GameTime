import type { RedisClient } from "./client";
import { CacheTTL } from "./keys";

export async function getOrSet<T>(
  redis: RedisClient,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.DEFAULT,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through to fetcher
  }

  const fresh = await fetcher();

  try {
    await redis.set(key, JSON.stringify(fresh), "EX", ttl);
  } catch {
    // Redis unavailable — return fresh data uncached
  }

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
