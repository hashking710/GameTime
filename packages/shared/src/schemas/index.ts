import { z } from "zod";
import { Game } from "../types/game.js";
import { MatchStatus } from "../types/match.js";
import { OddsMarket } from "../types/odds.js";

const gameValues = Object.values(Game) as [string, ...string[]];
const matchStatusValues = Object.values(MatchStatus) as [string, ...string[]];
const oddsMarketValues = Object.values(OddsMarket) as [string, ...string[]];

export const unifiedMatchSchema = z.object({
  game: z.enum(gameValues),
  team1Name: z.string().min(1),
  team2Name: z.string().min(1),
  team1Score: z.number().int().optional(),
  team2Score: z.number().int().optional(),
  tournament: z.string().min(1),
  startTime: z.coerce.date(),
  status: z.enum(matchStatusValues),
  streamUrl: z.string().url().optional(),
  source: z.string().min(1),
  sourceId: z.string().min(1),
});

export const unifiedOddsSchema = z.object({
  matchSource: z.string().min(1),
  matchSourceId: z.string().min(1),
  game: z.enum(gameValues),
  bookmaker: z.string().min(1),
  market: z.enum(oddsMarketValues),
  team1Odds: z.number(),
  team2Odds: z.number(),
  drawOdds: z.number().optional(),
  spreadValue: z.number().optional(),
  totalValue: z.number().optional(),
  overOdds: z.number().optional(),
  underOdds: z.number().optional(),
  source: z.string().min(1),
  fetchedAt: z.coerce.date(),
});
