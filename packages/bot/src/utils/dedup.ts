import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";
import { normalizeTeamName } from "./team-name";
import { isEsport } from "@gametime/shared";

type Match = InferSelectModel<typeof matches>;

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

    const winner = pickBetter(existing, match);
    if (winner !== existing) {
      // Carry logos from the loser if winner lacks them
      if (!hasImages(winner) && hasImages(existing)) {
        const winnerDetails = (winner.details ?? {}) as Record<string, unknown>;
        const existingDetails = (existing.details ?? {}) as Record<string, unknown>;
        winnerDetails.team1Logo = winnerDetails.team1Logo ?? existingDetails.team1Logo;
        winnerDetails.team2Logo = winnerDetails.team2Logo ?? existingDetails.team2Logo;
        (winner as any).details = winnerDetails;
      }
      groups.set(key, winner);
    } else if (!hasImages(existing) && hasImages(match)) {
      // Even if existing wins, grab logos from the new match
      const existingDetails = (existing.details ?? {}) as Record<string, unknown>;
      const matchDetails = (match.details ?? {}) as Record<string, unknown>;
      existingDetails.team1Logo = existingDetails.team1Logo ?? matchDetails.team1Logo;
      existingDetails.team2Logo = existingDetails.team2Logo ?? matchDetails.team2Logo;
      (existing as any).details = existingDetails;
    }
  }

  return Array.from(groups.values());
}

function pickBetter(a: Match, b: Match): Match {
  const esport = isEsport(a.game as any);
  const priorities = esport ? ESPORTS_SOURCE_PRIORITY : SPORTS_SOURCE_PRIORITY;

  const aHasScore = (a.team1Score ?? 0) + (a.team2Score ?? 0) > 0;
  const bHasScore = (b.team1Score ?? 0) + (b.team2Score ?? 0) > 0;
  if (bHasScore && !aHasScore) return b;
  if (aHasScore && !bHasScore) return a;

  const aHasGameDetails = hasGameDetails(a);
  const bHasGameDetails = hasGameDetails(b);
  if (bHasGameDetails && !aHasGameDetails) return b;
  if (aHasGameDetails && !bHasGameDetails) return a;

  const aPriority = priorities[a.source] ?? 0;
  const bPriority = priorities[b.source] ?? 0;
  if (bPriority > aPriority) return b;

  return a;
}

function hasGameDetails(match: Match): boolean {
  if (!match.details) return false;
  const d = match.details as Record<string, unknown>;
  const games = d.games as unknown[];
  const periods = d.periods as unknown[];
  return (games?.length ?? 0) > 0 || (periods?.length ?? 0) > 0 || d.clock != null;
}

function hasImages(match: Match): boolean {
  if (!match.details) return false;
  const details = match.details as Record<string, unknown>;
  return Boolean(details.team1Logo || details.team2Logo);
}

function getDedupKey(match: Match): string {
  const startMs = new Date(match.startTime).getTime();
  const date = Number.isFinite(startMs)
    ? new Date(startMs).toISOString().split("T")[0]
    : "1970-01-01";
  const names = [normalizeTeamName(match.team1), normalizeTeamName(match.team2)].sort();
  return `${match.game}:${names[0]}:${names[1]}:${date}`;
}
