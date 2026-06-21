import { eq, and, sql } from "drizzle-orm";
import { matches } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { invalidatePattern } from "@gametime/cache";
import { createLogger, type Game, type MatchDetails, type MatchPeriod } from "@gametime/shared";

const logger = createLogger("espn-live");

const ESPN_SPORTS: { sport: string; league: string; game: Game }[] = [
  { sport: "baseball", league: "mlb", game: "mlb" },
  { sport: "football", league: "nfl", game: "nfl" },
  { sport: "basketball", league: "nba", game: "nba" },
  { sport: "hockey", league: "nhl", game: "nhl" },
  { sport: "soccer", league: "usa.1", game: "soccer" },
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
  team: { displayName: string; shortDisplayName: string };
  score: string;
  linescores?: { value: number }[];
}

interface EspnEvent {
  id: string;
  name: string;
  competitions: {
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

        const details: MatchDetails = {
          clock: comp.status.type.shortDetail,
          situation: comp.status.type.description,
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
            details,
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

        // If no match found with home=team1, try swapped
        if (updated.length === 0) {
          await db
            .update(matches)
            .set({
              team1Score: awayScore,
              team2Score: homeScore,
              status: matchStatus,
              details,
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
            );
        }

        totalUpdated++;
      }
    } catch (err) {
      logger.warn({ err, league }, "ESPN fetch error");
    }
  }

  if (totalUpdated > 0) {
    await invalidatePattern(redis, "matches:*");
    logger.info({ updated: totalUpdated }, "ESPN live scores updated");
  }
}
