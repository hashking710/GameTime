import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, and, desc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { buildMatchEmbed } from "../utils/embeds";
import { deduplicateMatches } from "../utils/dedup";
import { parseGameOption } from "../utils/game";
import { sendPaginated } from "../utils/pagination";
import { withGameChoices } from "../utils/command-options";
import { noMatchesMessage, unsupportedGameFilterMessage } from "../utils/command-messages";

export default {
  data: new SlashCommandBuilder()
    .setName("results")
    .setDescription("Recent match results")
    .addStringOption((opt) =>
      withGameChoices(opt, { required: false }),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const rawGameFilter = interaction.options.getString("game");
    const gameFilter = parseGameOption(rawGameFilter);
    if (rawGameFilter && !gameFilter) {
      await interaction.editReply(unsupportedGameFilterMessage(rawGameFilter));
      return;
    }

    const conditions = [eq(matches.status, "completed")];
    if (gameFilter) {
      conditions.push(eq(matches.game, gameFilter));
    }

    const completed = await db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(desc(matches.startTime))
      .limit(30);

    const deduped = deduplicateMatches(completed);

    if (deduped.length === 0) {
      await interaction.editReply(noMatchesMessage("results"));
      return;
    }

    const embeds = deduped.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
