import { Game, MatchStatus, type UnifiedMatch } from "@gametime/shared";

export interface VlrRawMatch {
  id: string;
  team1: string;
  team2: string;
  tournament: string;
  date: string;
  status: string;
}

export function normalizeVlrMatch(raw: VlrRawMatch): UnifiedMatch {
  const startTime = new Date(raw.date);
  return {
    game: Game.VALORANT,
    team1Name: raw.team1,
    team2Name: raw.team2,
    tournament: raw.tournament,
    startTime,
    status:
      raw.status === "live"
        ? MatchStatus.LIVE
        : startTime.getTime() < Date.now()
          ? MatchStatus.COMPLETED
          : MatchStatus.UPCOMING,
    source: "vlr",
    sourceId: raw.id,
  };
}
