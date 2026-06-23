import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { and, gte, lt, asc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { getOrSet, CacheKeys, CacheTTL } from "@gametime/cache";
import { buildMatchEmbed } from "../utils/embeds";
import { sendPaginated } from "../utils/pagination";
import { deduplicateMatches } from "../utils/dedup";
import { noMatchesMessage } from "../utils/command-messages";
import { loadUserMatchPreferences, sortMatchesByPreferences } from "../utils/match-preferences";

export default {
  data: new SlashCommandBuilder()
    .setName("today")
    .setDescription("Show today's matches across all sports") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db, redis } = interaction.client;

    const todayMatches = await getOrSet(
      redis,
      CacheKeys.todayMatches(),
      async () => {
        const now = new Date();
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const endOfDay = new Date(startOfDay.getTime() + 86400000);

        return db
          .select()
          .from(matches)
          .where(
            and(
              gte(matches.startTime, startOfDay),
              lt(matches.startTime, endOfDay),
            ),
          )
          .orderBy(asc(matches.startTime))
          .limit(50);
      },
      CacheTTL.TODAY,
    );

    const dedupedMatches = deduplicateMatches(todayMatches);
    const preferences = await loadUserMatchPreferences(db, interaction.user.id);
    const sortedMatches = sortMatchesByPreferences(dedupedMatches, preferences);

    if (sortedMatches.length === 0) {
      await interaction.editReply(noMatchesMessage("today"));
      return;
    }

    const embeds = sortedMatches.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
