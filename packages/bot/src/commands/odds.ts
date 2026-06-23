import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, and, gte, asc, inArray } from "drizzle-orm";
import { matches, odds, users } from "@gametime/db";
import { type OddsFormat } from "@gametime/shared";
import { buildMatchWithOddsEmbed } from "../utils/embeds";
import { requirePremium } from "../utils/tier";
import { parseGameOption } from "../utils/game";
import { withGameChoices } from "../utils/command-options";
import { noMatchesMessage, unsupportedGameFilterMessage } from "../utils/command-messages";
import { deduplicateMatches, getMergedMatchIds } from "../utils/dedup";

export default {
  data: new SlashCommandBuilder()
    .setName("odds")
    .setDescription("Show odds for upcoming matches (Premium)")
    .addStringOption((opt) =>
      withGameChoices(opt, { required: false }),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!(await requirePremium(interaction))) return;

    const { db } = interaction.client;
    const rawGameFilter = interaction.options.getString("game");
    const gameFilter = parseGameOption(rawGameFilter);
    if (rawGameFilter && !gameFilter) {
      await interaction.editReply(unsupportedGameFilterMessage(rawGameFilter));
      return;
    }

    const conditions = [
      eq(matches.status, "upcoming"),
      gte(matches.startTime, new Date()),
    ];
    if (gameFilter) {
      conditions.push(eq(matches.game, gameFilter));
    }

    const upcoming = await db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(asc(matches.startTime))
      .limit(5);

    const deduped = deduplicateMatches(upcoming);

    if (deduped.length === 0) {
      await interaction.editReply(noMatchesMessage("odds"));
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

    const allMergedIds = deduped.flatMap((m) => getMergedMatchIds(m.id));
    const allOdds = await db
      .select()
      .from(odds)
      .where(inArray(odds.matchId, allMergedIds));

    const oddsByMatch = new Map<string, typeof allOdds>();
    for (const o of allOdds) {
      for (const m of deduped) {
        if (getMergedMatchIds(m.id).includes(o.matchId)) {
          if (!oddsByMatch.has(m.id)) oddsByMatch.set(m.id, []);
          oddsByMatch.get(m.id)!.push(o);
          break;
        }
      }
    }

    const embeds = deduped.map((match) =>
      buildMatchWithOddsEmbed(match, oddsByMatch.get(match.id) ?? [], oddsFormat),
    );

    await interaction.editReply({ embeds });
  },
};
