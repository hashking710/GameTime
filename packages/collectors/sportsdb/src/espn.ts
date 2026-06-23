import { eq, and, sql } from "drizzle-orm";
import { matches, teams, teamAliases } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { invalidatePattern } from "@gametime/cache";
import {
  createLogger,
  type Game,
  type MatchDetails,
  type MatchPeriod,
  sanitizeImageUrl,
} from "@gametime/shared";

const logger = createLogger("espn-live");

const ESPN_SPORTS: { sport: string; league: string; game: Game }[] = [
  { sport: "baseball", league: "mlb", game: "mlb" },
  { sport: "football", league: "nfl", game: "nfl" },
  { sport: "basketball", league: "nba", game: "nba" },
  { sport: "hockey", league: "nhl", game: "nhl" },
  { sport: "soccer", league: "fifa.world", game: "soccer" },
  { sport: "soccer", league: "eng.1", game: "soccer" },
  { sport: "soccer", league: "esp.1", game: "soccer" },
  { sport: "soccer", league: "ger.1", game: "soccer" },
  { sport: "soccer", league: "ita.1", game: "soccer" },
  { sport: "soccer", league: "fra.1", game: "soccer" },
  { sport: "soccer", league: "usa.1", game: "soccer" },
  { sport: "soccer", league: "mex.1", game: "soccer" },
  { sport: "soccer", league: "uefa.champions", game: "soccer" },
  { sport: "soccer", league: "conmebol.libertadores", game: "soccer" },
  { sport: "mma", league: "ufc", game: "ufc" },
];

const PERIOD_LABELS: Record<string, (n: number) => string> = {
  mlb: (n) => `${n}`,
  nfl: (n) => `Q${n}`,
  nba: (n) => `Q${n}`,
  nhl: (n) => `P${n}`,
  soccer: (n) => n === 1 ? "1H" : "2H",
  ufc: (n) => `R${n}`,
};

interface EspnCompetitor {
  homeAway: string;
  team: { displayName: string; shortDisplayName: string; logo?: string };
  score: string;
  linescores?: { value: number }[];
}

interface EspnEvent {
  id: string;
  name: string;
  date: string;
  competitions: {
    date?: string;
    competitors: EspnCompetitor[];
    status: {
      type: { name: string; description: string; shortDetail: string; completed: boolean };
      period: number;
      displayClock?: string;
    };
  }[];
}

