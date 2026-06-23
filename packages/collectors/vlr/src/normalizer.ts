import {
  Game,
  MatchStatus,
  type MatchSubGame,
  type UnifiedMatch,
} from "@gametime/shared";

interface VlrMapScore {
  position: number;
  team1Score?: number;
  team2Score?: number;
  status: "finished" | "running" | "not_started";
}

export interface VlrRawMatch {
  id: string;
  team1: string;
  team2: string;
  tournament: string;
  date: string;
  status: string;
  team1Score?: number;
  team2Score?: number;
  maps?: VlrMapScore[];
}

export function normalizeVlrMatch(raw: VlrRawMatch): UnifiedMatch {
  const startTime = new Date(raw.date);
  const detailsGames: MatchSubGame[] | undefined = raw.maps?.map((m) => ({
    position: m.position,
    status: m.status,
    team1Score: m.team1Score,
    team2Score: m.team2Score,
  }));
  const seriesScore = getSeriesScore(raw.maps);
  const hasFinishedMaps = (raw.maps ?? []).some((m) => m.status === "finished");

  const normalizedStatus =
    raw.status === "live"
      ? MatchStatus.LIVE
      : raw.status === "completed" && (seriesScore != null || hasFinishedMaps)
        ? MatchStatus.COMPLETED
        : MatchStatus.UPCOMING;

  return {
    game: Game.VALORANT,
    team1Name: raw.team1,
    team2Name: raw.team2,
    ...(raw.team1Score != null || raw.team2Score != null
      ? { team1Score: raw.team1Score, team2Score: raw.team2Score }
      : seriesScore
      ? { team1Score: seriesScore.team1Score, team2Score: seriesScore.team2Score }
      : {}),
    tournament: raw.tournament,
    startTime,
    status: normalizedStatus,
    details: {
      externalEventId: raw.id,
      ...(detailsGames && detailsGames.length > 0 ? { games: detailsGames } : {}),
    },
    source: "vlr",
    sourceId: raw.id,
  };
}

function getSeriesScore(maps?: VlrMapScore[]): { team1Score: number; team2Score: number } | undefined {
  if (!maps || maps.length === 0) return undefined;

  let team1Score = 0;
  let team2Score = 0;

  for (const map of maps) {
    if (map.status !== "finished") continue;
    if (map.team1Score == null || map.team2Score == null) continue;

    if (map.team1Score > map.team2Score) {
      team1Score += 1;
    } else if (map.team2Score > map.team1Score) {
      team2Score += 1;
    }
  }

  if (team1Score === 0 && team2Score === 0) return undefined;
  return { team1Score, team2Score };
}
