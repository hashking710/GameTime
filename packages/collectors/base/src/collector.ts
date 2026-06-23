import type { UnifiedMatch } from "@gametime/shared";
import { createLogger, type Game } from "@gametime/shared";
import type { Database } from "@gametime/db";
import { matches, teams, teamAliases } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { sql, eq, and, lte } from "drizzle-orm";
import { invalidatePattern } from "@gametime/cache";
import cron from "node-cron";

// Only traditional sports get time-based completion promotion.
// Esports (cs2, valorant, lol, dota2) rely on PandaScore/VLR/OpenDota
// to report completion — the lifecycle promoter was overriding their
// status before final scores were available.
const GAME_DURATION_HOURS: Partial<Record<Game, number>> = {
  nfl: 4,
  nba: 3,
  mlb: 4,
  nhl: 3,
  soccer: 2.5,
  ufc: 5,
  f1: 3,
  tennis: 5,
};

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 5 * 60_000;

export abstract class BaseCollector {
  protected logger: ReturnType<typeof createLogger>;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

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
      const teamEntries = [
        { name: match.team1Name, logo: match.team1Logo },
        { name: match.team2Name, logo: match.team2Logo },
      ];
      for (const { name: teamName, logo } of teamEntries) {
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
            logoUrl: logo,
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

    for (const game of Object.keys(GAME_DURATION_HOURS) as Game[]) {
      const hours = GAME_DURATION_HOURS[game];
      if (!hours) continue;
      const cutoff = new Date(now.getTime() - hours * 3600_000);
      await this.db
        .update(matches)
        .set({ status: "completed", updatedAt: now })
        .where(
          and(
            eq(matches.status, "live"),
            eq(matches.game, game),
            lte(matches.startTime, cutoff),
            sql`(
              ${matches.team1Score} IS NOT NULL
              OR ${matches.team2Score} IS NOT NULL
            )`,
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
    if (Date.now() < this.circuitOpenUntil) {
      this.logger.warn(
        { resumeAt: new Date(this.circuitOpenUntil).toISOString() },
        "Collector circuit open, skipping cycle",
      );
      return;
    }

    try {
      await this.runTickWithRetry();
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
        this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
        this.consecutiveFailures = 0;
        this.logger.error(
          { err, openUntil: new Date(this.circuitOpenUntil).toISOString() },
          "Collector circuit opened after repeated failures",
        );
        return;
      }

      this.logger.error(
        { err, consecutiveFailures: this.consecutiveFailures },
        "Collection cycle failed",
      );
    }
  }

  start(): void {
    this.logger.info({ schedule: this.schedule }, "Starting collector");
    void this.tick();
    cron.schedule(this.schedule, () => {
      void this.tick();
    });
  }

  private async runTickWithRetry(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await this.collect();
        await this.ingest(data);
        await this.updateMatchLifecycle();
        return;
      } catch (err) {
        lastError = err;
        if (attempt === MAX_RETRIES) break;
        const backoff = Math.min(
          BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
          MAX_RETRY_DELAY_MS,
        );
        const jitter = Math.floor(Math.random() * 250);
        const delay = backoff + jitter;
        this.logger.warn(
          { err, attempt, maxAttempts: MAX_RETRIES, retryInMs: delay },
          "Collector cycle failed, retrying with backoff",
        );
        await sleep(delay);
      }
    }

    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
