import { and, eq, gte, sql, lte } from "drizzle-orm";
import { matches, odds, oddsHistory, users, userSubscriptions, teams } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger, GAME_EMOJI } from "@gametime/shared";
import { isGameMuted, isQuietHoursActive } from "./preferences";

const logger = createLogger("alerts");

export async function checkUpsetAlerts(
  db: Database,
  client: Client,
  sentCache: Set<string>,
): Promise<void> {
  const liveMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.status, "live"));

  for (const match of liveMatches) {
    const matchOdds = await db
      .select()
      .from(odds)
      .where(
        and(eq(odds.matchId, match.id), eq(odds.market, "moneyline")),
      )
      .limit(1);

    if (matchOdds.length === 0) continue;
    const o = matchOdds[0];

    const t1Score = match.team1Score ?? 0;
    const t2Score = match.team2Score ?? 0;
    if (t1Score === t2Score) continue;

    const underdogWinning =
      (o.team1Odds > 2.5 && t1Score > t2Score) ||
      (o.team2Odds > 2.5 && t2Score > t1Score);

    if (!underdogWinning) continue;

    const winningTeam = t1Score > t2Score ? match.team1 : match.team2;
    const losingTeam = t1Score > t2Score ? match.team2 : match.team1;
    const underdogOdds = t1Score > t2Score ? o.team1Odds : o.team2Odds;

    const premiumSubs = await db
      .select({
        discordId: userSubscriptions.discordId,
        timezone: users.timezone,
        quietHoursStart: users.quietHoursStart,
        quietHoursEnd: users.quietHoursEnd,
        mutedGames: users.mutedGames,
      })
      .from(userSubscriptions)
      .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
      .innerJoin(users, eq(userSubscriptions.discordId, users.discordId))
      .where(
        and(
          eq(users.premium, true),
          sql`(${teams.name} ILIKE '%' || ${winningTeam} || '%' OR ${teams.name} ILIKE '%' || ${losingTeam} || '%')`,
          eq(teams.game, match.game),
        ),
      );

    const emoji = GAME_EMOJI[match.game] ?? ":trophy:";

    for (const userPrefs of premiumSubs) {
      const { discordId } = userPrefs;
      if (isGameMuted(match.game, userPrefs.mutedGames)) continue;
      if (isQuietHoursActive(userPrefs.timezone, userPrefs.quietHoursStart, userPrefs.quietHoursEnd)) {
        continue;
      }
      const key = `upset:${discordId}:${match.id}`;
      if (sentCache.has(key)) continue;
      sentCache.add(key);

      try {
        const user = await client.users.fetch(discordId);
        const messageLines = [
          `**Upset Alert!** ${emoji}`,
          "",
          `**${winningTeam}** (${underdogOdds.toFixed(2)} underdog) is beating **${losingTeam}** ${t1Score}-${t2Score}!`,
          `Game: ${match.game.toUpperCase()} — ${match.tournament}`,
        ];

        if (match.streamUrl) {
          messageLines.push(`[Watch Live](${match.streamUrl})`);
        }

        await user.send({
          content: messageLines.join("\n"),
        });
        logger.info({ discordId, matchId: match.id }, "Upset alert sent");
      } catch {
        logger.warn({ discordId }, "Failed to send upset alert DM");
      }
    }
  }
}

export async function checkLineMovementAlerts(
  db: Database,
  client: Client,
  sentCache: Set<string>,
): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const recentOdds = await db
    .select()
    .from(odds)
    .innerJoin(matches, eq(odds.matchId, matches.id))
    .where(
      and(
        eq(matches.status, "upcoming"),
        eq(odds.market, "moneyline"),
        gte(matches.startTime, new Date()),
      ),
    );

  for (const row of recentOdds) {
    const history = await db
      .select()
      .from(oddsHistory)
      .where(
        and(
          eq(oddsHistory.matchId, row.odds.matchId),
          eq(oddsHistory.bookmaker, row.odds.bookmaker),
          eq(oddsHistory.market, "moneyline"),
          lte(oddsHistory.fetchedAt, cutoff),
        ),
      )
      .orderBy(sql`${oddsHistory.fetchedAt} DESC`)
      .limit(1);

    if (history.length === 0) continue;

    const prev = history[0];
    const shift1 = Math.abs(row.odds.team1Odds - prev.team1Odds);
    const shift2 = Math.abs(row.odds.team2Odds - prev.team2Odds);

    if (shift1 < 0.3 && shift2 < 0.3) continue;

    const biggerShiftTeam =
      shift1 >= shift2 ? row.matches.team1 : row.matches.team2;
    const oldOdds = shift1 >= shift2 ? prev.team1Odds : prev.team2Odds;
    const newOdds =
      shift1 >= shift2 ? row.odds.team1Odds : row.odds.team2Odds;
    const direction = newOdds > oldOdds ? "lengthened" : "shortened";

    const premiumSubs = await db
      .select({
        discordId: userSubscriptions.discordId,
        timezone: users.timezone,
        quietHoursStart: users.quietHoursStart,
        quietHoursEnd: users.quietHoursEnd,
        mutedGames: users.mutedGames,
      })
      .from(userSubscriptions)
      .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
      .innerJoin(users, eq(userSubscriptions.discordId, users.discordId))
      .where(
        and(
          eq(users.premium, true),
          sql`(${teams.name} ILIKE '%' || ${row.matches.team1} || '%' OR ${teams.name} ILIKE '%' || ${row.matches.team2} || '%')`,
          eq(teams.game, row.matches.game),
        ),
      );

    const emoji = GAME_EMOJI[row.matches.game] ?? ":trophy:";

    for (const userPrefs of premiumSubs) {
      const { discordId } = userPrefs;
      if (isGameMuted(row.matches.game, userPrefs.mutedGames)) continue;
      if (isQuietHoursActive(userPrefs.timezone, userPrefs.quietHoursStart, userPrefs.quietHoursEnd)) {
        continue;
      }
      const key = `line:${discordId}:${row.odds.matchId}:${row.odds.bookmaker}`;
      if (sentCache.has(key)) continue;
      sentCache.add(key);

      try {
        const user = await client.users.fetch(discordId);
        const messageLines = [
          `**Line Movement Alert!** ${emoji}`,
          "",
          `**${row.matches.team1}** vs **${row.matches.team2}**`,
          `${row.odds.bookmaker}: **${biggerShiftTeam}** odds ${direction} from ${oldOdds.toFixed(2)} → ${newOdds.toFixed(2)}`,
          `Game: ${row.matches.game.toUpperCase()} — ${row.matches.tournament}`,
        ];

        if (row.matches.streamUrl) {
          messageLines.push(`[Watch Live](${row.matches.streamUrl})`);
        }

        await user.send({
          content: messageLines.join("\n"),
        });
        logger.info({ discordId, matchId: row.odds.matchId }, "Line movement alert sent");
      } catch {
        logger.warn({ discordId }, "Failed to send line movement DM");
      }
    }
  }
}
