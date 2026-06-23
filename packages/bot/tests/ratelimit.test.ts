import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../src/utils/ratelimit";

class FakeRedis {
  private expiry = new Map<string, number>();
  now = 1_700_000_000_000;

  async set(
    key: string,
    _value: string,
    _mode: "PX",
    ttlMs: number,
    _nx: "NX",
  ): Promise<"OK" | null> {
    const expiresAt = this.expiry.get(key);
    if (expiresAt && expiresAt > this.now) return null;
    this.expiry.set(key, this.now + ttlMs);
    return "OK";
  }

  async pttl(key: string): Promise<number> {
    const expiresAt = this.expiry.get(key);
    if (!expiresAt) return -2;
    return Math.max(0, expiresAt - this.now);
  }
}

test("checkRateLimit blocks repeated calls inside cooldown", async () => {
  const userId = `user-${crypto.randomUUID()}`;
  const redis = new FakeRedis();

  const first = await checkRateLimit(redis, userId, "today");
  redis.now += 1_000;
  const second = await checkRateLimit(redis, userId, "today");

  assert.equal(first, null);
  assert.match(second ?? "", /Please wait/);
});

test("checkRateLimit allows command again after cooldown expires", async () => {
  const userId = `user-${crypto.randomUUID()}`;
  const redis = new FakeRedis();

  const first = await checkRateLimit(redis, userId, "track");
  redis.now += 3_001;
  const second = await checkRateLimit(redis, userId, "track");

  assert.equal(first, null);
  assert.equal(second, null);
});
