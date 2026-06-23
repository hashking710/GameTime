import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";
import { normalizeTeamName } from "./team-name";

type Match = InferSelectModel<typeof matches>;
const TIME_BUCKET_MS = 2 * 60 * 60 * 1000;

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

function getDedupKey(match: Match): string {
  const externalId = findExternalEventId(match.details);
  if (externalId) {
    return `${match.game}:external:${externalId}`;
  }

  const startMs = new Date(match.startTime).getTime();
  const timeBucket = Number.isFinite(startMs)
    ? Math.floor(startMs / TIME_BUCKET_MS)
    : 0;
  const names = [normalizeTeamName(match.team1), normalizeTeamName(match.team2)].sort();
  return `${match.game}:${names[0]}:${names[1]}:${timeBucket}`;
}

function findExternalEventId(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;

  const record = details as Record<string, unknown>;
  const knownKeys = [
    "externalEventId",
    "eventId",
    "event_id",
    "matchId",
    "match_id",
    "fixtureId",
    "fixture_id",
    "gameId",
  ];

  for (const key of knownKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}
