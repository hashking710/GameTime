const NAME_ALIASES: Record<string, string> = {
  "dr congo": "congo dr",
  "congo dr": "congo dr",
  "republic of korea": "south korea",
  "korea republic": "south korea",
  "côte d'ivoire": "ivory coast",
  "cote d ivoire": "ivory coast",
  "united states": "usa",
  "united states of america": "usa",
  "bosnia and herzegovina": "bosnia",
  "bosnia & herzegovina": "bosnia",
  "czech republic": "czechia",
  "chinese taipei": "taiwan",
};

export function normalizeTeamName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|esports|gaming|team|club|academy|esport)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return NAME_ALIASES[normalized] ?? normalized;
}
