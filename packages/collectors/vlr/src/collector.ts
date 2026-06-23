import { BaseCollector } from "@gametime/collector-base";
import type { UnifiedMatch } from "@gametime/shared";
import { normalizeVlrMatch, type VlrRawMatch } from "./normalizer";

interface ParsedVlrMapScore {
  position: number;
  status: "finished" | "running" | "not_started";
  team1Score?: number;
  team2Score?: number;
}

interface ParsedVlrSeriesScore {
  team1Score: number;
  team2Score: number;
}

export class VlrCollector extends BaseCollector {
  private readonly baseUrl = "https://www.vlr.gg";

  async collect(): Promise<UnifiedMatch[]> {
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
      const liveAndUpcoming = await this.parseMatches(html);

      const resultsResponse = await fetch(`${this.baseUrl}/matches/results`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!resultsResponse.ok) {
        this.logger.warn({ status: resultsResponse.status }, "VLR results fetch failed");
        return liveAndUpcoming;
      }

      const resultsHtml = await resultsResponse.text();
      const completed = await this.parseResults(resultsHtml);

      return [...liveAndUpcoming, ...completed];
    } catch (err) {
      this.logger.error({ err }, "VLR fetch error");
      return [];
    }
  }

  private async parseMatches(html: string): Promise<UnifiedMatch[]> {
    const matches: UnifiedMatch[] = [];
    const candidates: {
      id: string;
      href: string;
      team1: string;
      team2: string;
      tournament: string;
      date: string;
      status: "live" | "upcoming";
    }[] = [];

    const blocks = html.match(/<a[^>]*class="[^"]*match-item[^"]*"[\s\S]*?<\/a>/g) ?? [];

    for (const block of blocks) {
      try {
        const href = this.extractMatch(block, /href="([^"]+)"/) ?? "";
        const idMatch = href.match(/\/(\d+)\//);
        if (!idMatch) continue;

        const teamMatches = Array.from(
          block.matchAll(/match-item-vs-team-name[^>]*>([\s\S]*?)<\/div>/g),
        );
        const team1 = this.cleanText(teamMatches[0]?.[1] ?? "");
        const team2 = this.cleanText(teamMatches[1]?.[1] ?? "");

        if (!team1 || !team2 || team1 === "TBD" || team2 === "TBD") continue;

        const tournament =
          this.cleanText(this.extractMatch(block, /match-item-event-series[^>]*>([\s\S]*?)<\/div>/) ?? "") ||
          this.cleanText(this.extractMatch(block, /match-item-event[^>]*>([\s\S]*?)<\/div>/) ?? "") ||
          "Unknown Event";

        const timeText = this.cleanText(this.extractMatch(block, /match-item-time[^>]*>([\s\S]*?)<\/div>/) ?? "");
        const mlStatus = this.cleanText(this.extractMatch(block, /ml-status[^>]*>([\s\S]*?)<\/div>/) ?? "");
        const isLive =
          timeText.toLowerCase() === "live" ||
          mlStatus.toLowerCase() === "live";

        const eta = this.cleanText(this.extractMatch(block, /match-item-eta[^>]*>([\s\S]*?)<\/div>/) ?? "");
        let date: string | undefined;
        if (isLive) {
          date = new Date().toISOString();
        } else {
          date = this.parseEta(eta) ?? this.parseClockTime(timeText);
        }

        if (!date) continue;

        candidates.push({
          id: idMatch[1],
          href,
          team1,
          team2,
          tournament,
          date,
          status: isLive ? "live" : "upcoming",
        });
      } catch {
        // Skip malformed match elements
      }
    }

    // Handle multiple matches with same (team1, team2, date) by adding minute offsets
    // This prevents identical timestamps when VLR only provides clock times
    const dateGroupMap = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const key = `${candidate.team1}:${candidate.team2}:${candidate.date.slice(0, 10)}`; // Date part only
      if (!dateGroupMap.has(key)) {
        dateGroupMap.set(key, []);
      }
      dateGroupMap.get(key)!.push(candidate);
    }

    // Apply sequential minute offsets to duplicates
    for (const group of dateGroupMap.values()) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const offsetMs = i * 5 * 60 * 1000; // 5 minute offset per duplicate
          const offsetDate = new Date(new Date(group[i].date).getTime() + offsetMs);
          group[i].date = offsetDate.toISOString();
        }
      }
    }

    for (const candidate of candidates) {
      let maps: ParsedVlrMapScore[] | undefined;
      if (candidate.status !== "upcoming") {
        maps = await this.fetchLiveMapScores(candidate.href);
      }

      const raw: VlrRawMatch = {
        id: candidate.id,
        team1: candidate.team1,
        team2: candidate.team2,
        tournament: candidate.tournament,
        date: candidate.date,
        status: candidate.status,
        maps,
      };

      matches.push(normalizeVlrMatch(raw));
    }

    this.logger.debug({ count: matches.length }, "Parsed VLR matches");
    return matches;
  }

  private async parseResults(html: string): Promise<UnifiedMatch[]> {
    const matches: UnifiedMatch[] = [];

    // Step 1: collect date section headers with their string positions.
    // VLR groups completed results under "wf-label mod-large" headings.
    const dateSections: { pos: number; date: Date }[] = [];
    const labelRegex = /<div[^>]*class="[^"]*wf-label[^"]*mod-large[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = labelRegex.exec(html)) !== null) {
      const raw = this.cleanText(labelMatch[1] ?? "")
        .replace(/\b(Today|Yesterday|Tomorrow)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        dateSections.push({ pos: labelMatch.index, date: d });
      }
    }

    // Step 2: scan all match-item anchors.  For each completed one, find the
    // nearest preceding date section header to know the match date.
    const blockRegex = /<a[^>]*class="[^"]*match-item[^"]*"[\s\S]*?<\/a>/g;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockRegex.exec(html)) !== null) {
      try {
        const block = blockMatch[0];
        const blockPos = blockMatch.index;

        // Only process completed rows.
        const mlStatus = this.cleanText(
          this.extractMatch(block, /ml-status[^>]*>([\s\S]*?)<\/div>/) ?? "",
        );
        if (!mlStatus.toLowerCase().includes("complet")) continue;

        const href = this.extractMatch(block, /href="([^"]+)"/) ?? "";
        const idMatch = href.match(/\/(\d+)\//);
        if (!idMatch) continue;

        const teamNames = Array.from(
          block.matchAll(/match-item-vs-team-name[^>]*>([\s\S]*?)<\/div>/g),
        ).map((m) => this.cleanText(m[1] ?? ""));

        const scoreRaw = Array.from(
          block.matchAll(/match-item-vs-team-score[^>]*>([\s\S]*?)<\/div>/g),
        ).map((m) => this.cleanText(m[1] ?? ""));

        const team1 = teamNames[0] ?? "";
        const team2 = teamNames[1] ?? "";
        const team1Score = Number.parseInt(scoreRaw[0] ?? "", 10);
        const team2Score = Number.parseInt(scoreRaw[1] ?? "", 10);

        if (!team1 || !team2) continue;
        if (!Number.isFinite(team1Score) || !Number.isFinite(team2Score)) continue;

        const tournament = this.cleanText(
          this.extractMatch(block, /match-item-event-series[^>]*>([\s\S]*?)<\/div>/) ??
          this.extractMatch(block, /match-item-event[^>]*>([\s\S]*?)<\/div>/) ??
          "",
        );
        if (!tournament) continue;

        // Find nearest preceding date label.
        const section = [...dateSections].reverse().find((s) => s.pos < blockPos);
        const timeText = this.cleanText(
          this.extractMatch(block, /match-item-time[^>]*>([\s\S]*?)<\/div>/) ?? "",
        );
        const baseDate = section?.date ?? new Date();
        const date = this.applyTimeToDate(baseDate, timeText);

        matches.push(
          normalizeVlrMatch({
            id: idMatch[1],
            team1,
            team2,
            tournament,
            date: date.toISOString(),
            status: "completed",
            team1Score,
            team2Score,
          }),
        );
      } catch {
        // Skip malformed entries.
      }
    }

    this.logger.debug({ count: matches.length }, "Parsed VLR results");
    return matches;
  }

  private applyTimeToDate(base: Date, timeText: string): Date {
    const result = new Date(base);
    const m = timeText.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return result;
    let hour = Number.parseInt(m[1] ?? "0", 10);
    const minute = Number.parseInt(m[2] ?? "0", 10);
    const mer = m[3]?.toUpperCase();
    if (mer === "PM" && hour < 12) hour += 12;
    if (mer === "AM" && hour === 12) hour = 0;
    result.setHours(hour, minute, 0, 0);
    return result;
  }

  private async fetchLiveMapScores(href: string): Promise<ParsedVlrMapScore[] | undefined> {
    const path = href.startsWith("/") ? href : `/${href}`;

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        this.logger.warn({ status: response.status, path }, "VLR live match page fetch failed");
        return undefined;
      }
      const html = await response.text();

      // Try to extract game sections with more flexible patterns
      const maps: ParsedVlrMapScore[] = [];
      
      // Pattern 1: vm-stats-game-header blocks (strict, original pattern)
      let headerMatches = Array.from(
        html.matchAll(/<div class="vm-stats-game-header">([\s\S]*?)<\/div>\s*<\/div>\s*<div style="text-align: center; margin-top: 15px;">/g),
      );

      // Pattern 2: if no matches, try a more lenient pattern for vm-stats-game sections
      if (headerMatches.length === 0) {
        headerMatches = Array.from(
          html.matchAll(/<div[^>]*class="[^"]*vm-stats-game[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g),
        );
      }

      // Pattern 3: if still no matches, try finding game score blocks
      if (headerMatches.length === 0) {
        headerMatches = Array.from(
          html.matchAll(/<div[^>]*class="[^"]*score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi),
        );
      }

      if (headerMatches.length === 0) {
        this.logger.warn({ path }, "VLR live match: no game sections found in page");
        return undefined;
      }

      headerMatches.forEach((headerMatch, idx) => {
        try {
          const headerHtml = headerMatch[1] ?? "";
          const contextStart = Math.max(0, (headerMatch.index ?? 0) - 220);
          const context = html.slice(contextStart, headerMatch.index ?? 0);
          const isActive = context.includes("mod-active") || context.includes("LIVE");

          // Try to extract scores from the header
          const scoreMatches = Array.from(headerHtml.matchAll(/<div[^>]*class="[^"]*score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi));
          const team1ScoreText = scoreMatches[0]?.[1] ?? "";
          const team2ScoreText = scoreMatches[1]?.[1] ?? "";
          const team1Score = parseInt(team1ScoreText, 10);
          const team2Score = parseInt(team2ScoreText, 10);

          const hasTeam1 = Number.isFinite(team1Score);
          const hasTeam2 = Number.isFinite(team2Score);
          let status: "finished" | "running" | "not_started" = "not_started";
          if (isActive) {
            status = "running";
          } else if ((hasTeam1 && team1Score > 0) || (hasTeam2 && team2Score > 0)) {
            status = "finished";
          }

          if (!hasTeam1 && !hasTeam2 && status === "not_started") return;

          maps.push({
            position: maps.length + 1,
            status,
            ...(hasTeam1 ? { team1Score } : {}),
            ...(hasTeam2 ? { team2Score } : {}),
          });
        } catch (err) {
          this.logger.warn({ err, gameIndex: idx, path }, "VLR live match: error parsing single game section");
        }
      });

      if (maps.length > 0) {
        this.logger.debug({ count: maps.length, path }, "VLR live match: extracted maps");
        return maps;
      }
      
      this.logger.warn({ path }, "VLR live match: no valid maps extracted");
      return undefined;
    } catch (err) {
      this.logger.warn({ err, path }, "VLR live match page fetch error");
      return undefined;
    }
  }

  private extractMatch(value: string, pattern: RegExp): string | undefined {
    return value.match(pattern)?.[1];
  }

  private cleanText(value: string): string {
    return value
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&ndash;/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseEta(eta: string): string | undefined {
    const normalized = eta.toLowerCase();
    const daysMatch = normalized.match(/(\d+)d/);
    const hoursMatch = normalized.match(/(\d+)h/);
    const minsMatch = normalized.match(/(\d+)m/);

    let ms = 0;
    if (daysMatch) ms += parseInt(daysMatch[1], 10) * 86400000;
    if (hoursMatch) ms += parseInt(hoursMatch[1], 10) * 3600000;
    if (minsMatch) ms += parseInt(minsMatch[1], 10) * 60000;
    if (ms <= 0) return undefined;

    return new Date(Date.now() + ms).toISOString();
  }

  private parseClockTime(timeText: string): string | undefined {
    const match = timeText.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return undefined;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();

    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;

    const now = new Date();
    const parsed = new Date(now);
    parsed.setSeconds(0, 0);
    parsed.setHours(hour, minute, 0, 0);

    // When VLR only gives clock time, treat already-passed times as next-day schedule slots.
    if (parsed.getTime() < now.getTime() - 15 * 60000) {
      parsed.setDate(parsed.getDate() + 1);
    }

    return parsed.toISOString();
  }
}
