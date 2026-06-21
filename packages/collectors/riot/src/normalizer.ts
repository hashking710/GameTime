import { Game, MatchStatus, type UnifiedMatch } from "@gametime/shared";

export interface RiotRawMatch {
  id: string;
  team1: { code: string; name: string };
  team2: { code: string; name: string };
  league: { name: string };
  startTime: string;
  state: string;
  streams?: { provider: string; parameter: string }[];
}

export function normalizeRiotMatch(raw: RiotRawMatch): UnifiedMatch {
  const startTime = new Date(raw.startTime);
  let status: MatchStatus;
  if (raw.state === "inProgress") status = MatchStatus.LIVE;
  else if (raw.state === "completed") status = MatchStatus.COMPLETED;
  else status = MatchStatus.UPCOMING;

  const twitchStream = raw.streams?.find((s) => s.provider === "twitch");

  return {
    game: Game.LOL,
    team1Name: raw.team1.name,
    team2Name: raw.team2.name,
    tournament: raw.league.name,
    startTime,
    status,
    streamUrl: twitchStream
      ? `https://twitch.tv/${twitchStream.parameter}`
      : undefined,
    source: "riot",
    sourceId: raw.id,
  };
}
