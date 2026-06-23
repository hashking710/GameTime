export function getLocalHour(timezone: string, now: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return null;
  }
}

export function isQuietHoursActive(
  timezone: string,
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
  now = new Date(),
): boolean {
  if (quietStart == null || quietEnd == null || quietStart === quietEnd) {
    return false;
  }

  const hour = getLocalHour(timezone, now);
  if (hour == null) return false;

  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }

  return hour >= quietStart || hour < quietEnd;
}

export function isGameMuted(
  game: string,
  mutedGames: string[] | null | undefined,
): boolean {
  if (!mutedGames || mutedGames.length === 0) return false;
  return mutedGames.includes(game);
}
