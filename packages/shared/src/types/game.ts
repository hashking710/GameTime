export const Game = {
  CS2: "cs2",
  VALORANT: "valorant",
  LOL: "lol",
  DOTA2: "dota2",
  ROCKET_LEAGUE: "rocket_league",
  APEX: "apex",
  RAINBOW_SIX: "rainbow_six",
  COD: "cod",
  NFL: "nfl",
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  SOCCER: "soccer",
  UFC: "ufc",
  F1: "f1",
  TENNIS: "tennis",
} as const;

export type Game = (typeof Game)[keyof typeof Game];

export const ESPORTS_GAMES: Game[] = [
  Game.CS2,
  Game.VALORANT,
  Game.LOL,
  Game.DOTA2,
  Game.ROCKET_LEAGUE,
  Game.APEX,
  Game.RAINBOW_SIX,
  Game.COD,
];

export const TRADITIONAL_SPORTS: Game[] = [
  Game.NFL,
  Game.NBA,
  Game.MLB,
  Game.NHL,
  Game.SOCCER,
  Game.UFC,
  Game.F1,
  Game.TENNIS,
];

export function isEsport(game: Game): boolean {
  return (ESPORTS_GAMES as string[]).includes(game);
}

const ALL_GAMES = new Set<string>(Object.values(Game));

export function isValidGame(value: string): value is Game {
  return ALL_GAMES.has(value);
}
