import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { matches, userSubscriptions, teams, users } from "@gametime/db";
import type { Database } from "@gametime/db";
import { isGameMuted, isQuietHoursActive } from "./preferences";

export interface PendingNotification {
  discordId: string;
  matchId: string;
  team1: string;
  team2: string;
  game: string;
  tournament: string;
  startTime: Date;
  minutesUntil: number;
}

export async function findPendingNotifications(
  db: Database,
  windowMinutes: number,
): Promise<PendingNotification[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

  const results = await db
    .select({
      discordId: userSubscriptions.discordId,
      matchId: matches.id,
      team1: matches.team1,
      team2: matches.team2,
      game: matches.game,
      tournament: matches.tournament,
      startTime: matches.startTime,
      notify60min: userSubscriptions.notify60min,
      notify30min: userSubscriptions.notify30min,
      notify15min: userSubscriptions.notify15min,
      notify5min: userSubscriptions.notify5min,
      notifyLive: userSubscriptions.notifyLive,
      timezone: users.timezone,
      quietHoursStart: users.quietHoursStart,
      quietHoursEnd: users.quietHoursEnd,
      mutedGames: users.mutedGames,
    })
    .from(matches)
    .innerJoin(
      teams,
      sql`(
        ${matches.team1} ILIKE '%' || ${teams.name} || '%'
        OR ${matches.team2} ILIKE '%' || ${teams.name} || '%'
        OR ${matches.team1} ILIKE '%' || ${teams.canonicalName} || '%'
        OR ${matches.team2} ILIKE '%' || ${teams.canonicalName} || '%'
      ) AND ${teams.game} = ${matches.game}`,
    )
    .innerJoin(userSubscriptions, eq(userSubscriptions.teamId, teams.id))
    .innerJoin(users, eq(userSubscriptions.discordId, users.discordId))
    .where(
      and(
        or(eq(matches.status, "upcoming"), eq(matches.status, "live")),
        gte(matches.startTime, new Date(now.getTime() - 5 * 60000)),
        lte(matches.startTime, windowEnd),
      ),
    );

  return results
    .map((r) => {
      const minutesUntil = Math.round(
        (r.startTime.getTime() - now.getTime()) / 60000,
      );

      if (minutesUntil <= 2 && !r.notifyLive) return null;
      if (minutesUntil > 2 && minutesUntil <= 7 && !r.notify5min) return null;
      if (minutesUntil > 7 && minutesUntil <= 17 && !r.notify15min) return null;
      if (minutesUntil > 17 && minutesUntil <= 35 && !r.notify30min) return null;
      if (minutesUntil > 35 && minutesUntil <= 65 && !r.notify60min) return null;
      if (minutesUntil > 65) return null;
      if (isGameMuted(r.game, r.mutedGames)) return null;
      if (isQuietHoursActive(r.timezone, r.quietHoursStart, r.quietHoursEnd, now)) {
        return null;
      }

      return {
        discordId: r.discordId,
        matchId: r.matchId,
        team1: r.team1,
        team2: r.team2,
        game: r.game,
        tournament: r.tournament,
        startTime: r.startTime,
        minutesUntil,
      };
    })
    .filter((n) => n !== null) as PendingNotification[];
}
