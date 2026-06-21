import {
  pgTable,
  uuid,
  varchar,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { teams } from "./teams";

export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordId: varchar("discord_id", { length: 20 })
      .notNull()
      .references(() => users.discordId, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    notify60min: boolean("notify_60min").notNull().default(true),
    notify30min: boolean("notify_30min").notNull().default(true),
    notify15min: boolean("notify_15min").notNull().default(false),
    notify5min: boolean("notify_5min").notNull().default(false),
    notifyLive: boolean("notify_live").notNull().default(true),
  },
  (table) => [
    uniqueIndex("user_sub_discord_team_idx").on(table.discordId, table.teamId),
  ],
);
