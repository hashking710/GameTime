import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { eq, sql, and } from "drizzle-orm";
import { users, teams, userSubscriptions } from "@gametime/db";
import { getUserTier } from "../utils/tier";

export default {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Follow a team to get match notifications")
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Team name")
        .setRequired(true)
        .setAutocomplete(true),
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const { db } = interaction.client;

    const results = await db
      .selectDistinctOn([teams.canonicalName], {
        id: teams.id,
        name: sql<string>`COALESCE(${teams.canonicalName}, ${teams.name})`.as("display_name"),
        game: teams.game,
      })
      .from(teams)
      .where(
        sql`(${teams.name} ILIKE ${"%" + focused + "%"} OR ${teams.canonicalName} ILIKE ${"%" + focused + "%"})`,
      )
      .limit(25);

    await interaction.respond(
      results.map((t) => ({
        name: `${t.name} (${t.game})`.slice(0, 100),
        value: t.id,
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const teamId = interaction.options.getString("team", true);
    const discordId = interaction.user.id;

    await db
      .insert(users)
      .values({ discordId })
      .onConflictDoNothing();

    const tier = await getUserTier(interaction);
    const existingSubs = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.discordId, discordId));

    if (existingSubs.length >= tier.maxTeams) {
      await interaction.editReply(
        `You've reached the maximum of **${tier.maxTeams} teams** on your current plan. Upgrade to Premium for unlimited tracking!`,
      );
      return;
    }

    const existing = existingSubs.find((s) => s.teamId === teamId);
    if (existing) {
      await interaction.editReply("You're already tracking this team!");
      return;
    }

    const selectedTeam = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const canonical = selectedTeam[0]?.canonicalName ?? selectedTeam[0]?.name;
    if (!canonical) {
      await interaction.editReply("Team not found.");
      return;
    }

    const allVariants = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        sql`(${teams.canonicalName} = ${canonical} OR ${teams.name} = ${canonical})`,
      );

    const existingTeamIds = new Set(existingSubs.map((s) => s.teamId));
    let added = 0;
    for (const variant of allVariants) {
      if (existingTeamIds.has(variant.id)) continue;
      await db
        .insert(userSubscriptions)
        .values({ discordId, teamId: variant.id })
        .onConflictDoNothing();
      added++;
    }

    await interaction.editReply(
      `Now tracking **${canonical}**! You'll be notified before their matches across all sources.`,
    );
  },
};
