import type { Game } from "@gametime/shared";

export function unsupportedGameFilterMessage(value: string): string {
  return `Unsupported game filter: \`${value}\`.`;
}

export function noMatchesMessage(
  scope: "live" | "today" | "upcoming" | "results" | "odds" | "schedule",
  game?: Game,
): string {
  if (scope === "schedule" && game) {
    return `No upcoming ${game.toUpperCase()} matches found.`;
  }

  switch (scope) {
    case "live":
      return "No matches are live right now.";
    case "today":
      return "No matches scheduled for today.";
    case "upcoming":
      return "No upcoming matches found.";
    case "results":
      return "No recent results found.";
    case "odds":
      return "No upcoming matches with odds found.";
    default:
      return "No matches found.";
  }
}
