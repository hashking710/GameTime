import { EmbedBuilder } from "discord.js";
import type { InferSelectModel } from "drizzle-orm";
import type { matches, odds } from "@gametime/db";
import {
  formatOdds,
  GAME_EMOJI,
  sanitizeImageUrl,
  type OddsFormat,
  type MatchDetails,
  type MatchSubGame,
  type MatchPeriod,
} from "@gametime/shared";

type Match = InferSelectModel<typeof matches>;
type Odds = InferSelectModel<typeof odds>;

const STATUS_COLOR = {
  upcoming: 0x3498db,
  live: 0xe74c3c,
  completed: 0x95a5a6,
} as const;

export function buildMatchEmbed(match: Match): EmbedBuilder {
  const emoji = GAME_EMOJI[match.game] ?? ":trophy:";
  const details = match.details as MatchDetails | null;
  const logoUrl = sanitizeImageUrl(details?.team1Logo) ?? sanitizeImageUrl(details?.team2Logo);
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${match.team1} vs ${match.team2}`)
    .setColor(STATUS_COLOR[match.status as keyof typeof STATUS_COLOR]);

  if (logoUrl) {
    embed.setThumbnail(logoUrl);
  }


  embed.addFields(
      { name: "Game", value: match.game.toUpperCase(), inline: true },
      { name: "Tournament", value: match.tournament, inline: true },
      {
        name: "Status",
        value: match.status.toUpperCase(),
        inline: true,
      },
    );

  if (match.status === "live" || match.status === "completed") {
    let t1Score = match.team1Score ?? 0;
    let t2Score = match.team2Score ?? 0;

    // Derive series score from map winners if the stored score is 0-0
    if (t1Score === 0 && t2Score === 0 && details?.games) {
      for (const g of details.games) {
        if (g.winnerName === match.team1) t1Score++;
        else if (g.winnerName === match.team2) t2Score++;
      }
    }

    const hasAnyScore = t1Score > 0 || t2Score > 0;
    const hasPeriodScores = details?.periods?.some(
      (period) => period.team1Score != null || period.team2Score != null,
    );

    if (match.status === "completed" && !hasAnyScore && !hasPeriodScores) {
      embed.addFields({ name: "Score", value: "Result unavailable", inline: true });
    } else {
      let scoreValue = `**${t1Score} - ${t2Score}**`;
      if (details?.clock && match.status === "live") {
        scoreValue += `\n${details.clock}`;
      }
      embed.addFields({ name: "Score", value: scoreValue, inline: true });
    }

    if (details?.team1Kills != null || details?.team2Kills != null) {
      embed.addFields({
        name: "Kills",
        value: `**${details.team1Kills ?? 0} - ${details.team2Kills ?? 0}**`,
        inline: true,
      });
    }

    // Esports: map-by-map breakdown
    if (details?.games && details.games.length > 0) {
      const gameLines = formatSubGames(details.games, match.team1, match.team2, match.status === "completed");
      if (gameLines) {
        embed.addFields({
          name: details.format ? `Maps (${details.format.toUpperCase()})` : "Maps",
          value: gameLines,
          inline: false,
        });
      }
    }

    // Traditional sports: period/quarter/inning scores
    if (details?.periods && details.periods.length > 0) {
      embed.addFields({
        name: "Box Score",
        value: formatPeriodScores(details.periods, match.team1, match.team2),
        inline: false,
      });
    }
  }

  if (match.status === "upcoming") {
    embed.addFields({
      name: "Starts",
      value: `<t:${Math.floor(new Date(match.startTime).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  if (match.streamUrl) {
    embed.addFields({
      name: "Stream",
      value: `[Watch](${match.streamUrl})`,
      inline: true,
    });
  }

  return embed;
}

export function buildMatchWithOddsEmbed(
  match: Match,
  matchOdds: Odds[],
  oddsFormat: OddsFormat = "decimal",
): EmbedBuilder {
  const embed = buildMatchEmbed(match);

  if (matchOdds.length === 0) {
    return embed;
  }

  const moneyline = matchOdds.filter((o) => o.market === "moneyline");
  const spreads = matchOdds.filter((o) => o.market === "spread");
  const totals = matchOdds.filter((o) => o.market === "total");

  if (moneyline.length > 0) {
    const lines = moneyline.slice(0, 4).map((o) =>
      `**${o.bookmaker}**: ${formatOdds(o.team1Odds, oddsFormat)} / ${formatOdds(o.team2Odds, oddsFormat)}${o.drawOdds ? ` / ${formatOdds(o.drawOdds, oddsFormat)}` : ""}`,
    ).join("\n");
    embed.addFields({ name: oddsFormat === "american" ? "Moneyline (American)" : "Moneyline", value: lines });
  }

  if (spreads.length > 0) {
    const lines = spreads.slice(0, 3).map((o) =>
      `**${o.bookmaker}**: ${o.spreadValue ?? ""} @ ${formatOdds(o.team1Odds, oddsFormat)} / ${formatOdds(o.team2Odds, oddsFormat)}`,
    ).join("\n");
    embed.addFields({ name: "Spread", value: lines, inline: true });
  }

  if (totals.length > 0) {
    const lines = totals.slice(0, 3).map((o) =>
      `**${o.bookmaker}**: O/U ${o.totalValue ?? ""} @ ${formatOdds(o.overOdds ?? o.team1Odds, oddsFormat)} / ${formatOdds(o.underOdds ?? o.team2Odds, oddsFormat)}`,
    ).join("\n");
    embed.addFields({ name: "Total", value: lines, inline: true });
  }

  return embed;
}

function formatSubGames(
  games: MatchSubGame[],
  team1Name: string,
  _team2Name: string,
  matchCompleted = false,
): string {
  return games
    .map((g) => {
      const label = `Map ${g.position}`;
      const effectiveStatus = matchCompleted && g.status === "running" ? "finished" : g.status;
      if (effectiveStatus === "not_started") return `${label}: -`;
      if (effectiveStatus === "running") return `${label}: :red_circle: **LIVE**`;

      const winner = g.winnerName;
      const duration = g.duration
        ? ` (${Math.floor(g.duration / 60)}m)`
        : "";

      if (winner) {
        const icon = winner === team1Name ? ":small_blue_diamond:" : ":small_orange_diamond:";
        let statPart = "";
        if (g.team1Score != null || g.team2Score != null) {
          statPart += ` (${g.team1Score ?? 0}-${g.team2Score ?? 0})`;
        }
        if (g.team1Kills != null || g.team2Kills != null) {
          statPart += ` [K ${g.team1Kills ?? 0}-${g.team2Kills ?? 0}]`;
        }
        return `${label}: ${icon} **${winner}**${statPart}${duration}`;
      }

      if (g.team1Score != null || g.team2Score != null) {
        return `${label}: ${g.team1Score ?? 0}-${g.team2Score ?? 0}${duration}`;
      }

      return `${label}: Finished${duration}`;
    })
    .join("\n");
}

function formatPeriodScores(
  periods: MatchPeriod[],
  team1Name: string,
  team2Name: string,
): string {
  const t1Short = team1Name.split(" ").pop() ?? team1Name;
  const t2Short = team2Name.split(" ").pop() ?? team2Name;

  const header = periods.map((p) => p.label).join(" | ");
  const t1Scores = periods.map((p) => String(p.team1Score).padStart(p.label.length)).join(" | ");
  const t2Scores = periods.map((p) => String(p.team2Score).padStart(p.label.length)).join(" | ");

  return [
    `\`${padRight("", 10)} ${header}\``,
    `\`${padRight(t1Short, 10)} ${t1Scores}\``,
    `\`${padRight(t2Short, 10)} ${t2Scores}\``,
  ].join("\n");
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}
