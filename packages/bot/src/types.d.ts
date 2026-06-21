import type { Collection } from "discord.js";
import type { Database } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import type { Command } from "./commands/index";

declare module "discord.js" {
  interface Client {
    db: Database;
    redis: RedisClient;
    commands: Collection<string, Command>;
  }
}
