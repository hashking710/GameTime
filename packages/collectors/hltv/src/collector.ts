import { BaseCollector } from "@gametime/collector-base";
import {
  MatchStatus,
  type UnifiedMatch,
  type Game,
  type MatchDetails,
  type MatchSubGame,
} from "@gametime/shared";

const PANDASCORE_GAME_MAP: Record<string, Game> = {
  "cs-go": "cs2",
  csgo: "cs2",
  valorant: "valorant",
  lol: "lol",
  "league-of-legends": "lol",
  "dota-2": "dota2",
  dota2: "dota2",
  rl: "rocket_league",
  r6siege: "rainbow_six",
  codmw: "cod",
};

const PANDASCORE_STATUS_MAP: Record<string, MatchStatus> = {
  not_started: MatchStatus.UPCOMING,
  running: MatchStatus.LIVE,
  finished: MatchStatus.COMPLETED,
  canceled: MatchStatus.COMPLETED,
};

interface PandaScoreMatchResponse {
  id: number;
  name: string;
  status: string;
  begin_at: string;
  opponents: {
    opponent: {
      id: number;
      name: string;
      acronym: string;
      image_url: string | null;
    };
  }[];
  league: { id: number; name: string };
  tournament: { name: string };
  videogame: { slug: string; name: string };
  results: { team_id: number; score: number }[];
  streams_list?: { raw_url: string; language: string; main: boolean }[];
  number_of_games: number;
  match_type: string;
  games?: {
    position: number;
    status: string;
    finished: boolean;
    length: number | null;
    winner: { id: number | null; type: string } | null;
  }[];
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
    this.logger.info("Fetching PandaScore esports matches...");
    const allMatches: UnifiedMatch[] = [];

    const endpoints = [
      "matches/upcoming?per_page=100",
      "matches/running?per_page=50",
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

        const matches = (await response.json()) as PandaScoreMatchResponse[];

        for (const match of matches) {
          const game = PANDASCORE_GAME_MAP[match.videogame?.slug];
          if (!game) continue;
          if (match.opponents.length < 2) continue;

          const team1 = match.opponents[0].opponent;
          const team2 = match.opponents[1].opponent;
          if (!team1.name || !team2.name) continue;

          const stream = match.streams_list?.find(
            (s) => s.main && s.language === "en",
          ) ?? match.streams_list?.[0];

          const team1Result = match.results?.find(
            (r) => r.team_id === team1.id,
          );
          const team2Result = match.results?.find(
            (r) => r.team_id === team2.id,
          );

          const details: MatchDetails = {
            format: match.match_type === "best_of"
              ? `bo${match.number_of_games}`
              : match.match_type,
            team1Logo: team1.image_url ?? undefined,
            team2Logo: team2.image_url ?? undefined,
          };

          if (match.games && match.games.length > 0) {
            const opponentMap = new Map<number, string>();
            opponentMap.set(team1.id, team1.name);
            opponentMap.set(team2.id, team2.name);

            details.games = match.games.map((g): MatchSubGame => ({
              position: g.position,
              status: g.finished ? "finished" : g.status === "running" ? "running" : "not_started",
              winnerName: g.winner?.id ? opponentMap.get(g.winner.id) : undefined,
              duration: g.length ?? undefined,
            }));
          }

          allMatches.push({
            game,
            team1Name: team1.name,
            team2Name: team2.name,
            team1Score: team1Result?.score,
            team2Score: team2Result?.score,
            tournament: match.tournament?.name
              ? `${match.league.name} - ${match.tournament.name}`
              : match.league.name,
            startTime: new Date(match.begin_at),
            status:
              PANDASCORE_STATUS_MAP[match.status] ?? MatchStatus.UPCOMING,
            streamUrl: stream?.raw_url,
            source: "pandascore",
            sourceId: String(match.id),
            details,
            team1Logo: team1.image_url ?? undefined,
            team2Logo: team2.image_url ?? undefined,
          });
        }
      } catch (err) {
        this.logger.error({ err, endpoint }, "PandaScore match fetch error");
      }
    }

    this.logger.info({ count: allMatches.length }, "Fetched PandaScore matches");
    return allMatches;
  }
}
