import { and, eq, gte, lt, asc } from "drizzle-orm";
import { matches, users, userSubscriptions, teams } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger, GAME_EMOJI } from "@gametime/shared";

const logger = createLogger("digest");

const DIGEST_HOUR = 8;

function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return -1;
  }
}

export async function sendDailyDigests(
  db: Database,
  client: Client,
): Promise<void> {
  const premiumUsers = await db
    .select({ discordId: users.discordId, timezone: users.timezone })
    .from(users)
    .where(eq(users.premium, true));

  if (premiumUsers.length === 0) return;

  const eligibleUsers = premiumUsers.filter(
    (u) => getLocalHour(u.timezone) === DIGEST_HOUR,
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

  for (const { discordId } of eligibleUsers) {
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
