import { Game, MatchStatus, type UnifiedMatch } from "@gametime/shared";

export interface OpenDotaRawMatch {
  match_id: number;
  radiant_name: string;
  dire_name: string;
  league_name: string;
  start_time: number;
  radiant_score?: number;
  dire_score?: number;
}

export function normalizeOpenDotaMatch(raw: OpenDotaRawMatch): UnifiedMatch {
  const startTime = new Date(raw.start_time * 1000);
  return {
    game: Game.DOTA2,
    team1Name: raw.radiant_name || "TBD",
    team2Name: raw.dire_name || "TBD",
    team1Score: raw.radiant_score,
    team2Score: raw.dire_score,
    tournament: raw.league_name,
    startTime,
    status:
      startTime.getTime() > Date.now()
        ? MatchStatus.UPCOMING
        : MatchStatus.COMPLETED,
    source: "opendota",
    sourceId: String(raw.match_id),
  };
}
