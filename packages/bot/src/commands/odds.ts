import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, and, gte, asc, inArray } from "drizzle-orm";
import { matches, odds, users } from "@gametime/db";
import { isValidGame, type OddsFormat } from "@gametime/shared";
import { buildMatchWithOddsEmbed } from "../utils/embeds";
import { requirePremium } from "../utils/tier";

export default {
  data: new SlashCommandBuilder()
    .setName("odds")
    .setDescription("Show odds for upcoming matches (Premium)")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Filter by game")
        .setRequired(false)
        .addChoices(
          { name: "CS2", value: "cs2" },
          { name: "Valorant", value: "valorant" },
          { name: "Dota 2", value: "dota2" },
          { name: "NFL", value: "nfl" },
          { name: "NBA", value: "nba" },
          { name: "MLB", value: "mlb" },
          { name: "NHL", value: "nhl" },
          { name: "Soccer", value: "soccer" },
          { name: "UFC", value: "ufc" },
        ),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    if (!(await requirePremium(interaction))) return;

    const { db } = interaction.client;
    const gameFilter = interaction.options.getString("game");

    const conditions = [
      eq(matches.status, "upcoming"),
      gte(matches.startTime, new Date()),
    ];
    if (gameFilter) {
      conditions.push(eq(matches.game, gameFilter as typeof matches.game.enumValues[number]));
    }

    const upcoming = await db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(asc(matches.startTime))
      .limit(5);

    if (upcoming.length === 0) {
      await interaction.editReply("No upcoming matches with odds found.");
      return;
    }

    let oddsFormat: OddsFormat = "decimal";
    const userRows = await db
      .select({ oddsFormat: users.oddsFormat })
      .from(users)
      .where(eq(users.discordId, interaction.user.id))
      .limit(1);
    if (userRows.length > 0) {
      oddsFormat = userRows[0].oddsFormat as OddsFormat;
    }

    const matchIds = upcoming.map((m) => m.id);
    const allOdds = await db
      .select()
      .from(odds)
      .where(inArray(odds.matchId, matchIds));

    const oddsByMatch = Map.groupBy(allOdds, (o) => o.matchId);

    const embeds = upcoming.map((match) =>
      buildMatchWithOddsEmbed(match, oddsByMatch.get(match.id) ?? [], oddsFormat),
    );

    await interaction.editReply({ embeds });
  },
};
