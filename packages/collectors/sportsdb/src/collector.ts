import { BaseCollector } from "@gametime/collector-base";
import type { UnifiedMatch } from "@gametime/shared";
import {
  SPORTSDB_LEAGUE_MAP,
  normalizeSportsDbEvent,
  type SportsDbRawEvent,
} from "./normalizer";
import { updateLiveScores } from "./espn";
import cron from "node-cron";

export class SportsDbCollector extends BaseCollector {
  private apiKey: string;

  constructor(
    name: string,
    db: ConstructorParameters<typeof BaseCollector>[1],
    redis: ConstructorParameters<typeof BaseCollector>[2],
    schedule: string,
    apiKey: string,
  ) {
    super(name, db, redis, schedule);
    this.apiKey = apiKey;
  }

  async collect(): Promise<UnifiedMatch[]> {
    const allMatches: UnifiedMatch[] = [];

    for (const [leagueId, game] of Object.entries(SPORTSDB_LEAGUE_MAP)) {
      try {
        const url = `https://www.thesportsdb.com/api/v1/json/${this.apiKey}/eventsnextleague.php?id=${leagueId}`;
        const response = await fetch(url);

        if (!response.ok) {
          this.logger.warn(
            { leagueId, status: response.status },
            "SportsDB fetch failed for league",
          );
          continue;
        }

        const data = (await response.json()) as {
          events: SportsDbRawEvent[] | null;
        };
        if (!data.events) continue;

        for (const e of data.events) {
          if (!e.strHomeTeam || !e.strAwayTeam) continue;
          allMatches.push(normalizeSportsDbEvent(e, game));
        }
      } catch (err) {
        this.logger.error({ err, leagueId }, "SportsDB league fetch error");
      }
    }

    return allMatches;
  }

  override start(): void {
    super.start();

    // ESPN live score updates every 2 minutes
    const tickEspn = async () => {
      try {
        await updateLiveScores(this.db, this.redis);
      } catch (err) {
        this.logger.error({ err }, "ESPN live update failed");
      }
    };
    void tickEspn();
    cron.schedule("*/2 * * * *", () => void tickEspn());
  }
}
