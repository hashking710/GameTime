import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { gameEnum } from "./matches";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 255 }),
    game: gameEnum("game").notNull(),
    logoUrl: varchar("logo_url", { length: 512 }),
    source: varchar("source", { length: 50 }).notNull(),
    sourceId: varchar("source_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("teams_source_source_id_idx").on(table.source, table.sourceId),
    index("teams_canonical_name_idx").on(table.canonicalName),
    index("teams_name_game_idx").on(table.name, table.game),
  ],
);

export const teamAliases = pgTable(
  "team_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alias: varchar("alias", { length: 255 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
  },
  (table) => [
    uniqueIndex("team_aliases_alias_idx").on(table.alias),
    index("team_aliases_canonical_idx").on(table.canonicalName),
  ],
);
