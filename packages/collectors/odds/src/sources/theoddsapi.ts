import { type Game, type UnifiedOdds, OddsMarket } from "@gametime/shared";
import { createLogger } from "@gametime/shared";

const logger = createLogger("odds:theoddsapi");

const SPORT_KEY_MAP: Record<string, Game> = {
  americanfootball_nfl: "nfl",
  basketball_nba: "nba",
  baseball_mlb: "mlb",
  icehockey_nhl: "nhl",
  soccer_epl: "soccer",
  soccer_usa_mls: "soccer",
  soccer_fifa_world_cup: "soccer",
  mma_mixed_martial_arts: "ufc",
  tennis_atp_french_open: "tennis",
};

const SPORTS_TO_FETCH = [
  "americanfootball_nfl",
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "soccer_epl",
  "soccer_usa_mls",
  "soccer_fifa_world_cup",
  "mma_mixed_martial_arts",
];

interface TheOddsApiEvent {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
        point?: number;
      }[];
    }[];
  }[];
}

export async function fetchTheOddsApiOdds(
  apiKey: string,
): Promise<UnifiedOdds[]> {
  const results: UnifiedOdds[] = [];

  for (const sportKey of SPORTS_TO_FETCH) {
    const game = SPORT_KEY_MAP[sportKey];
    if (!game) continue;

    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=decimal`;
      const response = await fetch(url);

      if (!response.ok) {
        logger.warn(
          { sportKey, status: response.status },
          "TheOddsAPI fetch failed",
        );
        continue;
      }

      const events = (await response.json()) as TheOddsApiEvent[];

      for (const event of events) {
        for (const bookmaker of event.bookmakers) {
          for (const market of bookmaker.markets) {
            const odds = parseMarket(
              event,
              bookmaker.key,
              market,
              game,
            );
            if (odds) results.push(odds);
          }
        }
      }
    } catch (err) {
      logger.error({ err, sportKey }, "TheOddsAPI sport fetch error");
    }
  }

  return results;
}

function parseMarket(
  event: TheOddsApiEvent,
  bookmakerKey: string,
  market: TheOddsApiEvent["bookmakers"][0]["markets"][0],
  game: Game,
): UnifiedOdds | null {
  const home = market.outcomes.find((o) => o.name === event.home_team);
  const away = market.outcomes.find((o) => o.name === event.away_team);
  if (!home || !away) return null;

  const base: UnifiedOdds = {
    matchSource: "theoddsapi",
    matchSourceId: event.id,
    game,
    bookmaker: bookmakerKey,
    market: OddsMarket.MONEYLINE,
    team1Odds: home.price,
    team2Odds: away.price,
    source: "theoddsapi",
    fetchedAt: new Date(),
    matchInfo: {
      team1Name: event.home_team,
      team2Name: event.away_team,
      startTime: new Date(event.commence_time),
      tournament: SPORT_KEY_MAP[event.sport_key]?.toUpperCase(),
    },
  };

  if (market.key === "h2h") {
    const draw = market.outcomes.find((o) => o.name === "Draw");
    return { ...base, market: OddsMarket.MONEYLINE, drawOdds: draw?.price };
  }

  if (market.key === "spreads") {
    return {
      ...base,
      market: OddsMarket.SPREAD,
      spreadValue: home.point,
    };
  }

  if (market.key === "totals") {
    const over = market.outcomes.find((o) => o.name === "Over");
    const under = market.outcomes.find((o) => o.name === "Under");
    if (!over || !under) return null;
    return {
      ...base,
      market: OddsMarket.TOTAL,
      team1Odds: over.price,
      team2Odds: under.price,
      totalValue: over.point,
      overOdds: over.price,
      underOdds: under.price,
    };
  }

  return null;
}
