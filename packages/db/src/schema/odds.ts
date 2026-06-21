import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  real,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";
import { gameEnum } from "./matches";

export const oddsMarketEnum = pgEnum("odds_market", [
  "moneyline",
  "spread",
  "total",
]);

export const odds = pgTable(
  "odds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    game: gameEnum("game").notNull(),
    bookmaker: varchar("bookmaker", { length: 100 }).notNull(),
    market: oddsMarketEnum("market").notNull(),
    team1Odds: real("team1_odds").notNull(),
    team2Odds: real("team2_odds").notNull(),
    drawOdds: real("draw_odds"),
    spreadValue: real("spread_value"),
    totalValue: real("total_value"),
    overOdds: real("over_odds"),
    underOdds: real("under_odds"),
    source: varchar("source", { length: 50 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("odds_match_book_market_idx").on(
      table.matchId,
      table.bookmaker,
      table.market,
    ),
    index("odds_match_id_idx").on(table.matchId),
  ],
);

export const oddsHistory = pgTable(
  "odds_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    bookmaker: varchar("bookmaker", { length: 100 }).notNull(),
    market: oddsMarketEnum("market").notNull(),
    team1Odds: real("team1_odds").notNull(),
    team2Odds: real("team2_odds").notNull(),
    drawOdds: real("draw_odds"),
    spreadValue: real("spread_value"),
    totalValue: real("total_value"),
    overOdds: real("over_odds"),
    underOdds: real("under_odds"),
    source: varchar("source", { length: 50 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("odds_history_match_id_idx").on(table.matchId),
    index("odds_history_fetched_at_idx").on(table.fetchedAt),
  ],
);
