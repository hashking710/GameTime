import type { Game } from "../types/game";

export const GAME_EMOJI: Record<string, string> = {
  cs2: ":gun:",
  valorant: ":dart:",
  lol: ":video_game:",
  dota2: ":crossed_swords:",
  rocket_league: ":racing_car:",
  apex: ":boom:",
  rainbow_six: ":shield:",
  cod: ":military_helmet:",
  nfl: ":football:",
  nba: ":basketball:",
  mlb: ":baseball:",
  nhl: ":ice_cube:",
  soccer: ":soccer:",
  ufc: ":boxing_glove:",
  f1: ":checkered_flag:",
  tennis: ":tennis:",
};

export const PANDASCORE_GAME_MAP: Record<string, Game> = {
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
