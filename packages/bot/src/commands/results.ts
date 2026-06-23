import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, and, desc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { buildMatchEmbed } from "../utils/embeds";
import { deduplicateMatches } from "../utils/dedup";
import { sendPaginated } from "../utils/pagination";

export default {
  data: new SlashCommandBuilder()
    .setName("results")
    .setDescription("Recent match results")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Filter by game")
        .setRequired(false)
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
    const gameFilter = interaction.options.getString("game");

    const conditions = [eq(matches.status, "completed")];
    if (gameFilter) {
      conditions.push(eq(matches.game, gameFilter as any));
    }

    const completed = await db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(desc(matches.startTime))
      .limit(30);

    const deduped = deduplicateMatches(completed);

    if (deduped.length === 0) {
      await interaction.editReply("No recent results found.");
      return;
    }

    const embeds = deduped.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
