export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|esports|gaming|team|club|academy)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