export async function updateLiveScores(db: Database, redis: RedisClient): Promise<void> {
  let totalUpdated = 0;

  for (const { sport, league, game } of ESPN_SPORTS) {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`,
      );
      if (!response.ok) continue;

      const data = (await response.json()) as { events: EspnEvent[] };
      if (!data.events) continue;

      for (const event of data.events) {
        const comp = event.competitions[0];
        if (!comp) continue;

        const home = comp.competitors.find((c) => c.homeAway === "home");
        const away = comp.competitors.find((c) => c.homeAway === "away");
        if (!home || !away) continue;

        const statusName = comp.status.type.name;
        let matchStatus: "upcoming" | "live" | "completed";
        if (comp.status.type.completed) {
          matchStatus = "completed";
        } else if (statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME") {
          matchStatus = "live";
        } else {
          matchStatus = "upcoming";
        }

        const homeScore = parseInt(home.score) || 0;
        const awayScore = parseInt(away.score) || 0;
        const homeLogo = sanitizeImageUrl(home.team.logo);
        const awayLogo = sanitizeImageUrl(away.team.logo);

        const details: MatchDetails = {
          clock: comp.status.type.shortDetail,
          situation: comp.status.type.description,
          externalEventId: event.id,
          ...(homeLogo ? { team1Logo: homeLogo } : {}),
          ...(awayLogo ? { team2Logo: awayLogo } : {}),
        };

        const homeLine = home.linescores;
        const awayLine = away.linescores;
        if (homeLine && awayLine && homeLine.length > 0) {
          const labelFn = PERIOD_LABELS[game] ?? ((n: number) => `${n}`);
          details.periods = homeLine.map((_, i): MatchPeriod => ({
            label: labelFn(i + 1),
            team1Score: homeLine[i]?.value ?? 0,
            team2Score: awayLine[i]?.value ?? 0,
          }));
        }

        // Match by team names + game type (fuzzy: home team name contains)
        const updated = await db
          .update(matches)
          .set({
            team1Score: homeScore,
            team2Score: awayScore,
            status: matchStatus,
            details: details as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(matches.game, game),
              sql`(
                ${matches.team1} ILIKE '%' || ${home.team.shortDisplayName} || '%'
                OR ${matches.team1} ILIKE '%' || ${home.team.displayName} || '%'
              )`,
              sql`(
                ${matches.team2} ILIKE '%' || ${away.team.shortDisplayName} || '%'
                OR ${matches.team2} ILIKE '%' || ${away.team.displayName} || '%'
              )`,
            ),
          )
          .returning({ id: matches.id });

        // If no match found, try swapped team order
        if (updated.length === 0) {
          const swapped = await db
            .update(matches)
            .set({
              team1Score: awayScore,
              team2Score: homeScore,
              status: matchStatus,
              details: details as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(matches.game, game),
                sql`(
                  ${matches.team1} ILIKE '%' || ${away.team.shortDisplayName} || '%'
                  OR ${matches.team1} ILIKE '%' || ${away.team.displayName} || '%'
                )`,
                sql`(
                  ${matches.team2} ILIKE '%' || ${home.team.shortDisplayName} || '%'
                  OR ${matches.team2} ILIKE '%' || ${home.team.displayName} || '%'
                )`,
              ),
            )
            .returning({ id: matches.id });

          // If still no match, create it — ESPN is authoritative for live sports
          if (swapped.length === 0) {
            await db
              .insert(matches)
              .values({
                game,
                team1: home.team.displayName,
                team2: away.team.displayName,
                team1Score: homeScore,
                team2Score: awayScore,
                tournament: league.toUpperCase().replace(/\./g, " "),
                startTime: new Date(event.date ?? event.competitions[0]?.date ?? Date.now()),
                status: matchStatus,
                details: details as Record<string, unknown>,
                source: "espn",
                sourceId: event.id,
              })
              .onConflictDoUpdate({
                target: [matches.source, matches.sourceId],
                set: {
                  team1Score: sql`EXCLUDED.team1_score`,
                  team2Score: sql`EXCLUDED.team2_score`,
                  status: sql`EXCLUDED.status`,
                  details: sql`EXCLUDED.details`,
                  updatedAt: sql`NOW()`,
                },
              });
          }
        }

        await upsertEspnTeam(db, home.team.displayName, game);
        await upsertEspnTeam(db, away.team.displayName, game);

        totalUpdated++;
      }
    } catch (err) {
      logger.warn({ err, league }, "ESPN fetch error");
    }
  }

  if (totalUpdated > 0) {
    await invalidatePattern(redis, "matches:*");
    logger.debug({ updated: totalUpdated }, "ESPN live scores updated");
  }
}

const seenTeams = new Set<string>();

async function upsertEspnTeam(db: Database, name: string, game: Game): Promise<void> {
  if (!name) return;
  const key = `espn:${game}:${name}`;
  if (seenTeams.has(key)) return;
  seenTeams.add(key);

  let canonical = name;
  const alias = await db
    .select({ canonicalName: teamAliases.canonicalName })
    .from(teamAliases)
    .where(sql`LOWER(${teamAliases.alias}) = ${name.toLowerCase()}`)
    .limit(1);
  if (alias.length > 0) canonical = alias[0].canonicalName;

  await db
    .insert(teams)
    .values({
      name,
      canonicalName: canonical,
      game,
      source: "espn",
      sourceId: `espn_team_${name.toLowerCase().replace(/\s+/g, "_")}`,
    })
    .onConflictDoNothing();
}
