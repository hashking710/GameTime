import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { gte, and, eq, asc, inArray } from "drizzle-orm";
import { matches, odds, users } from "@gametime/db";
import { getOrSet, CacheKeys, CacheTTL } from "@gametime/cache";
import { isValidGame, type OddsFormat } from "@gametime/shared";
import { buildMatchEmbed, buildMatchWithOddsEmbed } from "../utils/embeds";
import { getUserTier } from "../utils/tier";
import { sendPaginated } from "../utils/pagination";

export default {
  data: new SlashCommandBuilder()
    .setName("upcoming")
    .setDescription("Show upcoming matches")
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
    await interaction.deferReply();
    const { db, redis } = interaction.client;
    const gameFilter = interaction.options.getString("game");
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
          conditions.push(eq(matches.game, gameFilter as typeof matches.game.enumValues[number]));
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

    if (upcomingMatches.length === 0) {
      await interaction.editReply("No upcoming matches found.");
      return;
    }

    if (!tier.hasOdds) {
      const embeds = upcomingMatches.map(buildMatchEmbed);
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

    const matchIds = upcomingMatches.map((m) => m.id);
    const allOdds = await db
      .select()
      .from(odds)
      .where(inArray(odds.matchId, matchIds));

    const oddsByMatch = Map.groupBy(allOdds, (o) => o.matchId);

    const embeds = upcomingMatches.map((match) =>
      buildMatchWithOddsEmbed(match, oddsByMatch.get(match.id) ?? [], oddsFormat),
    );

    await sendPaginated(interaction, embeds);
  },
};
