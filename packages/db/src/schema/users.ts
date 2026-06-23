import { pgTable, varchar, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  discordId: varchar("discord_id", { length: 20 }).primaryKey(),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  premium: boolean("premium").notNull().default(false),
  oddsFormat: varchar("odds_format", { length: 20 }).notNull().default("decimal"),
  quietHoursStart: integer("quiet_hours_start"),
  quietHoursEnd: integer("quiet_hours_end"),
  mutedGames: jsonb("muted_games").$type<string[]>().notNull().default([]),
  favoriteTeams: jsonb("favorite_teams").$type<string[]>().notNull().default([]),
  favoriteLeagues: jsonb("favorite_leagues").$type<string[]>().notNull().default([]),
  premiumExpiresAt: timestamp("premium_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
