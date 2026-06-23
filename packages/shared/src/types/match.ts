import type { Game } from "./game";

export const MatchStatus = {
  UPCOMING: "upcoming",
  LIVE: "live",
  COMPLETED: "completed",
} as const;

export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export interface MatchSubGame {
  position: number;
  status: "finished" | "running" | "not_started";
  winnerName?: string;
  duration?: number;
  team1Score?: number;
  team2Score?: number;
  team1Kills?: number;
  team2Kills?: number;
}

export interface MatchPeriod {
  label: string;
  team1Score: number;
  team2Score: number;
}

export interface MatchDetails {
  format?: string;
  games?: MatchSubGame[];
  periods?: MatchPeriod[];
  clock?: string;
  situation?: string;
  team1Kills?: number;
  team2Kills?: number;
  team1Logo?: string;
  team2Logo?: string;
  externalEventId?: string | number;
}

export interface UnifiedMatch {
  game: Game;
  team1Name: string;
  team2Name: string;
  team1Score?: number;
  team2Score?: number;
  tournament: string;
  startTime: Date;
  status: MatchStatus;
  streamUrl?: string;
  source: string;
  sourceId: string;
  details?: MatchDetails;
  team1Logo?: string;
  team2Logo?: string;
}
