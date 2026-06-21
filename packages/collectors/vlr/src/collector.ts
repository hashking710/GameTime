import { BaseCollector } from "@gametime/collector-base";
import type { UnifiedMatch } from "@gametime/shared";
import * as cheerio from "cheerio";
import { normalizeVlrMatch, type VlrRawMatch } from "./normalizer";

export class VlrCollector extends BaseCollector {
  private readonly baseUrl = "https://www.vlr.gg";

  async collect(): Promise<UnifiedMatch[]> {
    this.logger.info("Fetching VLR matches...");

    try {
      const response = await fetch(`${this.baseUrl}/matches`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        this.logger.warn({ status: response.status }, "VLR fetch failed");
        return [];
      }

      const html = await response.text();
      return this.parseMatches(html);
    } catch (err) {
      this.logger.error({ err }, "VLR fetch error");
      return [];
    }
  }

  private parseMatches(html: string): UnifiedMatch[] {
    const $ = cheerio.load(html);
    const matches: UnifiedMatch[] = [];

    $("a.match-item").each((_i, el) => {
      try {
        const $el = $(el);
        const href = $el.attr("href") ?? "";
        const idMatch = href.match(/\/(\d+)\//);
        if (!idMatch) return;

        const team1 =
          $el.find(".match-item-vs-team-name").eq(0).text().trim();
        const team2 =
          $el.find(".match-item-vs-team-name").eq(1).text().trim();

        if (!team1 || !team2 || team1 === "TBD" || team2 === "TBD") return;

        const tournament =
          $el.find(".match-item-event-series").text().trim() ||
          $el.find(".match-item-event").text().trim().split("\n")[0]?.trim() ||
          "Unknown Event";

        const timeText = $el.find(".match-item-time").text().trim();
        const isLive =
          timeText.toLowerCase() === "live" ||
          $el.find(".ml-status").text().trim().toLowerCase() === "live";

        const eta = $el.find(".match-item-eta").text().trim();
        let date: string;
        if (isLive) {
          date = new Date().toISOString();
        } else if (eta) {
          date = this.parseEta(eta);
        } else {
          date = new Date().toISOString();
        }

        const raw: VlrRawMatch = {
          id: idMatch[1],
          team1,
          team2,
          tournament,
          date,
          status: isLive ? "live" : "upcoming",
        };

        matches.push(normalizeVlrMatch(raw));
      } catch {
        // Skip malformed match elements
      }
    });

    this.logger.info({ count: matches.length }, "Parsed VLR matches");
    return matches;
  }

  private parseEta(eta: string): string {
    const now = Date.now();
    const hoursMatch = eta.match(/(\d+)h/);
    const minsMatch = eta.match(/(\d+)m/);
    let ms = 0;
    if (hoursMatch) ms += parseInt(hoursMatch[1], 10) * 3600000;
    if (minsMatch) ms += parseInt(minsMatch[1], 10) * 60000;
    return new Date(now + ms).toISOString();
  }
}
