import { pgTable, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  discordId: varchar("discord_id", { length: 20 }).primaryKey(),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  premium: boolean("premium").notNull().default(false),
  oddsFormat: varchar("odds_format", { length: 20 }).notNull().default("decimal"),
  premiumExpiresAt: timestamp("premium_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
