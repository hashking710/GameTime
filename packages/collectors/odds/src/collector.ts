import { createLogger } from "@gametime/shared";
import type { UnifiedOdds } from "@gametime/shared";
import type { Database } from "@gametime/db";
import { odds, oddsHistory, matches, teams, teamAliases } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { eq, and, sql } from "drizzle-orm";
import { invalidatePattern } from "@gametime/cache";
import cron from "node-cron";
import { fetchPandaScoreOdds } from "./sources/pandascore";
import { fetchTheOddsApiOdds } from "./sources/theoddsapi";
import { fetchPinnacleOdds } from "./sources/pinnacle";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const SOURCE_FAILURE_THRESHOLD = 4;
const SOURCE_CIRCUIT_OPEN_MS = 10 * 60_000;

interface SourceRuntimeState {
  failures: number;
  openUntil: number;
}

export class OddsCollector {
  private logger = createLogger("collector:odds");
  private sourceStates = new Map<string, SourceRuntimeState>();

  constructor(
    private readonly db: Database,
    private readonly redis: RedisClient,
    private readonly pandaScoreApiKey: string,
    private readonly oddsApiKey: string,
  ) {}

  async collectEsportsOdds(): Promise<UnifiedOdds[]> {
    this.logger.info("Fetching esports odds from PandaScore...");
    return fetchPandaScoreOdds(this.pandaScoreApiKey);
  }

  async collectTraditionalOdds(): Promise<UnifiedOdds[]> {
    this.logger.info("Fetching traditional sports odds from TheOddsAPI...");
    return fetchTheOddsApiOdds(this.oddsApiKey);
  }

  async collectSupplementalOdds(): Promise<UnifiedOdds[]> {
    this.logger.info("Fetching supplemental odds from Pinnacle...");
    return fetchPinnacleOdds();
  }

  async ingestOdds(oddsData: UnifiedOdds[]): Promise<void> {
    if (oddsData.length === 0) return;

    for (const o of oddsData) {
      // Upsert match if the odds source provides match info
      if (o.matchInfo) {
        await this.db
          .insert(matches)
          .values({
            game: o.game,
            team1: o.matchInfo.team1Name,
            team2: o.matchInfo.team2Name,
            tournament: o.matchInfo.tournament ?? o.game.toUpperCase(),
            startTime: o.matchInfo.startTime,
            status: o.matchInfo.startTime > new Date() ? "upcoming" : "live",
            source: o.matchSource,
            sourceId: o.matchSourceId,
          })
          .onConflictDoUpdate({
            target: [matches.source, matches.sourceId],
            set: {
              startTime: sql`EXCLUDED.start_time`,
              updatedAt: sql`NOW()`,
            },
          });

        for (const teamName of [o.matchInfo.team1Name, o.matchInfo.team2Name]) {
          if (!teamName) continue;
          await this.db
            .insert(teams)
            .values({
              name: teamName,
              canonicalName: teamName,
              game: o.game,
              source: o.matchSource,
              sourceId: `${o.matchSource}_team_${teamName.toLowerCase().replace(/\s+/g, "_")}`,
            })
            .onConflictDoNothing();
        }
      }

      const matchRows = await this.db
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.source, o.matchSource),
            eq(matches.sourceId, o.matchSourceId),
          ),
        )
        .limit(1);

      if (matchRows.length === 0) continue;
      const matchId = matchRows[0].id;

      await this.db
        .insert(odds)
        .values({
          matchId,
          game: o.game,
          bookmaker: o.bookmaker,
          market: o.market,
          team1Odds: o.team1Odds,
          team2Odds: o.team2Odds,
          drawOdds: o.drawOdds,
          spreadValue: o.spreadValue,
          totalValue: o.totalValue,
          overOdds: o.overOdds,
          underOdds: o.underOdds,
          source: o.source,
          fetchedAt: o.fetchedAt,
        })
        .onConflictDoUpdate({
          target: [odds.matchId, odds.bookmaker, odds.market],
          set: {
            team1Odds: sql`EXCLUDED.team1_odds`,
            team2Odds: sql`EXCLUDED.team2_odds`,
            drawOdds: sql`EXCLUDED.draw_odds`,
            spreadValue: sql`EXCLUDED.spread_value`,
            totalValue: sql`EXCLUDED.total_value`,
            overOdds: sql`EXCLUDED.over_odds`,
            underOdds: sql`EXCLUDED.under_odds`,
            updatedAt: sql`NOW()`,
          },
        });

      await this.db.insert(oddsHistory).values({
        matchId,
        bookmaker: o.bookmaker,
        market: o.market,
        team1Odds: o.team1Odds,
        team2Odds: o.team2Odds,
        drawOdds: o.drawOdds,
        spreadValue: o.spreadValue,
        totalValue: o.totalValue,
        overOdds: o.overOdds,
        underOdds: o.underOdds,
        source: o.source,
        fetchedAt: o.fetchedAt,
      });
    }

    await invalidatePattern(this.redis, "odds:*");
    this.logger.info({ count: oddsData.length }, "Ingested odds");
  }

  start(): void {
    this.logger.info("Starting odds collector");

    const tickEsports = async () => {
      await this.runSourceCycle("esports", () => this.collectEsportsOdds());
    };
    void tickEsports();
    cron.schedule("*/5 * * * *", () => void tickEsports());

    const tickTraditional = async () => {
      await this.runSourceCycle("traditional", () => this.collectTraditionalOdds());
    };
    void tickTraditional();
    cron.schedule("0 */6 * * *", () => void tickTraditional());

    const tickSupplemental = async () => {
      await this.runSourceCycle("supplemental", () => this.collectSupplementalOdds());
    };
    void tickSupplemental();
    cron.schedule("*/15 * * * *", () => void tickSupplemental());
  }

  private getSourceState(source: string): SourceRuntimeState {
    const existing = this.sourceStates.get(source);
    if (existing) return existing;

    const fresh = { failures: 0, openUntil: 0 };
    this.sourceStates.set(source, fresh);
    return fresh;
  }

  private async runSourceCycle(
    source: string,
    collect: () => Promise<UnifiedOdds[]>,
  ): Promise<void> {
    const state = this.getSourceState(source);
    if (Date.now() < state.openUntil) {
      this.logger.warn(
        { source, resumeAt: new Date(state.openUntil).toISOString() },
        "Odds source circuit open, skipping cycle",
      );
      return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await collect();
        await this.ingestOdds(data);
        state.failures = 0;
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
          { source, err, attempt, maxAttempts: MAX_RETRIES, retryInMs: delay },
          "Odds source cycle failed, retrying with backoff",
        );
        await sleep(delay);
      }
    }

    state.failures++;
    if (state.failures >= SOURCE_FAILURE_THRESHOLD) {
      state.openUntil = Date.now() + SOURCE_CIRCUIT_OPEN_MS;
      state.failures = 0;
      this.logger.error(
        { source, err: lastError, openUntil: new Date(state.openUntil).toISOString() },
        "Odds source circuit opened after repeated failures",
      );
      return;
    }

    this.logger.error(
      { source, err: lastError, failures: state.failures },
      "Odds source cycle failed",
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
