import { type Game, type UnifiedOdds, OddsMarket } from "@gametime/shared";
import { createLogger } from "@gametime/shared";

const logger = createLogger("odds:pandascore");

const PANDASCORE_GAME_MAP: Record<string, Game> = {
  csgo: "cs2",
  "cs-go": "cs2",
  valorant: "valorant",
  lol: "lol",
  "league-of-legends": "lol",
  dota2: "dota2",
  "dota-2": "dota2",
  rl: "rocket_league",
  r6siege: "rainbow_six",
  codmw: "cod",
};

interface PandaScoreMatch {
  id: number;
  opponents: { opponent: { name: string } }[];
  league: { name: string };
  videogame: { slug: string };
  begin_at: string;
  status: string;
  streams_list?: { raw_url: string; language: string }[];
}

interface PandaScoreOdds {
  match_id: number;
  bookmakers: {
    name: string;
    odds: { selection: string; value: number }[];
  }[];
}

export function pandascoreGameMap(): Record<string, Game> {
  return PANDASCORE_GAME_MAP;
}

export async function fetchPandaScoreOdds(
  apiKey: string,
): Promise<UnifiedOdds[]> {
  const results: UnifiedOdds[] = [];

  try {
    const response = await fetch(
      `https://api.pandascore.co/betting/matches?filter[status]=not_started,running&per_page=50&token=${apiKey}`,
    );

    if (!response.ok) {
      logger.warn({ status: response.status }, "PandaScore odds fetch failed");
      return [];
    }

    const matches = (await response.json()) as (PandaScoreMatch & {
      bookmakers?: PandaScoreOdds["bookmakers"];
    })[];

    for (const match of matches) {
      const game = PANDASCORE_GAME_MAP[match.videogame?.slug];
      if (!game || !match.bookmakers) continue;

      for (const bookmaker of match.bookmakers) {
        const team1Odds = bookmaker.odds.find(
          (o) => o.selection === "team_1",
        )?.value;
        const team2Odds = bookmaker.odds.find(
          (o) => o.selection === "team_2",
        )?.value;

        if (!team1Odds || !team2Odds) continue;

        const team1Name = match.opponents?.[0]?.opponent?.name ?? "TBD";
        const team2Name = match.opponents?.[1]?.opponent?.name ?? "TBD";

        results.push({
          matchSource: "pandascore",
          matchSourceId: String(match.id),
          game,
          bookmaker: bookmaker.name.toLowerCase(),
          market: OddsMarket.MONEYLINE,
          team1Odds,
          team2Odds,
          source: "pandascore",
          fetchedAt: new Date(),
          matchInfo: {
            team1Name,
            team2Name,
            startTime: new Date(match.begin_at),
            tournament: match.league?.name,
          },
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "PandaScore odds error");
  }

  logger.info({ count: results.length }, "Fetched PandaScore odds");
  return results;
}
