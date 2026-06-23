import { users, userSubscriptions, teams, type Database } from "@gametime/db";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { matches } from "@gametime/db";
import { normalizeTeamName } from "./team-name";

type Match = InferSelectModel<typeof matches>;

interface UserMatchPreferences {
  trackedTeams: Set<string>;
  favoriteTeams: Set<string>;
  favoriteLeagues: Set<string>;
}

export async function loadUserMatchPreferences(
  db: Database,
  discordId: string,
): Promise<UserMatchPreferences> {
  const [user] = await db
    .select({
      favoriteTeams: users.favoriteTeams,
      favoriteLeagues: users.favoriteLeagues,
    })
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);

  const tracked = await db
    .select({
      name: teams.name,
      canonicalName: teams.canonicalName,
    })
    .from(userSubscriptions)
    .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
    .where(eq(userSubscriptions.discordId, discordId));

  const trackedTeams = new Set<string>();
  for (const team of tracked) {
    trackedTeams.add(normalizeTeamName(team.name));
    if (team.canonicalName) trackedTeams.add(normalizeTeamName(team.canonicalName));
  }

  const favoriteTeams = new Set(
    ((user?.favoriteTeams ?? []) as string[]).map((name) => normalizeTeamName(name)),
  );
  const favoriteLeagues = new Set(
    ((user?.favoriteLeagues ?? []) as string[]).map((name) => name.toLowerCase().trim()),
  );

  return { trackedTeams, favoriteTeams, favoriteLeagues };
}

export function sortMatchesByPreferences(
  allMatches: Match[],
  preferences: UserMatchPreferences,
): Match[] {
  const scored = allMatches.map((match) => ({
    match,
    score: scoreMatch(match, preferences),
  }));

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.match.startTime.getTime() - b.match.startTime.getTime();
  });

  return scored.map((entry) => entry.match);
}

function scoreMatch(match: Match, preferences: UserMatchPreferences): number {
  const team1 = normalizeTeamName(match.team1);
  const team2 = normalizeTeamName(match.team2);
  const tournament = match.tournament.toLowerCase();

  const hasTrackedTeam =
    preferences.trackedTeams.has(team1) || preferences.trackedTeams.has(team2);
  if (hasTrackedTeam) return 0;

  const hasFavoriteTeam =
    preferences.favoriteTeams.has(team1) || preferences.favoriteTeams.has(team2);
  if (hasFavoriteTeam) return 1;

  for (const favoriteLeague of preferences.favoriteLeagues) {
    if (favoriteLeague && tournament.includes(favoriteLeague)) {
      return 2;
    }
  }

  return 3;
}
