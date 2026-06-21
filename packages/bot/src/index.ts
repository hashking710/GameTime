import { Client, GatewayIntentBits, Collection } from "discord.js";
import { createLogger, loadEnv, onShutdown } from "@gametime/shared";
import { getDb } from "@gametime/db";
import { getRedis } from "@gametime/cache";
import { z } from "zod";
import { loadCommands } from "./commands/index";
import { handleInteraction } from "./events/interaction-create";
import { startWebhookServer } from "./webhook";

const env = loadEnv(
  z.object({
    DISCORD_TOKEN: z.string(),
    DISCORD_CLIENT_ID: z.string(),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    KOFI_VERIFICATION_TOKEN: z.string().optional(),
    KOFI_URL: z.string().optional(),
    WEBHOOK_PORT: z.coerce.number().default(3000),
  }),
);

const logger = createLogger("bot");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const db = getDb(env.DATABASE_URL);
client.db = db;
client.redis = getRedis(env.REDIS_URL);
client.commands = new Collection();

const commands = loadCommands();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

client.once("ready", (c) => {
  logger.info({ tag: c.user.tag }, "Bot online");

  if (env.KOFI_VERIFICATION_TOKEN) {
    startWebhookServer(
      db,
      client,
      env.KOFI_VERIFICATION_TOKEN,
      env.WEBHOOK_PORT,
    );
  } else {
    logger.warn(
      "KOFI_VERIFICATION_TOKEN not set — webhook server disabled. Premium payments won't be processed.",
    );
  }
});

client.on("interactionCreate", handleInteraction);

onShutdown(async () => {
  client.destroy();
  client.redis.disconnect();
});

await client.login(env.DISCORD_TOKEN);
