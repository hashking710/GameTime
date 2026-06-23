import {
  pgTable,
  uuid,
  varchar,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";
import { users } from "./users";

export const matchWatches = pgTable(
  "match_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordId: varchar("discord_id", { length: 20 })
      .notNull()
      .references(() => users.discordId, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    notifyLive: boolean("notify_live").notNull().default(true),
    notifyCompleted: boolean("notify_completed").notNull().default(true),
  },
  (table) => [
    uniqueIndex("match_watches_user_match_idx").on(table.discordId, table.matchId),
  ],
);
