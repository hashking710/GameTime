import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { gte, and, eq, asc, inArray } from "drizzle-orm";
import { matches, odds, users } from "@gametime/db";
import { getOrSet, CacheKeys, CacheTTL } from "@gametime/cache";
import { type OddsFormat } from "@gametime/shared";
import { buildMatchEmbed, buildMatchWithOddsEmbed } from "../utils/embeds";
import { getUserTier } from "../utils/tier";
import { sendPaginated } from "../utils/pagination";
import { deduplicateMatches } from "../utils/dedup";
import { parseGameOption } from "../utils/game";
import { withGameChoices } from "../utils/command-options";
import { noMatchesMessage, unsupportedGameFilterMessage } from "../utils/command-messages";
import { loadUserMatchPreferences, sortMatchesByPreferences } from "../utils/match-preferences";

export default {
  data: new SlashCommandBuilder()
    .setName("upcoming")
    .setDescription("Show upcoming matches")
    .addStringOption((opt) =>
      withGameChoices(opt, { required: false }),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db, redis } = interaction.client;
    const rawGameFilter = interaction.options.getString("game");
    const gameFilter = parseGameOption(rawGameFilter);
    if (rawGameFilter && !gameFilter) {
      await interaction.editReply(unsupportedGameFilterMessage(rawGameFilter));
      return;
    }
    const tier = await getUserTier(interaction);

    const cacheKey = gameFilter
      ? CacheKeys.matchesByGame(gameFilter)
      : CacheKeys.upcomingMatches();

    const upcomingMatches = await getOrSet(
      redis,
      cacheKey,
      async () => {
        const conditions = [
          eq(matches.status, "upcoming"),
          gte(matches.startTime, new Date()),
        ];
        if (gameFilter) {
          conditions.push(eq(matches.game, gameFilter));
        }
        return db
          .select()
          .from(matches)
          .where(and(...conditions))
          .orderBy(asc(matches.startTime))
          .limit(25);
      },
      CacheTTL.UPCOMING,
    );

    const dedupedMatches = deduplicateMatches(upcomingMatches);
    const preferences = await loadUserMatchPreferences(db, interaction.user.id);
    const sortedMatches = sortMatchesByPreferences(dedupedMatches, preferences);

    if (sortedMatches.length === 0) {
      await interaction.editReply(noMatchesMessage("upcoming"));
      return;
    }

    if (!tier.hasOdds) {
      const embeds = sortedMatches.map(buildMatchEmbed);
      await sendPaginated(interaction, embeds);
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

    const matchIds = sortedMatches.map((m) => m.id);
    const allOdds = await db
      .select()
      .from(odds)
      .where(inArray(odds.matchId, matchIds));

    const oddsByMatch = Map.groupBy(allOdds, (o) => o.matchId);

    const embeds = sortedMatches.map((match) =>
      buildMatchWithOddsEmbed(match, oddsByMatch.get(match.id) ?? [], oddsFormat),
    );

    await sendPaginated(interaction, embeds);
  },
};
