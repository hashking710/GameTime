import { BaseCollector } from "@gametime/collector-base";
import { matches as dbMatches } from "@gametime/db";
import { eq, and, or, sql } from "drizzle-orm";
import {
  MatchStatus,
  PANDASCORE_GAME_MAP,
  type UnifiedMatch,
  type MatchDetails,
  type MatchSubGame,
  sanitizeImageUrl,
} from "@gametime/shared";

const PANDASCORE_STATUS_MAP: Record<string, MatchStatus> = {
  not_started: MatchStatus.UPCOMING,
  running: MatchStatus.LIVE,
  finished: MatchStatus.COMPLETED,
  canceled: MatchStatus.COMPLETED,
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getScoreEntryTeamId(entry: unknown): number | undefined {
  if (!isRecord(entry)) return undefined;
  return asNumber(entry.team_id) ?? asNumber(entry.id);
}

function getScoreEntryValue(entry: unknown, key: "score" | "kills"): number | undefined {
  if (!isRecord(entry)) return undefined;
  return asNumber(entry[key]);
}

export class PandaScoreMatchCollector extends BaseCollector {
  private apiKey: string;

  constructor(
    name: string,
    db: ConstructorParameters<typeof BaseCollector>[1],
    redis: ConstructorParameters<typeof BaseCollector>[2],
    schedule: string,
    apiKey: string,
  ) {
    super(name, db, redis, schedule);
    this.apiKey = apiKey;
  }

  async collect(): Promise<UnifiedMatch[]> {
    const allMatches: UnifiedMatch[] = [];

    const endpoints = [
      "matches/upcoming?per_page=100",
      "matches/running?per_page=50",
      "matches/past?per_page=100&sort=-begin_at",
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(
          `https://api.pandascore.co/${endpoint}&token=${this.apiKey}`,
        );

        if (!response.ok) {
          this.logger.warn(
            { endpoint, status: response.status },
            "PandaScore match fetch failed",
          );
          continue;
        }

        const payload = await response.json();
        const matches = asArray(payload);

        for (const match of matches) {
          if (!isRecord(match)) continue;

          const videogame = isRecord(match.videogame) ? match.videogame : undefined;
          const gameSlug = asString(videogame?.slug);
          if (!gameSlug) continue;

          const game = PANDASCORE_GAME_MAP[gameSlug];
          if (!game) continue;

          const opponentEntries = asArray(match.opponents)
            .map((entry) => (isRecord(entry) && isRecord(entry.opponent) ? entry.opponent : undefined))
            .filter((entry): entry is UnknownRecord => isRecord(entry));

          if (opponentEntries.length < 2) continue;

          const team1 = opponentEntries[0];
          const team2 = opponentEntries[1];

          const team1Id = asNumber(team1.id);
          const team2Id = asNumber(team2.id);
          const team1Name = asString(team1.name);
          const team2Name = asString(team2.name);
          if (!team1Name || !team2Name) continue;

          const streams = asArray(match.streams_list)
            .filter((entry): entry is UnknownRecord => isRecord(entry));
          const stream = streams.find(
            (s) => asBoolean(s.main) === true && asString(s.language)?.toLowerCase() === "en",
          ) ?? streams[0];

          const results = asArray(match.results)
            .filter((entry): entry is UnknownRecord => isRecord(entry));
          const team1Result = team1Id === undefined
            ? undefined
            : results.find((r) => asNumber(r.team_id) === team1Id);
          const team2Result = team2Id === undefined
            ? undefined
            : results.find((r) => asNumber(r.team_id) === team2Id);

          const matchType = asString(match.match_type);
          const numberOfGames = asNumber(match.number_of_games);
          const matchId = asNumber(match.id);

          const details: MatchDetails = {
            format: matchType === "best_of" && numberOfGames
              ? `bo${numberOfGames}`
              : matchType,
            team1Logo: sanitizeImageUrl(asString(team1.image_url)),
            team2Logo: sanitizeImageUrl(asString(team2.image_url)),
            externalEventId: matchId,
          };

          const matchGames = asArray(match.games)
            .filter((entry): entry is UnknownRecord => isRecord(entry));
          if (matchGames.length > 0) {
            const opponentMap = new Map<number, string>();
            if (team1Id !== undefined) opponentMap.set(team1Id, team1Name);
            if (team2Id !== undefined) opponentMap.set(team2Id, team2Name);

            details.games = matchGames.map((g, index): MatchSubGame => {
              const scoreEntries = asArray(g.scores).length > 0
                ? asArray(g.scores)
                : asArray(g.teams);
              const team1Stats = scoreEntries.find((entry) => getScoreEntryTeamId(entry) === team1.id);
              const team2Stats = scoreEntries.find((entry) => getScoreEntryTeamId(entry) === team2.id);

              const gameStatus = asString(g.status)?.toLowerCase();
              const gameFinished = asBoolean(g.finished) ?? gameStatus === "finished";
              const winner = isRecord(g.winner) ? g.winner : undefined;
              const winnerId = asNumber(winner?.id);

              return {
                position: asNumber(g.position) ?? index + 1,
                status: gameFinished
                  ? "finished"
                  : gameStatus === "running"
                  ? "running"
                  : "not_started",
                winnerName: winnerId !== undefined ? opponentMap.get(winnerId) : undefined,
                duration: asNumber(g.length),
                team1Score: getScoreEntryValue(team1Stats, "score"),
                team2Score: getScoreEntryValue(team2Stats, "score"),
                team1Kills: getScoreEntryValue(team1Stats, "kills"),
                team2Kills: getScoreEntryValue(team2Stats, "kills"),
              };
            });
          }

          const beginAt = asString(match.begin_at) ?? asString(match.scheduled_at);
          if (!beginAt) continue;
          const startTime = new Date(beginAt);
          if (Number.isNaN(startTime.getTime())) continue;

          const league = isRecord(match.league) ? match.league : undefined;
          const tournament = isRecord(match.tournament) ? match.tournament : undefined;
          const leagueName = asString(league?.name);
          const tournamentName = asString(tournament?.name);
          const tournamentLabel = leagueName && tournamentName
            ? `${leagueName} - ${tournamentName}`
            : leagueName ?? tournamentName ?? "Unknown tournament";

          const statusKey = asString(match.status)?.toLowerCase();
          const sourceId = matchId !== undefined ? String(matchId) : undefined;
          if (!sourceId) continue;

          const normalizedStatus = statusKey
            ? PANDASCORE_STATUS_MAP[statusKey]
            : undefined;

          allMatches.push({
            game,
            team1Name,
            team2Name,
            team1Score: getScoreEntryValue(team1Result, "score"),
            team2Score: getScoreEntryValue(team2Result, "score"),
            tournament: tournamentLabel,
            startTime,
            status: normalizedStatus ?? MatchStatus.UPCOMING,
            streamUrl: stream ? asString(stream.raw_url) : undefined,
            source: "pandascore",
            sourceId,
            details,
            team1Logo: sanitizeImageUrl(asString(team1.image_url)),
            team2Logo: sanitizeImageUrl(asString(team2.image_url)),
          });
        }
      } catch (err) {
        this.logger.error({ err, endpoint }, "PandaScore match fetch error");
      }
    }

    // Repair: re-fetch matches stuck with incomplete data
    await this.repairIncomplete(allMatches);

    this.logger.debug({ count: allMatches.length }, "Fetched PandaScore matches");
    return allMatches;
  }

  private async repairIncomplete(allMatches: UnifiedMatch[]): Promise<void> {
    const knownIds = new Set(allMatches.map((m) => m.sourceId));

    // Find matches that might have incomplete data:
    // completed/live with missing map winners or stale game arrays
    const incomplete = await this.db
      .select({ sourceId: dbMatches.sourceId })
      .from(dbMatches)
      .where(
        and(
          eq(dbMatches.source, "pandascore"),
          or(eq(dbMatches.status, "live"), eq(dbMatches.status, "completed")),
          sql`${dbMatches.updatedAt} > NOW() - INTERVAL '24 hours'`,
          sql`(
            ${dbMatches.details}->'games' IS NULL
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(${dbMatches.details}->'games') g
              WHERE g->>'status' IN ('running', 'not_started')
            )
          )`,
        ),
      )
      .limit(30);

    for (const row of incomplete) {
      if (knownIds.has(row.sourceId)) continue;

      try {
        const response = await fetch(
          `https://api.pandascore.co/matches/${row.sourceId}?token=${this.apiKey}`,
        );
        if (!response.ok) continue;

        const match = await response.json();
        const parsed = this.parseMatch(match as UnknownRecord);
        if (parsed) allMatches.push(parsed);
      } catch {
        // Skip failed individual fetches
      }
    }
  }

  private parseMatch(match: UnknownRecord): UnifiedMatch | null {
    const opponentEntries = asArray(match.opponents)
      .filter((entry): entry is UnknownRecord => isRecord(entry))
      .map((entry) => {
        const opponent = isRecord(entry.opponent) ? entry.opponent : entry;
        return {
          id: asNumber(opponent.id),
          name: asString(opponent.name),
          image_url: asString(opponent.image_url),
        };
      });

    if (opponentEntries.length < 2) return null;

    const team1 = opponentEntries[0];
    const team2 = opponentEntries[1];
    const team1Id = asNumber(team1.id);
    const team2Id = asNumber(team2.id);
    const team1Name = asString(team1.name);
    const team2Name = asString(team2.name);
    if (!team1Name || !team2Name) return null;

    const videogame = isRecord(match.videogame) ? match.videogame : undefined;
    const slug = asString(videogame?.slug);
    const game = slug ? PANDASCORE_GAME_MAP[slug] : undefined;
    if (!game) return null;

    const results = asArray(match.results).filter((e): e is UnknownRecord => isRecord(e));
    const team1Result = team1Id !== undefined ? results.find((r) => asNumber(r.team_id) === team1Id) : undefined;
    const team2Result = team2Id !== undefined ? results.find((r) => asNumber(r.team_id) === team2Id) : undefined;

    const matchGames = asArray(match.games).filter((e): e is UnknownRecord => isRecord(e));
    const opponentMap = new Map<number, string>();
    if (team1Id !== undefined) opponentMap.set(team1Id, team1Name);
    if (team2Id !== undefined) opponentMap.set(team2Id, team2Name);

    const details: MatchDetails = {
      format: asString(match.match_type) === "best_of" ? `bo${asNumber(match.number_of_games)}` : asString(match.match_type),
      team1Logo: sanitizeImageUrl(asString(team1.image_url)),
      team2Logo: sanitizeImageUrl(asString(team2.image_url)),
      externalEventId: asNumber(match.id),
    };

    if (matchGames.length > 0) {
      details.games = matchGames.map((g, index): MatchSubGame => {
        const winner = isRecord(g.winner) ? g.winner : undefined;
        const winnerId = asNumber(winner?.id);
        return {
          position: asNumber(g.position) ?? index + 1,
          status: asBoolean(g.finished) ? "finished" : asString(g.status) === "running" ? "running" : "not_started",
          winnerName: winnerId !== undefined ? opponentMap.get(winnerId) : undefined,
          duration: asNumber(g.length),
        };
      });
    }

    const league = isRecord(match.league) ? match.league : undefined;
    const tournament = isRecord(match.tournament) ? match.tournament : undefined;
    const leagueName = asString(league?.name);
    const tournamentName = asString(tournament?.name);

    const statusKey = asString(match.status)?.toLowerCase();
    const matchId = asNumber(match.id);

    const streams = asArray(match.streams_list).filter((e): e is UnknownRecord => isRecord(e));
    const stream = streams.find((s) => asBoolean(s.main) && asString(s.language)?.toLowerCase() === "en") ?? streams[0];
    const beginAt = asString(match.begin_at) ?? asString(match.scheduled_at);
    if (!beginAt) return null;

    return {
      game,
      team1Name,
      team2Name,
      team1Score: getScoreEntryValue(team1Result, "score"),
      team2Score: getScoreEntryValue(team2Result, "score"),
      tournament: leagueName && tournamentName ? `${leagueName} - ${tournamentName}` : leagueName ?? tournamentName ?? "Unknown",
      startTime: new Date(beginAt),
      status: statusKey ? (PANDASCORE_STATUS_MAP[statusKey] ?? MatchStatus.UPCOMING) : MatchStatus.UPCOMING,
      streamUrl: asString(stream?.raw_url),
      source: "pandascore",
      sourceId: String(matchId),
      details,
      team1Logo: sanitizeImageUrl(asString(team1.image_url)),
      team2Logo: sanitizeImageUrl(asString(team2.image_url)),
    };
  }
}
