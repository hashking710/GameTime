import type { Game } from "./game";

export const OddsMarket = {
  MONEYLINE: "moneyline",
  SPREAD: "spread",
  TOTAL: "total",
} as const;

export type OddsMarket = (typeof OddsMarket)[keyof typeof OddsMarket];

export interface UnifiedOdds {
  matchSource: string;
  matchSourceId: string;
  game: Game;
  bookmaker: string;
  market: OddsMarket;
  team1Odds: number;
  team2Odds: number;
  drawOdds?: number;
  spreadValue?: number;
  totalValue?: number;
  overOdds?: number;
  underOdds?: number;
  source: string;
  fetchedAt: Date;
  matchInfo?: {
    team1Name: string;
    team2Name: string;
    startTime: Date;
    tournament?: string;
  };
}
