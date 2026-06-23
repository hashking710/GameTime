import test from "node:test";
import assert from "node:assert/strict";
import type { InferSelectModel } from "drizzle-orm";
import { matches } from "@gametime/db";
import { deduplicateMatches } from "../src/utils/dedup";

type Match = InferSelectModel<typeof matches>;

function buildMatch(overrides: Partial<Match>): Match {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    game: overrides.game ?? "cs2",
    team1: overrides.team1 ?? "Team A",
    team2: overrides.team2 ?? "Team B",
    team1Score: overrides.team1Score ?? null,
    team2Score: overrides.team2Score ?? null,
    tournament: overrides.tournament ?? "Tournament",
    startTime: overrides.startTime ?? new Date("2026-01-01T10:00:00.000Z"),
    status: overrides.status ?? "upcoming",
    streamUrl: overrides.streamUrl ?? null,
    details: overrides.details ?? null,
    source: overrides.source ?? "pandascore",
    sourceId: overrides.sourceId ?? crypto.randomUUID(),
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
  };
}

test("deduplicateMatches keeps separate matches that are far apart", () => {
  const morning = buildMatch({
    source: "sportsdb",
    sourceId: "morning",
    startTime: new Date("2026-01-01T08:00:00.000Z"),
  });
  const evening = buildMatch({
    source: "espn",
    sourceId: "evening",
    startTime: new Date("2026-01-01T17:30:00.000Z"),
  });

  const deduped = deduplicateMatches([morning, evening]);
  assert.equal(deduped.length, 2);
});

test("deduplicateMatches prefers richer entry within same time bucket", () => {
  const plain = buildMatch({
    source: "sportsdb",
    sourceId: "sportsdb-1",
    startTime: new Date("2026-01-01T09:00:00.000Z"),
  });
  const rich = buildMatch({
    source: "pandascore",
    sourceId: "pandascore-1",
    startTime: new Date("2026-01-01T09:20:00.000Z"),
    team1Score: 1,
    team2Score: 0,
    details: { format: "bo3" },
  });

  const [selected] = deduplicateMatches([plain, rich]);
  assert.equal(selected.source, "pandascore");
  assert.equal(selected.team1Score, 1);
});

test("deduplicateMatches uses external event id when available", () => {
  const first = buildMatch({
    sourceId: "sportsdb-111",
    details: { externalEventId: "evt-123" },
  });
  const second = buildMatch({
    sourceId: "espn-222",
    details: { externalEventId: "evt-123" },
    team1Score: 2,
    team2Score: 1,
  });

  const deduped = deduplicateMatches([first, second]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].team1Score, 2);
});
