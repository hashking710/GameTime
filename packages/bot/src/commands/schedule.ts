import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, gte, and, asc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { buildMatchEmbed } from "../utils/embeds";
import { sendPaginated } from "../utils/pagination";

export default {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Show full schedule for a game")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Game to filter (e.g. cs2, nba, lol)")
        .setRequired(true)
        .addChoices(
          { name: "CS2", value: "cs2" },
          { name: "Valorant", value: "valorant" },
          { name: "League of Legends", value: "lol" },
          { name: "Dota 2", value: "dota2" },
          { name: "NFL", value: "nfl" },
          { name: "NBA", value: "nba" },
          { name: "MLB", value: "mlb" },
          { name: "NHL", value: "nhl" },
          { name: "Soccer", value: "soccer" },
          { name: "UFC", value: "ufc" },
          { name: "F1", value: "f1" },
          { name: "Tennis", value: "tennis" },
        ),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const game = interaction.options.getString("game", true);

    const upcoming = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.game, game as any),
          gte(matches.startTime, new Date()),
        ),
      )
      .orderBy(asc(matches.startTime))
      .limit(25);

    if (upcoming.length === 0) {
      await interaction.editReply(
        `No upcoming ${game.toUpperCase()} matches found.`,
      );
      return;
    }

    const embeds = upcoming.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
