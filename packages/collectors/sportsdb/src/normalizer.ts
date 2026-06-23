import { type Game, MatchStatus, type UnifiedMatch, sanitizeImageUrl } from "@gametime/shared";

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
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
}

export const SPORTSDB_LEAGUE_MAP: Record<string, Game> = {
  "4391": "nfl",
  "4387": "nba",
  "4424": "mlb",
  "4380": "nhl",
  "4328": "soccer",
  "4429": "soccer",
  "4480": "soccer",
  "4346": "soccer",
  "4334": "soccer",
  "4332": "soccer",
  "4443": "ufc",
};

export function normalizeSportsDbEvent(
  raw: SportsDbRawEvent,
  game: Game,
): UnifiedMatch {
  const team1Logo = sanitizeImageUrl(raw.strHomeTeamBadge);
  const team2Logo = sanitizeImageUrl(raw.strAwayTeamBadge);

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
    details: {
      externalEventId: raw.idEvent,
      ...(team1Logo ? { team1Logo } : {}),
      ...(team2Logo ? { team2Logo } : {}),
    },
    source: "sportsdb",
    sourceId: raw.idEvent,
  };
}
