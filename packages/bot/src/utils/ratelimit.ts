interface RateLimitRedis {
  set(
    key: string,
    value: string,
    mode: "PX",
    durationMs: number,
    nx: "NX",
  ): Promise<"OK" | null>;
  pttl(key: string): Promise<number>;
}

const COOLDOWN_MS: Record<string, number> = {
  live: 15_000,
  today: 5_000,
  upcoming: 5_000,
  schedule: 5_000,
  odds: 5_000,
  track: 3_000,
  untrack: 3_000,
  results: 5_000,
};

export async function checkRateLimit(
  redis: RateLimitRedis,
  userId: string,
  command: string,
): Promise<string | null> {
  const cooldown = COOLDOWN_MS[command] ?? 3_000;
  const key = `ratelimit:${userId}:${command}`;
  const created = await redis.set(key, "1", "PX", cooldown, "NX");
  if (created === "OK") {
    return null;
  }

  const ttlMs = await redis.pttl(key);
  const remainingSeconds = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 1;
  return `Please wait ${remainingSeconds}s before using \`/${command}\` again.`;
}
