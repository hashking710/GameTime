import { Client, GatewayIntentBits } from "discord.js";
import cron from "node-cron";
import { loadEnv, createLogger, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { z } from "zod";
import { findPendingNotifications } from "./checker";
import { sendNotifications } from "./notifier";
import { sendDailyDigests } from "./digest";
import { checkUpsetAlerts, checkLineMovementAlerts } from "./alerts";
import { checkScoreAlerts } from "./score-alerts";
import { cleanupStaleData } from "./cleanup";
import { checkWatchedMatches } from "./watch-notifier";

const env = loadEnv(
  z.object({
    DISCORD_TOKEN: z.string(),
    DATABASE_URL: z.string(),
    ADMIN_USER_IDS: z.string().optional(),
  }),
);

const adminUserIds = new Set(
  (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const logger = createLogger("reminder");
const db = getDb(env.DATABASE_URL);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const sentCache = new Set<string>();

setInterval(() => sentCache.clear(), 3600_000);

client.once("clientReady", () => {
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

  // Score & win alerts — every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      await checkScoreAlerts(db, client, sentCache, adminUserIds);
    } catch (err) {
      logger.error({ err }, "Score alert cycle failed");
    }
  });

  // Watched match notifications — every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      await checkWatchedMatches(db, client, sentCache);
    } catch (err) {
      logger.error({ err }, "Watch notifier cycle failed");
    }
  });

  // Stale data cleanup — daily at 3 AM UTC
  cron.schedule("0 3 * * *", async () => {
    try {
      await cleanupStaleData(db);
    } catch (err) {
      logger.error({ err }, "Cleanup failed");
    }
  });

  // Daily digest — check every hour, send to users whose local time is 8 AM
  cron.schedule("0 * * * *", async () => {
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
