import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";

type Match = InferSelectModel<typeof matches>;

const SOURCE_PRIORITY: Record<string, number> = {
  pandascore: 10,
  espn: 9,
  opendota: 8,
  sportsdb: 7,
  theoddsapi: 6,
  vlr: 5,
};

export function deduplicateMatches(all: Match[]): Match[] {
  const groups = new Map<string, Match>();

  for (const match of all) {
    const dateKey = new Date(match.startTime).toISOString().slice(0, 10);
    const names = [match.team1.toLowerCase(), match.team2.toLowerCase()].sort();
    const key = `${match.game}:${names[0]}:${names[1]}:${dateKey}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, match);
      continue;
    }

    const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
    const newPriority = SOURCE_PRIORITY[match.source] ?? 0;

    const existingHasDetails = existing.details != null;
    const newHasDetails = match.details != null;
    const existingHasScore = (existing.team1Score ?? 0) + (existing.team2Score ?? 0) > 0;
    const newHasScore = (match.team1Score ?? 0) + (match.team2Score ?? 0) > 0;

    if (
      (newHasDetails && !existingHasDetails) ||
      (newHasScore && !existingHasScore) ||
      (!existingHasDetails && !existingHasScore && newPriority > existingPriority)
    ) {
      groups.set(key, match);
    }
  }

  return Array.from(groups.values());
}
