import { type Game, isValidGame } from "@gametime/shared";

export function parseGameOption(value: string | null): Game | null {
  if (!value) return null;
  return isValidGame(value) ? value : null;
}
