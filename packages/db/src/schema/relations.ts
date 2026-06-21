import { relations } from "drizzle-orm";
import { users } from "./users";
import { teams } from "./teams";
import { userSubscriptions } from "./user-subscriptions";
import { matches } from "./matches";
import { odds, oddsHistory } from "./odds";

export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(userSubscriptions),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  subscribers: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubscriptions.discordId],
      references: [users.discordId],
    }),
    team: one(teams, {
      fields: [userSubscriptions.teamId],
      references: [teams.id],
    }),
  }),
);

export const matchesRelations = relations(matches, ({ many }) => ({
  odds: many(odds),
  oddsHistory: many(oddsHistory),
}));

export const oddsRelations = relations(odds, ({ one }) => ({
  match: one(matches, {
    fields: [odds.matchId],
    references: [matches.id],
  }),
}));

export const oddsHistoryRelations = relations(oddsHistory, ({ one }) => ({
  match: one(matches, {
    fields: [oddsHistory.matchId],
    references: [matches.id],
  }),
}));
