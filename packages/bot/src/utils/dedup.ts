import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";
import { normalizeTeamName } from "./team-name";

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
    const key = getDedupKey(match);

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
    
    // Check for image/logo data in both matches
    const existingHasImages = hasImages(existing);
    const newHasImages = hasImages(match);

    // Prefer match with images (especially for esports like Valorant)
    if (newHasImages && !existingHasImages) {
      groups.set(key, match);
      continue;
    }

    // If both have or both lack images, use other criteria
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

function hasImages(match: Match): boolean {
  // Check for team logos in details
  if (match.details) {
    const details = match.details as Record<string, unknown>;
    if (details.team1Logo || details.team2Logo) {
      return true;
    }
  }
  return false;
}

function getDedupKey(match: Match): string {
  // Use date-based bucketing so same teams on same calendar day are deduplicated,
  // regardless of exact time or source reporting delay
  const startMs = new Date(match.startTime).getTime();
  const date = Number.isFinite(startMs)
    ? new Date(startMs).toISOString().split("T")[0]
    : "1970-01-01";
  const names = [normalizeTeamName(match.team1), normalizeTeamName(match.team2)].sort();
  return `${match.game}:${names[0]}:${names[1]}:${date}`;
}
