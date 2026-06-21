import { createLogger } from "@gametime/shared";
import type { UnifiedOdds } from "@gametime/shared";
import type { Database } from "@gametime/db";
import { odds, oddsHistory, matches } from "@gametime/db";
import type { RedisClient } from "@gametime/cache";
import { eq, and, sql } from "drizzle-orm";
import { invalidatePattern } from "@gametime/cache";
import cron from "node-cron";
import { fetchPandaScoreOdds } from "./sources/pandascore";
import { fetchTheOddsApiOdds } from "./sources/theoddsapi";
import { fetchPinnacleOdds } from "./sources/pinnacle";

export class OddsCollector {
  private logger = createLogger("collector:odds");

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
      try {
        const data = await this.collectEsportsOdds();
        await this.ingestOdds(data);
      } catch (err) {
        this.logger.error({ err }, "Esports odds cycle failed");
      }
    };
    void tickEsports();
    cron.schedule("*/5 * * * *", () => void tickEsports());

    const tickTraditional = async () => {
      try {
        const data = await this.collectTraditionalOdds();
        await this.ingestOdds(data);
      } catch (err) {
        this.logger.error({ err }, "Traditional odds cycle failed");
      }
    };
    void tickTraditional();
    cron.schedule("0 */6 * * *", () => void tickTraditional());

    const tickSupplemental = async () => {
      try {
        const data = await this.collectSupplementalOdds();
        await this.ingestOdds(data);
      } catch (err) {
        this.logger.error({ err }, "Supplemental odds cycle failed");
      }
    };
    void tickSupplemental();
    cron.schedule("*/15 * * * *", () => void tickSupplemental());
  }
}
