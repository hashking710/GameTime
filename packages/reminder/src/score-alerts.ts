import { and, eq, inArray, sql } from "drizzle-orm";
import { matches, teams, userSubscriptions, users } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger, GAME_EMOJI } from "@gametime/shared";
import type { MatchDetails } from "@gametime/shared";
import { isGameMuted, isQuietHoursActive } from "./preferences.js";

const logger = createLogger("score-alerts");

const ESPORT_GAMES = new Set([
  "cs2",
  "valorant",
  "lol",
  "dota2",
  "rocket_league",
  "apex",
  "rainbow_six",
  "cod",
]);

export async function checkScoreAlerts(
  db: Database,
  client: Client,
  sentCache: Set<string>,
  adminUserIds: Set<string> = new Set(),
): Promise<void> {
  const rows = await db
    .select({
      matchId: matches.id,
      team1: matches.team1,
      team2: matches.team2,
      game: matches.game,
      tournament: matches.tournament,
      status: matches.status,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
      details: matches.details,
      streamUrl: matches.streamUrl,
      discordId: userSubscriptions.discordId,
      timezone: users.timezone,
      quietHoursStart: users.quietHoursStart,
      quietHoursEnd: users.quietHoursEnd,
      mutedGames: users.mutedGames,
      premium: users.premium,
      premiumExpiresAt: users.premiumExpiresAt,
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
        inArray(matches.status, ["live", "completed"]),
        eq(users.notifyScoreUpdates, true),
      ),
    );

  for (const row of rows) {
    const {
      discordId,
      matchId,
      game,
      team1,
      team2,
      tournament,
      status,
      team1Score,
      team2Score,
      streamUrl,
    } = row;

    const isPremium =
      adminUserIds.has(discordId) ||
      (row.premium === true &&
        (row.premiumExpiresAt == null || row.premiumExpiresAt > new Date()));
    if (!isPremium) continue;

    if (isGameMuted(game, row.mutedGames)) continue;
    if (isQuietHoursActive(row.timezone, row.quietHoursStart, row.quietHoursEnd)) continue;

    const emoji = GAME_EMOJI[game] ?? ":trophy:";
    const details = (row.details ?? {}) as MatchDetails;

    if (ESPORT_GAMES.has(game)) {
      await handleEsportAlerts({
        client,
        sentCache,
        discordId,
        matchId,
        team1,
        team2,
        tournament,
        team1Score,
        team2Score,
        streamUrl,
        emoji,
        details,
      });
    } else if (details.periods?.length) {
      await handlePeriodAlert({
        client,
        sentCache,
        discordId,
        matchId,
        team1,
        team2,
        tournament,
        team1Score,
        team2Score,
        streamUrl,
        emoji,
        details,
      });
    }

    if (status === "completed") {
      await handleMatchEndAlert({
        client,
        sentCache,
        discordId,
        matchId,
        team1,
        team2,
        tournament,
        team1Score,
        team2Score,
        emoji,
      });
    }
  }
}

interface AlertContext {
  client: Client;
  sentCache: Set<string>;
  discordId: string;
  matchId: string;
  team1: string;
  team2: string;
  tournament: string;
  team1Score: number | null;
  team2Score: number | null;
  streamUrl: string | null;
  emoji: string;
  details: MatchDetails;
}

async function handleEsportAlerts(ctx: AlertContext): Promise<void> {
  const { client, sentCache, discordId, matchId, team1, team2, tournament, team1Score, team2Score, streamUrl, emoji, details } = ctx;
  const games = details.games ?? [];

  for (const g of games) {
    if (g.status !== "finished" || !g.winnerName) continue;

    const key = `score:${discordId}:${matchId}:map:${g.position}:${g.winnerName}`;
    if (sentCache.has(key)) continue;
    sentCache.add(key);

    const mapScore =
      g.team1Score != null && g.team2Score != null
        ? ` (${g.team1Score}-${g.team2Score})`
        : g.team1Kills != null && g.team2Kills != null
          ? ` (${g.team1Kills}-${g.team2Kills} kills)`
          : "";
    const seriesLine =
      team1Score != null && team2Score != null
        ? `\nSeries: **${team1} ${team1Score} — ${team2} ${team2Score}**`
        : "";

    const lines = [
      `${emoji} **Map ${g.position} — ${tournament}**`,
      `**${g.winnerName}** wins the map${mapScore}!${seriesLine}`,
    ];
    if (streamUrl) lines.push(`[Watch Live](${streamUrl})`);

    await safeDm(client, discordId, lines.join("\n"), { discordId, matchId, map: g.position }, "map result");
  }
}

async function handlePeriodAlert(ctx: AlertContext): Promise<void> {
  const { client, sentCache, discordId, matchId, team1, team2, tournament, team1Score, team2Score, streamUrl, emoji, details } = ctx;
  const periods = details.periods!;
  const latest = periods[periods.length - 1];

  const key = `score:${discordId}:${matchId}:period:${periods.length}:${latest.team1Score}-${latest.team2Score}`;
  if (sentCache.has(key)) return;
  sentCache.add(key);

  const t1Total = team1Score ?? periods.reduce((s, p) => s + p.team1Score, 0);
  const t2Total = team2Score ?? periods.reduce((s, p) => s + p.team2Score, 0);

  const lines = [
    `${emoji} **End of ${latest.label} — ${tournament}**`,
    `**${team1}** ${t1Total} — **${team2}** ${t2Total}`,
  ];
  if (streamUrl) lines.push(`[Watch Live](${streamUrl})`);

  await safeDm(client, discordId, lines.join("\n"), { discordId, matchId }, "period score");
}

interface EndAlertContext {
  client: Client;
  sentCache: Set<string>;
  discordId: string;
  matchId: string;
  team1: string;
  team2: string;
  tournament: string;
  team1Score: number | null;
  team2Score: number | null;
  emoji: string;
}

async function handleMatchEndAlert(ctx: EndAlertContext): Promise<void> {
  const { client, sentCache, discordId, matchId, team1, team2, tournament, team1Score, team2Score, emoji } = ctx;

  const key = `score:${discordId}:${matchId}:final`;
  if (sentCache.has(key)) return;
  sentCache.add(key);

  const s1 = team1Score ?? 0;
  const s2 = team2Score ?? 0;
  const resultLine =
    s1 > s2
      ? `**${team1}** wins! **${s1}-${s2}**`
      : s2 > s1
        ? `**${team2}** wins! **${s2}-${s1}**`
        : `It's a draw! **${s1}-${s2}**`;

  const lines = [
    `${emoji} **Match Over — ${tournament}**`,
    `${team1} vs ${team2}`,
    resultLine,
  ];

  await safeDm(client, discordId, lines.join("\n"), { discordId, matchId }, "match end");
}

async function safeDm(
  client: Client,
  discordId: string,
  content: string,
  logCtx: Record<string, unknown>,
  label: string,
): Promise<void> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send({ content });
    logger.info(logCtx, `${label} alert sent`);
  } catch {
    logger.warn({ discordId }, `Failed to send ${label} DM`);
  }
}
