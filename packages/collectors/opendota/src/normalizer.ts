import { Game, MatchStatus, type UnifiedMatch } from "@gametime/shared";

export interface OpenDotaRawMatch {
  match_id: number;
  radiant_name: string;
  dire_name: string;
  league_name: string;
  start_time: number;
  radiant_score?: number;
  dire_score?: number;
  radiant_win?: boolean | null;
}

export function normalizeOpenDotaMatch(raw: OpenDotaRawMatch): UnifiedMatch {
  const startTime = new Date(raw.start_time * 1000);
  const completedScore =
    raw.radiant_win == null
      ? undefined
      : raw.radiant_win
        ? { team1Score: 1, team2Score: 0 }
        : { team1Score: 0, team2Score: 1 };
  return {
    game: Game.DOTA2,
    team1Name: raw.radiant_name || "TBD",
    team2Name: raw.dire_name || "TBD",
    ...(completedScore ?? {}),
    tournament: raw.league_name,
    startTime,
    status:
      startTime.getTime() > Date.now()
        ? MatchStatus.UPCOMING
        : MatchStatus.COMPLETED,
    details: {
      externalEventId: raw.match_id,
      team1Kills: raw.radiant_score,
      team2Kills: raw.dire_score,
    },
    source: "opendota",
    sourceId: String(raw.match_id),
  };
}
