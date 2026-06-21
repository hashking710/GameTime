import { type Game, type UnifiedOdds, OddsMarket } from "@gametime/shared";
import { createLogger } from "@gametime/shared";

const logger = createLogger("odds:pinnacle");

const PINNACLE_SPORT_MAP: Record<number, Game> = {
  12: "cs2",
  6: "soccer",
  4: "nba",
  1: "nfl",
  3: "mlb",
  19: "nhl",
  22: "ufc",
};

const SPORT_IDS_TO_FETCH = Object.keys(PINNACLE_SPORT_MAP).map(Number);

interface PinnacleLeague {
  id: number;
  name: string;
  sportId: number;
  matchupCount: number;
}

interface PinnacleMatchup {
  id: number;
  participants: {
    name: string;
    alignment: string;
  }[];
  league: { id: number; name: string };
  startTime: string;
  status: string;
}

interface PinnacleMarketPrice {
  matchupId: number;
  prices: {
    designation: string;
    price: number;
    points?: number;
  }[];
  type: string;
}

export async function fetchPinnacleOdds(): Promise<UnifiedOdds[]> {
  const results: UnifiedOdds[] = [];

  for (const sportId of SPORT_IDS_TO_FETCH) {
    const game = PINNACLE_SPORT_MAP[sportId];
    if (!game) continue;

    try {
      // Step 1: Get leagues for this sport
      const leaguesRes = await fetch(
        `https://guest.api.arcadia.pinnacle.com/0.1/leagues?brandId=0&sportId=${sportId}`,
      );
      if (!leaguesRes.ok) continue;

      const leagues = (await leaguesRes.json()) as PinnacleLeague[];
      const activeLeagues = leagues
        .filter((l) => l.matchupCount > 0)
        .slice(0, 5);

      for (const league of activeLeagues) {
        try {
          // Step 2: Get matchups for this league
          const matchupsRes = await fetch(
            `https://guest.api.arcadia.pinnacle.com/0.1/matchups?brandId=0&sportId=${sportId}&leagueId=${league.id}`,
          );
          if (!matchupsRes.ok) continue;

          const matchups = (await matchupsRes.json()) as PinnacleMatchup[];

          // Step 3: Get market prices
          const matchupIds = matchups
            .filter((m) => m.participants.length >= 2)
            .map((m) => m.id);

          if (matchupIds.length === 0) continue;

          const pricesRes = await fetch(
            `https://guest.api.arcadia.pinnacle.com/0.1/matchups/${matchupIds.join(",")}/markets/related/straight`,
          );
          if (!pricesRes.ok) continue;

          const prices = (await pricesRes.json()) as PinnacleMarketPrice[];

          // Map matchups by ID for quick lookup
          const matchupMap = new Map(matchups.map((m) => [m.id, m]));

          for (const price of prices) {
            const matchup = matchupMap.get(price.matchupId);
            if (!matchup || matchup.participants.length < 2) continue;
            if (!price.prices || price.prices.length < 2) continue;

            const home = matchup.participants.find(
              (p) => p.alignment === "home",
            );
            const away = matchup.participants.find(
              (p) => p.alignment === "away",
            );
            if (!home || !away) continue;

            const homePrice = price.prices.find(
              (p) => p.designation === "home",
            );
            const awayPrice = price.prices.find(
              (p) => p.designation === "away",
            );
            if (!homePrice || !awayPrice) continue;

            let market: typeof OddsMarket.MONEYLINE | typeof OddsMarket.SPREAD | typeof OddsMarket.TOTAL;
            if (price.type === "moneyline") market = OddsMarket.MONEYLINE;
            else if (price.type === "spread") market = OddsMarket.SPREAD;
            else if (price.type === "total") market = OddsMarket.TOTAL;
            else continue;

            const drawPrice = price.prices.find(
              (p) => p.designation === "draw",
            );

            const odds: UnifiedOdds = {
              matchSource: "pinnacle",
              matchSourceId: String(price.matchupId),
              game,
              bookmaker: "pinnacle",
              market,
              team1Odds: homePrice.price,
              team2Odds: awayPrice.price,
              drawOdds: drawPrice?.price,
              spreadValue:
                market === OddsMarket.SPREAD
                  ? homePrice.points
                  : undefined,
              totalValue:
                market === OddsMarket.TOTAL
                  ? homePrice.points
                  : undefined,
              overOdds:
                market === OddsMarket.TOTAL ? homePrice.price : undefined,
              underOdds:
                market === OddsMarket.TOTAL ? awayPrice.price : undefined,
              source: "pinnacle",
              fetchedAt: new Date(),
            };

            results.push(odds);
          }
        } catch (err) {
          logger.warn(
            { err, leagueId: league.id },
            "Pinnacle league matchup fetch error",
          );
        }
      }
    } catch (err) {
      logger.warn({ err, sportId }, "Pinnacle sport fetch error");
    }
  }

  logger.info({ count: results.length }, "Fetched Pinnacle odds");
  return results;
}
