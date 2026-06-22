import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
type MatchDetails = Record<string, unknown>;

export const matchStatusEnum = pgEnum("match_status", [
  "upcoming",
  "live",
  "completed",
]);

export const gameEnum = pgEnum("game", [
  "cs2",
  "valorant",
  "lol",
  "dota2",
  "rocket_league",
  "apex",
  "rainbow_six",
  "cod",
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "soccer",
  "ufc",
  "f1",
  "tennis",
]);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game: gameEnum("game").notNull(),
    team1: varchar("team1", { length: 255 }).notNull(),
    team2: varchar("team2", { length: 255 }).notNull(),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    tournament: varchar("tournament", { length: 255 }).notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    status: matchStatusEnum("status").notNull().default("upcoming"),
    streamUrl: varchar("stream_url", { length: 512 }),
    details: jsonb("details").$type<MatchDetails>(),
    source: varchar("source", { length: 50 }).notNull(),
    sourceId: varchar("source_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("matches_source_source_id_idx").on(table.source, table.sourceId),
    index("matches_game_status_idx").on(table.game, table.status),
    index("matches_start_time_idx").on(table.startTime),
    index("matches_status_idx").on(table.status),
  ],
);
