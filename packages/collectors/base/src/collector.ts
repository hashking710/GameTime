import type { UnifiedMatch } from "@gametime/shared";
import { createLogger } from "@gametime/shared";
import type { Database } from "@gametime/db";
import { matches, teams, teamAliases } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { sql, eq, and, lte } from "drizzle-orm";
import { invalidatePattern } from "@gametime/cache";
import cron from "node-cron";

const GAME_DURATION_HOURS: Record<string, number> = {
  nfl: 4,
  nba: 3,
  mlb: 4,
  nhl: 3,
  soccer: 2.5,
  ufc: 5,
  f1: 3,
  tennis: 5,
  cs2: 5,
  valorant: 5,
  lol: 5,
  dota2: 5,
};

export abstract class BaseCollector {
  protected logger: ReturnType<typeof createLogger>;

  constructor(
    protected readonly name: string,
    protected readonly db: Database,
    protected readonly redis: RedisClient,
    protected readonly schedule: string = "*/5 * * * *",
  ) {
    this.logger = createLogger(`collector:${name}`);
  }

  abstract collect(): Promise<UnifiedMatch[]>;

  async ingest(data: UnifiedMatch[]): Promise<void> {
    if (data.length === 0) return;

    for (const match of data) {
      await this.db
        .insert(matches)
        .values({
          game: match.game,
          team1: match.team1Name,
          team2: match.team2Name,
          team1Score: match.team1Score,
          team2Score: match.team2Score,
          tournament: match.tournament,
          startTime: match.startTime,
          status: match.status,
          streamUrl: match.streamUrl,
          details: (match.details as Record<string, unknown>) ?? null,
          source: match.source,
          sourceId: match.sourceId,
        })
        .onConflictDoUpdate({
          target: [matches.source, matches.sourceId],
          set: {
            team1Score: sql`EXCLUDED.team1_score`,
            team2Score: sql`EXCLUDED.team2_score`,
            status: sql`EXCLUDED.status`,
            streamUrl: sql`EXCLUDED.stream_url`,
            startTime: sql`EXCLUDED.start_time`,
            details: sql`EXCLUDED.details`,
            updatedAt: sql`NOW()`,
          },
        });
    }

    await this.upsertTeams(data);
    await invalidatePattern(this.redis, "matches:*");
    this.logger.info({ count: data.length }, "Ingested matches");
  }

  private async upsertTeams(data: UnifiedMatch[]): Promise<void> {
    const seen = new Set<string>();

    for (const match of data) {
      for (const teamName of [match.team1Name, match.team2Name]) {
        if (!teamName || teamName === "TBD") continue;
        const key = `${match.source}:${match.game}:${teamName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const canonical = await this.resolveCanonical(teamName);

        await this.db
          .insert(teams)
          .values({
            name: teamName,
            canonicalName: canonical,
            game: match.game,
            source: match.source,
            sourceId: `${match.source}_team_${teamName.toLowerCase().replace(/\s+/g, "_")}`,
          })
          .onConflictDoNothing();
      }
    }
  }

  private async resolveCanonical(name: string): Promise<string> {
    const normalized = name.toLowerCase().trim();

    const alias = await this.db
      .select({ canonicalName: teamAliases.canonicalName })
      .from(teamAliases)
      .where(sql`LOWER(${teamAliases.alias}) = ${normalized}`)
      .limit(1);

    if (alias.length > 0) return alias[0].canonicalName;

    return name;
  }

  async updateMatchLifecycle(): Promise<void> {
    const now = new Date();

    const promoted = await this.db
      .update(matches)
      .set({ status: "live", updatedAt: now })
      .where(
        and(eq(matches.status, "upcoming"), lte(matches.startTime, now)),
      )
      .returning({ id: matches.id });

    for (const [game, hours] of Object.entries(GAME_DURATION_HOURS)) {
      const cutoff = new Date(now.getTime() - hours * 3600_000);
      await this.db
        .update(matches)
        .set({ status: "completed", updatedAt: now })
        .where(
          and(
            eq(matches.status, "live"),
            eq(matches.game, game as any),
            lte(matches.startTime, cutoff),
          ),
        );
    }

    if (promoted.length > 0) {
      await invalidatePattern(this.redis, "matches:*");
      this.logger.info(
        { promoted: promoted.length },
        "Updated match lifecycle",
      );
    }
  }

  async tick(): Promise<void> {
    try {
      const data = await this.collect();
      await this.ingest(data);
      await this.updateMatchLifecycle();
    } catch (err) {
      this.logger.error({ err }, "Collection cycle failed");
    }
  }

  start(): void {
    this.logger.info({ schedule: this.schedule }, "Starting collector");
    void this.tick();
    cron.schedule(this.schedule, () => {
      void this.tick();
    });
  }
}
