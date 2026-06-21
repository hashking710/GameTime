import type { Game } from "./game";

export interface UnifiedTeam {
  name: string;
  game: Game;
  logoUrl?: string;
  source: string;
  sourceId: string;
}
