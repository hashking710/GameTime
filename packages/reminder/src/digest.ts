import { and, eq, gte, lt, asc } from "drizzle-orm";
import { matches, users, userSubscriptions, teams } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger, GAME_EMOJI } from "@gametime/shared";
import { getLocalHour, isGameMuted, isQuietHoursActive } from "./preferences";

const logger = createLogger("digest");

const DIGEST_HOUR = 8;

export async function sendDailyDigests(
  db: Database,
  client: Client,
): Promise<void> {
  const premiumUsers = await db
    .select({
      discordId: users.discordId,
      timezone: users.timezone,
      quietHoursStart: users.quietHoursStart,
      quietHoursEnd: users.quietHoursEnd,
      mutedGames: users.mutedGames,
      favoriteTeams: users.favoriteTeams,
      favoriteLeagues: users.favoriteLeagues,
    })
    .from(users)
    .where(eq(users.premium, true));

  if (premiumUsers.length === 0) return;

  const eligibleUsers = premiumUsers.filter(
    (u) =>
      getLocalHour(u.timezone, new Date()) === DIGEST_HOUR &&
      !isQuietHoursActive(u.timezone, u.quietHoursStart, u.quietHoursEnd),
  );

  if (eligibleUsers.length === 0) return;

  logger.info(
    { count: eligibleUsers.length },
    "Sending digests for users at 8 AM local",
  );

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const todayMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        gte(matches.startTime, startOfDay),
        lt(matches.startTime, endOfDay),
      ),
    )
    .orderBy(asc(matches.startTime));

  for (const userPrefs of eligibleUsers) {
    const { discordId } = userPrefs;
    try {
      const trackedTeamNames = await db
        .select({ name: teams.name })
        .from(userSubscriptions)
        .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
        .where(eq(userSubscriptions.discordId, discordId));

      if (trackedTeamNames.length === 0) continue;

      const teamNameSet = new Set(
        trackedTeamNames.map((t) => t.name.toLowerCase()),
      );
      const relevant = todayMatches
        .filter((m) => !isGameMuted(m.game, userPrefs.mutedGames))
        .filter(
          (m) =>
          teamNameSet.has(m.team1.toLowerCase()) ||
          teamNameSet.has(m.team2.toLowerCase()),
        );

      if (relevant.length === 0) continue;

      const favoriteTeams = new Set(
        (userPrefs.favoriteTeams ?? []).map((t) => t.toLowerCase()),
      );
      const favoriteLeagues = new Set(
        (userPrefs.favoriteLeagues ?? []).map((l) => l.toLowerCase()),
      );
      relevant.sort((a, b) => {
        const aScore = getDigestPriority(a, favoriteTeams, favoriteLeagues);
        const bScore = getDigestPriority(b, favoriteTeams, favoriteLeagues);
        if (aScore !== bScore) return aScore - bScore;
        return a.startTime.getTime() - b.startTime.getTime();
      });

      const lines = relevant.map((m) => {
        const emoji = GAME_EMOJI[m.game] ?? ":trophy:";
        const time = `<t:${Math.floor(m.startTime.getTime() / 1000)}:t>`;
        return `${emoji} **${m.team1}** vs **${m.team2}** — ${time}`;
      });

      const user = await client.users.fetch(discordId);
      await user.send({
        content: [
          "**Your Daily GameTime Digest**",
          "",
          `${relevant.length} match${relevant.length !== 1 ? "es" : ""} today for your tracked teams:`,
          "",
          ...lines,
        ].join("\n"),
      });

      logger.info({ discordId, matchCount: relevant.length }, "Digest sent");
    } catch (err) {
      logger.warn({ err, discordId }, "Failed to send digest");
    }
  }
}

function getDigestPriority(
  match: { team1: string; team2: string; tournament: string },
  favoriteTeams: Set<string>,
  favoriteLeagues: Set<string>,
): number {
  const team1 = match.team1.toLowerCase();
  const team2 = match.team2.toLowerCase();

  if (favoriteTeams.has(team1) || favoriteTeams.has(team2)) {
    return 0;
  }

  const tournament = match.tournament.toLowerCase();
  for (const league of favoriteLeagues) {
    if (league && tournament.includes(league)) return 1;
  }

  return 2;
}
