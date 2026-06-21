import { and, eq, gte, lt, asc, sql } from "drizzle-orm";
import { matches, users, userSubscriptions, teams } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger } from "@gametime/shared";

const logger = createLogger("digest");

const GAME_EMOJI: Record<string, string> = {
  cs2: ":gun:",
  valorant: ":dart:",
  lol: ":video_game:",
  dota2: ":crossed_swords:",
  nfl: ":football:",
  nba: ":basketball:",
  mlb: ":baseball:",
  nhl: ":ice_cube:",
  soccer: ":soccer:",
  ufc: ":boxing_glove:",
  f1: ":checkered_flag:",
  tennis: ":tennis:",
};

export async function sendDailyDigests(
  db: Database,
  client: Client,
): Promise<void> {
  const premiumUsers = await db
    .select({ discordId: users.discordId })
    .from(users)
    .where(eq(users.premium, true));

  if (premiumUsers.length === 0) return;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  for (const { discordId } of premiumUsers) {
    try {
      const trackedTeamNames = await db
        .select({ name: teams.name, game: teams.game })
        .from(userSubscriptions)
        .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
        .where(eq(userSubscriptions.discordId, discordId));

      if (trackedTeamNames.length === 0) continue;

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

      const teamNameSet = new Set(
        trackedTeamNames.map((t) => t.name.toLowerCase()),
      );
      const relevant = todayMatches.filter(
        (m) =>
          teamNameSet.has(m.team1.toLowerCase()) ||
          teamNameSet.has(m.team2.toLowerCase()),
      );

      if (relevant.length === 0) continue;

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
