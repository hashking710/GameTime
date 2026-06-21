import { Client, GatewayIntentBits } from "discord.js";
import cron from "node-cron";
import { loadEnv, createLogger, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { z } from "zod";
import { findPendingNotifications } from "./checker";
import { sendNotifications } from "./notifier";

const env = loadEnv(
  z.object({
    DISCORD_TOKEN: z.string(),
    DATABASE_URL: z.string(),
  }),
);

const logger = createLogger("reminder");
const db = getDb(env.DATABASE_URL);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const sentCache = new Set<string>();

// Clear cache hourly to prevent unbounded growth
setInterval(() => sentCache.clear(), 3600_000);

client.once("ready", () => {
  logger.info("Reminder service online");

  cron.schedule("* * * * *", async () => {
    try {
      const notifications = await findPendingNotifications(db, 65);
      await sendNotifications(client, notifications, sentCache);
    } catch (err) {
      logger.error({ err }, "Reminder cycle failed");
    }
  });
});

await client.login(env.DISCORD_TOKEN);

onShutdown(async () => {
  client.destroy();
});
