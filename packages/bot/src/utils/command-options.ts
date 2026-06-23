import type { SlashCommandStringOption } from "discord.js";

const GAME_CHOICES = [
  { name: "CS2", value: "cs2" },
  { name: "Valorant", value: "valorant" },
  { name: "League of Legends", value: "lol" },
  { name: "Dota 2", value: "dota2" },
  { name: "NFL", value: "nfl" },
  { name: "NBA", value: "nba" },
  { name: "MLB", value: "mlb" },
  { name: "NHL", value: "nhl" },
  { name: "Soccer", value: "soccer" },
  { name: "UFC", value: "ufc" },
  { name: "F1", value: "f1" },
  { name: "Tennis", value: "tennis" },
] as const;

interface GameOptionConfig {
  required: boolean;
  description?: string;
  name?: string;
}

export function withGameChoices(
  option: SlashCommandStringOption,
  config: GameOptionConfig,
): SlashCommandStringOption {
  return option
    .setName(config.name ?? "game")
    .setDescription(config.description ?? "Filter by game")
    .setRequired(config.required)
    .addChoices(...GAME_CHOICES);
}
