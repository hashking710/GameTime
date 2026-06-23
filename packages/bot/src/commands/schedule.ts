import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, gte, and, asc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { buildMatchEmbed } from "../utils/embeds";
import { sendPaginated } from "../utils/pagination";
import { deduplicateMatches } from "../utils/dedup";
import { parseGameOption } from "../utils/game";
import { withGameChoices } from "../utils/command-options";
import { noMatchesMessage, unsupportedGameFilterMessage } from "../utils/command-messages";

export default {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Show full schedule for a game")
    .addStringOption((opt) =>
      withGameChoices(opt, {
        name: "game",
        description: "Game to filter (e.g. cs2, nba, lol)",
        required: true,
      }),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const rawGame = interaction.options.getString("game", true);
    const game = parseGameOption(rawGame);
    if (!game) {
      await interaction.editReply(unsupportedGameFilterMessage(rawGame));
      return;
    }

    const upcoming = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.game, game),
          gte(matches.startTime, new Date()),
        ),
      )
      .orderBy(asc(matches.startTime))
      .limit(25);

    const dedupedMatches = deduplicateMatches(upcoming);

    if (dedupedMatches.length === 0) {
      await interaction.editReply(noMatchesMessage("schedule", game));
      return;
    }

    const embeds = dedupedMatches.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
