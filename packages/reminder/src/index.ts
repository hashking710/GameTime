import { Client, GatewayIntentBits } from "discord.js";
import cron from "node-cron";
import { loadEnv, createLogger, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { z } from "zod";
import { findPendingNotifications } from "./checker";
import { sendNotifications } from "./notifier";
import { sendDailyDigests } from "./digest";
import { checkUpsetAlerts, checkLineMovementAlerts } from "./alerts";

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

setInterval(() => sentCache.clear(), 3600_000);

client.once("ready", () => {
  logger.info("Reminder service online");

  // Match reminders — every minute
  cron.schedule("* * * * *", async () => {
    try {
      const notifications = await findPendingNotifications(db, 65);
      await sendNotifications(client, notifications, sentCache);
    } catch (err) {
      logger.error({ err }, "Reminder cycle failed");
    }
  });

  // Upset alerts — every 2 minutes (only checks live matches)
  cron.schedule("*/2 * * * *", async () => {
    try {
      await checkUpsetAlerts(db, client, sentCache);
    } catch (err) {
      logger.error({ err }, "Upset alert cycle failed");
    }
  });

  // Line movement alerts — every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    try {
      await checkLineMovementAlerts(db, client, sentCache);
    } catch (err) {
      logger.error({ err }, "Line movement alert cycle failed");
    }
  });

  // Daily digest — 8 AM UTC every day
  cron.schedule("0 8 * * *", async () => {
    try {
      await sendDailyDigests(db, client);
    } catch (err) {
      logger.error({ err }, "Daily digest failed");
    }
  });
});

await client.login(env.DISCORD_TOKEN);

onShutdown(async () => {
  client.destroy();
});
