import { type Game, MatchStatus, type UnifiedMatch } from "@gametime/shared";

export interface SportsDbRawEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strLeague: string;
  strTimestamp: string;
  dateEvent: string;
  strTime: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strVideo: string | null;
}

export const SPORTSDB_LEAGUE_MAP: Record<string, Game> = {
  "4391": "nfl",
  "4387": "nba",
  "4424": "mlb",
  "4380": "nhl",
  "4328": "soccer",
  "4443": "ufc",
};

export function normalizeSportsDbEvent(
  raw: SportsDbRawEvent,
  game: Game,
): UnifiedMatch {
  const startTime = raw.strTimestamp
    ? new Date(raw.strTimestamp)
    : new Date(`${raw.dateEvent}T${raw.strTime || "00:00:00"}Z`);

  let status: MatchStatus;
  if (raw.strStatus === "Match Finished" || raw.intHomeScore !== null) {
    status = MatchStatus.COMPLETED;
  } else if (
    raw.strStatus === "In Progress" ||
    raw.strStatus === "Live"
  ) {
    status = MatchStatus.LIVE;
  } else {
    status = MatchStatus.UPCOMING;
  }

  return {
    game,
    team1Name: raw.strHomeTeam,
    team2Name: raw.strAwayTeam,
    team1Score: raw.intHomeScore ? parseInt(raw.intHomeScore) : undefined,
    team2Score: raw.intAwayScore ? parseInt(raw.intAwayScore) : undefined,
    tournament: raw.strLeague,
    startTime,
    status,
    streamUrl: raw.strVideo ?? undefined,
    source: "sportsdb",
    sourceId: raw.idEvent,
  };
}
