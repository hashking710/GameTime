import { EmbedBuilder } from "discord.js";
import type { InferSelectModel } from "drizzle-orm";
import type { matches, odds } from "@gametime/db";
import { formatOdds, GAME_EMOJI, type OddsFormat, type MatchDetails, type MatchSubGame, type MatchPeriod } from "@gametime/shared";

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
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${match.team1} vs ${match.team2}`)
    .setColor(STATUS_COLOR[match.status as keyof typeof STATUS_COLOR]);

  if (details?.team1Logo) {
    embed.setThumbnail(details.team1Logo);
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
    let scoreValue = `**${match.team1Score ?? 0} - ${match.team2Score ?? 0}**`;
    if (details?.clock && match.status === "live") {
      scoreValue += `\n${details.clock}`;
    }
    embed.addFields({ name: "Score", value: scoreValue, inline: true });

    // Esports: map-by-map breakdown
    if (details?.games && details.games.length > 0) {
      const gameLines = formatSubGames(details.games, match.team1, match.team2);
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
      value: `<t:${Math.floor(match.startTime.getTime() / 1000)}:R>`,
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

  const moneylineOdds = matchOdds.filter((o) => o.market === "moneyline");
  if (moneylineOdds.length > 0) {
    const oddsLines = moneylineOdds
      .slice(0, 5)
      .map(
        (o) =>
          `**${o.bookmaker}**: ${formatOdds(o.team1Odds, oddsFormat)} / ${formatOdds(o.team2Odds, oddsFormat)}${o.drawOdds ? ` / ${formatOdds(o.drawOdds, oddsFormat)}` : ""}`,
      )
      .join("\n");

    const label = oddsFormat === "american" ? "Odds (American)" : "Odds (Moneyline)";
    embed.addFields({ name: label, value: oddsLines });
  }

  return embed;
}

function formatSubGames(
  games: MatchSubGame[],
  team1Name: string,
  _team2Name: string,
): string {
  return games
    .map((g) => {
      const label = `Map ${g.position}`;
      if (g.status === "not_started") return `${label}: -`;
      if (g.status === "running") return `${label}: :red_circle: **LIVE**`;

      const winner = g.winnerName;
      const duration = g.duration
        ? ` (${Math.floor(g.duration / 60)}m)`
        : "";

      if (winner) {
        const icon = winner === team1Name ? ":small_blue_diamond:" : ":small_orange_diamond:";
        return `${label}: ${icon} **${winner}**${duration}`;
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
