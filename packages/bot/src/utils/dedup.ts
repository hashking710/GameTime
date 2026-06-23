import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";
import { normalizeTeamName } from "./team-name";
import { isEsport } from "@gametime/shared";

type Match = InferSelectModel<typeof matches>;
type Details = Record<string, unknown>;

const ESPORTS_SOURCE_PRIORITY: Record<string, number> = {
  vlr: 10,
  opendota: 10,
  pandascore: 7,
  theoddsapi: 3,
};

const SPORTS_SOURCE_PRIORITY: Record<string, number> = {
  espn: 10,
  sportsdb: 7,
  theoddsapi: 5,
  pandascore: 3,
};

export function deduplicateMatches(all: Match[]): Match[] {
  const groups = new Map<string, Match>();

  for (const match of all) {
    const key = getDedupKey(match);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, match);
      continue;
    }

    groups.set(key, mergeMatches(existing, match));
  }

  return Array.from(groups.values());
}

function mergeMatches(a: Match, b: Match): Match {
  const esport = isEsport(a.game as any);
  const priorities = esport ? ESPORTS_SOURCE_PRIORITY : SPORTS_SOURCE_PRIORITY;
  const aPri = priorities[a.source] ?? 0;
  const bPri = priorities[b.source] ?? 0;

  // Start with the higher-priority source as the base
  const base = bPri > aPri ? { ...b } : { ...a };
  const other = bPri > aPri ? a : b;

  // Prefer whichever has actual scores
  const baseHasScore = (base.team1Score ?? 0) + (base.team2Score ?? 0) > 0;
  const otherHasScore = (other.team1Score ?? 0) + (other.team2Score ?? 0) > 0;
  if (otherHasScore && !baseHasScore) {
    base.team1Score = other.team1Score;
    base.team2Score = other.team2Score;
  }

  // Prefer whichever has a stream URL
  if (!base.streamUrl && other.streamUrl) {
    base.streamUrl = other.streamUrl;
  }

  // Merge details — combine the best fields from both
  const baseDetails = (base.details ?? {}) as Details;
  const otherDetails = (other.details ?? {}) as Details;
  const merged: Details = { ...baseDetails };

  // Logos: prefer PandaScore CDN, then ESPN CDN
  if (!merged.team1Logo && otherDetails.team1Logo) merged.team1Logo = otherDetails.team1Logo;
  if (!merged.team2Logo && otherDetails.team2Logo) merged.team2Logo = otherDetails.team2Logo;

  // Format (bo3/bo5): PandaScore has this
  if (!merged.format && otherDetails.format) merged.format = otherDetails.format;

  // Game clock: ESPN has this
  if (!merged.clock && otherDetails.clock) merged.clock = otherDetails.clock;
  if (!merged.situation && otherDetails.situation) merged.situation = otherDetails.situation;

  // Periods (box scores): ESPN has this
  const basePeriods = merged.periods as unknown[] | undefined;
  const otherPeriods = otherDetails.periods as unknown[] | undefined;
  if ((!basePeriods || basePeriods.length === 0) && otherPeriods && otherPeriods.length > 0) {
    merged.periods = otherPeriods;
  }

  // Games/maps: pick whichever has more detail (winners > round scores > positions only)
  const baseGames = merged.games as unknown[] | undefined;
  const otherGames = otherDetails.games as unknown[] | undefined;
  if (baseGames && otherGames) {
    const baseQuality = gamesDetailQuality(baseGames);
    const otherQuality = gamesDetailQuality(otherGames);
    if (otherQuality > baseQuality) {
      merged.games = otherGames;
    }
  } else if (!baseGames && otherGames) {
    merged.games = otherGames;
  }

  // Kill stats: OpenDota has this
  if (otherDetails.team1Kills != null && merged.team1Kills == null) {
    merged.team1Kills = otherDetails.team1Kills;
    merged.team2Kills = otherDetails.team2Kills;
  }

  // External event ID
  if (!merged.externalEventId && otherDetails.externalEventId) {
    merged.externalEventId = otherDetails.externalEventId;
  }

  (base as any).details = merged;
  return base;
}

function gamesDetailQuality(games: unknown[]): number {
  let score = 0;
  for (const g of games) {
    const game = g as Record<string, unknown>;
    if (game.winnerName) score += 3;
    if (game.duration) score += 2;
    if (game.team1Score != null || game.team2Score != null) score += 2;
    if (game.team1Kills != null) score += 1;
    if (game.status === "finished" || game.status === "running") score += 1;
  }
  return score;
}

function getDedupKey(match: Match): string {
  const startMs = new Date(match.startTime).getTime();
  const date = Number.isFinite(startMs)
    ? new Date(startMs).toISOString().split("T")[0]
    : "1970-01-01";
  const names = [normalizeTeamName(match.team1), normalizeTeamName(match.team2)].sort();
  return `${match.game}:${names[0]}:${names[1]}:${date}`;
}
