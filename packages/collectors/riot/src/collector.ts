import { BaseCollector } from "@gametime/collector-base";
import type { UnifiedMatch } from "@gametime/shared";
import { normalizeRiotMatch, type RiotRawMatch } from "./normalizer";

interface LolesportsScheduleResponse {
  data: {
    schedule: {
      events: {
        match?: {
          id: string;
          teams: {
            code: string;
            name: string;
            result?: { gameWins: number };
          }[];
          strategy?: { count: number };
        };
        league: { name: string; slug: string };
        startTime: string;
        state: string;
        type: string;
        streams?: { provider: string; parameter: string }[];
      }[];
    };
  };
}

export class RiotCollector extends BaseCollector {
  private readonly apiUrl = "https://esports-api.lolesports.com/persisted/gw";
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
    this.logger.info("Fetching Riot Esports matches...");

    try {
      const response = await fetch(
        `${this.apiUrl}/getSchedule?hl=en-US`,
        {
          headers: {
            "x-api-key": this.apiKey,
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        this.logger.warn(
          { status: response.status },
          "Riot Esports API fetch failed",
        );
        return [];
      }

      const data = (await response.json()) as LolesportsScheduleResponse;
      return this.parseEvents(data);
    } catch (err) {
      this.logger.error({ err }, "Riot Esports fetch error");
      return [];
    }
  }

  private parseEvents(data: LolesportsScheduleResponse): UnifiedMatch[] {
    const matches: UnifiedMatch[] = [];

    for (const event of data.data.schedule.events) {
      if (event.type !== "match" || !event.match) continue;
      if (event.match.teams.length < 2) continue;

      const team1 = event.match.teams[0];
      const team2 = event.match.teams[1];

      if (!team1.name || !team2.name) continue;

      const raw: RiotRawMatch = {
        id: event.match.id,
        team1: { code: team1.code, name: team1.name },
        team2: { code: team2.code, name: team2.name },
        league: { name: event.league.name },
        startTime: event.startTime,
        state: event.state,
        streams: event.streams,
      };

      matches.push(normalizeRiotMatch(raw));
    }

    this.logger.info({ count: matches.length }, "Parsed Riot Esports matches");
    return matches;
  }
}
