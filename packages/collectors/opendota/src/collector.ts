import { BaseCollector } from "@gametime/collector-base";
import { MatchStatus, type UnifiedMatch } from "@gametime/shared";
import {
  normalizeOpenDotaMatch,
  type OpenDotaRawMatch,
} from "./normalizer";

interface OpenDotaProMatch {
  match_id: number;
  radiant_name: string | null;
  dire_name: string | null;
  league_name: string;
  start_time: number;
  duration: number | null;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean | null;
}

export class OpenDotaCollector extends BaseCollector {
  private readonly apiUrl = "https://api.opendota.com/api";

  async collect(): Promise<UnifiedMatch[]> {
    const matches: UnifiedMatch[] = [];

    try {
      // Fetch recent pro matches
      const proResponse = await fetch(`${this.apiUrl}/proMatches`);
      if (proResponse.ok) {
        const proMatches = (await proResponse.json()) as OpenDotaProMatch[];
        for (const m of proMatches.slice(0, 50)) {
          if (!m.radiant_name || !m.dire_name) continue;

          const raw: OpenDotaRawMatch = {
            match_id: m.match_id,
            radiant_name: m.radiant_name,
            dire_name: m.dire_name,
            league_name: m.league_name || "Pro Match",
            start_time: m.start_time,
            radiant_score: m.radiant_score,
            dire_score: m.dire_score,
          };

          matches.push(normalizeOpenDotaMatch(raw));
        }
      } else {
        this.logger.warn(
          { status: proResponse.status },
          "OpenDota proMatches fetch failed",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "OpenDota proMatches error");
    }

    try {
      // Fetch live matches
      const liveResponse = await fetch(`${this.apiUrl}/live`);
      if (liveResponse.ok) {
        const liveMatches = (await liveResponse.json()) as {
          match_id: number;
          radiant_team?: { team_name: string };
          dire_team?: { team_name: string };
          league_name?: string;
          game_time?: number;
          radiant_score?: number;
          dire_score?: number;
        }[];

        for (const m of liveMatches) {
          const radiantName = m.radiant_team?.team_name;
          const direName = m.dire_team?.team_name;
          if (!radiantName || !direName) continue;

          matches.push({
            game: "dota2",
            team1Name: radiantName,
            team2Name: direName,
            tournament: m.league_name || "Live Match",
            startTime: new Date(),
            status: MatchStatus.LIVE,
            details: {
              externalEventId: m.match_id,
              team1Kills: m.radiant_score,
              team2Kills: m.dire_score,
            },
            source: "opendota",
            sourceId: `live_${m.match_id}`,
          });
        }
      } else {
        this.logger.warn(
          { status: liveResponse.status },
          "OpenDota live fetch failed",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "OpenDota live error");
    }

    this.logger.debug({ count: matches.length }, "Fetched OpenDota matches");
    return matches;
  }
}
