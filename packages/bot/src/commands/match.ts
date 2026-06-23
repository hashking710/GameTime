import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { eq, and, sql, desc, asc, gte, or, inArray } from "drizzle-orm";
import { matches, odds, matchWatches, users } from "@gametime/db";
import { GAME_EMOJI, type MatchDetails, type MatchSubGame, type MatchPeriod } from "@gametime/shared";
import { formatOdds, type OddsFormat } from "@gametime/shared";
import { deduplicateMatches, getMergedMatchIds } from "../utils/dedup";

export default {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Detailed view of a specific match")
    .addStringOption((opt) =>
      opt
        .setName("search")
        .setDescription("Search for a match")
        .setRequired(true)
        .setAutocomplete(true),
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const { db } = interaction.client;

    if (focused.length < 2) {
      await interaction.respond([]);
      return;
    }

    const results = await db
      .select({
        id: matches.id,
        team1: matches.team1,
        team2: matches.team2,
        game: matches.game,
        status: matches.status,
        tournament: matches.tournament,
      })
      .from(matches)
      .where(
        sql`(${matches.team1} ILIKE ${"%" + focused + "%"} OR ${matches.team2} ILIKE ${"%" + focused + "%"} OR ${matches.tournament} ILIKE ${"%" + focused + "%"})`,
      )
      .orderBy(
        sql`CASE WHEN ${matches.status} = 'live' THEN 0 WHEN ${matches.status} = 'upcoming' THEN 1 ELSE 2 END`,
        asc(matches.startTime),
      )
      .limit(25);

    const deduped = deduplicateMatches(results as any);

    const statusIcon: Record<string, string> = { live: "🔴", upcoming: "📅", completed: "✅" };

    await interaction.respond(
      deduped.slice(0, 25).map((m) => ({
        name: `${statusIcon[m.status] ?? ""} ${m.team1} vs ${m.team2} (${m.game.toUpperCase()})`.slice(0, 100),
        value: m.id,
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const matchId = interaction.options.getString("search", true);
    const discordId = interaction.user.id;

    // Try as match ID first (from autocomplete), fall back to text search
    let match;
    const byId = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (byId.length > 0) {
      match = byId[0];
    } else {
      const results = await db
        .select()
        .from(matches)
        .where(
          sql`(${matches.team1} ILIKE ${"%" + matchId + "%"} OR ${matches.team2} ILIKE ${"%" + matchId + "%"})`,
        )
        .orderBy(
          sql`CASE WHEN ${matches.status} = 'live' THEN 0 WHEN ${matches.status} = 'upcoming' THEN 1 ELSE 2 END`,
          desc(matches.startTime),
        )
        .limit(1);
      match = results[0];
    }

    if (!match) {
      await interaction.editReply("No match found.");
      return;
    }
    const details = match.details as MatchDetails | null;
    const emoji = GAME_EMOJI[match.game] ?? ":trophy:";

    const userRow = await db
      .select({ oddsFormat: users.oddsFormat })
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);
    const oddsFormat: OddsFormat = (userRow[0]?.oddsFormat as OddsFormat) ?? "decimal";

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${match.team1} vs ${match.team2}`)
      .setColor(
        match.status === "live" ? 0xe74c3c :
        match.status === "upcoming" ? 0x3498db : 0x95a5a6,
      );

    if (details?.team1Logo) {
      embed.setThumbnail(details.team1Logo);
    }

    embed.addFields(
      { name: "Game", value: match.game.toUpperCase(), inline: true },
      { name: "Tournament", value: match.tournament, inline: true },
      { name: "Status", value: match.status.toUpperCase(), inline: true },
    );

    if (match.status === "live" || match.status === "completed") {
      let scoreVal = `**${match.team1Score ?? 0} - ${match.team2Score ?? 0}**`;
      if (details?.clock && match.status === "live") {
        scoreVal += `\n${details.clock}`;
      }
      embed.addFields({ name: "Score", value: scoreVal, inline: true });
    }

    if (match.status === "upcoming") {
      embed.addFields({
        name: "Starts",
        value: `<t:${Math.floor(match.startTime.getTime() / 1000)}:F>\n(<t:${Math.floor(match.startTime.getTime() / 1000)}:R>)`,
        inline: true,
      });
    }

    if (details?.games && details.games.length > 0) {
      const mapLines = details.games.map((g: MatchSubGame) => {
        if (g.status === "not_started") return `Map ${g.position}: -`;
        if (g.status === "running") return `Map ${g.position}: :red_circle: **LIVE**`;
        const dur = g.duration ? ` (${Math.floor(g.duration / 60)}m)` : "";
        return g.winnerName
          ? `Map ${g.position}: **${g.winnerName}**${dur}`
          : `Map ${g.position}: Finished${dur}`;
      }).join("\n");
      embed.addFields({
        name: details.format ? `Maps (${details.format.toUpperCase()})` : "Maps",
        value: mapLines,
        inline: false,
      });
    }

    if (details?.periods && details.periods.length > 0) {
      const t1 = match.team1.split(" ").pop() ?? match.team1;
      const t2 = match.team2.split(" ").pop() ?? match.team2;
      const header = details.periods.map((p: MatchPeriod) => p.label).join(" | ");
      const r1 = details.periods.map((p: MatchPeriod) => String(p.team1Score).padStart(p.label.length)).join(" | ");
      const r2 = details.periods.map((p: MatchPeriod) => String(p.team2Score).padStart(p.label.length)).join(" | ");
      embed.addFields({
        name: "Box Score",
        value: `\`${"".padEnd(10)} ${header}\`\n\`${t1.padEnd(10)} ${r1}\`\n\`${t2.padEnd(10)} ${r2}\``,
        inline: false,
      });
    }

    if (match.streamUrl) {
      embed.addFields({ name: "Stream", value: `[Watch Live](${match.streamUrl})`, inline: true });
    }

    const oddsMatchIds = getMergedMatchIds(match.id);
    const matchOdds = await db
      .select()
      .from(odds)
      .where(inArray(odds.matchId, oddsMatchIds));

    const moneyline = matchOdds.filter((o) => o.market === "moneyline");
    const spreads = matchOdds.filter((o) => o.market === "spread");
    const totals = matchOdds.filter((o) => o.market === "total");

    if (moneyline.length > 0) {
      const lines = moneyline.slice(0, 6).map((o) =>
        `**${o.bookmaker}**: ${formatOdds(o.team1Odds, oddsFormat)} / ${formatOdds(o.team2Odds, oddsFormat)}${o.drawOdds ? ` / ${formatOdds(o.drawOdds, oddsFormat)}` : ""}`,
      ).join("\n");
      embed.addFields({ name: "Moneyline", value: lines, inline: false });
    }

    if (spreads.length > 0) {
      const lines = spreads.slice(0, 4).map((o) =>
        `**${o.bookmaker}**: ${o.spreadValue ?? ""} @ ${formatOdds(o.team1Odds, oddsFormat)} / ${formatOdds(o.team2Odds, oddsFormat)}`,
      ).join("\n");
      embed.addFields({ name: "Spreads", value: lines, inline: false });
    }

    if (totals.length > 0) {
      const lines = totals.slice(0, 4).map((o) =>
        `**${o.bookmaker}**: O/U ${o.totalValue ?? ""} @ ${formatOdds(o.overOdds ?? o.team1Odds, oddsFormat)} / ${formatOdds(o.underOdds ?? o.team2Odds, oddsFormat)}`,
      ).join("\n");
      embed.addFields({ name: "Totals", value: lines, inline: false });
    }

    embed.setFooter({ text: `Source: ${match.source} · ID: ${match.id.slice(0, 8)}` });

    const existing = await db
      .select()
      .from(matchWatches)
      .where(
        and(eq(matchWatches.discordId, discordId), eq(matchWatches.matchId, match.id)),
      )
      .limit(1);

    const isWatching = existing.length > 0;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`watch_${match.id}`)
        .setLabel(isWatching ? "Watching" : "Watch Match")
        .setStyle(isWatching ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(isWatching || match.status === "completed"),
    );

    if (false as boolean) {
      ([] as any[]).forEach((m) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`switch_${m.id}`)
            .setLabel(`${m.team1} vs ${m.team2}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary),
        );
      });
    }

    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === discordId,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async (i) => {
      if (i.customId.startsWith("watch_")) {
        const watchMatchId = i.customId.replace("watch_", "");

        await db
          .insert(users)
          .values({ discordId })
          .onConflictDoNothing();

        await db
          .insert(matchWatches)
          .values({ discordId, matchId: watchMatchId })
          .onConflictDoNothing();

        const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`watch_${watchMatchId}`)
            .setLabel("Watching")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        );

        await i.update({ components: [updatedRow] });
      }
    });
  },
};
