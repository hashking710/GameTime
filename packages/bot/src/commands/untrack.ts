import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { eq, and, sql } from "drizzle-orm";
import { teams, userSubscriptions } from "@gametime/db";

export default {
  data: new SlashCommandBuilder()
    .setName("untrack")
    .setDescription("Stop following a team")
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
    const discordId = interaction.user.id;

    const results = await db
      .select({ id: teams.id, name: teams.name, game: teams.game })
      .from(userSubscriptions)
      .innerJoin(teams, eq(userSubscriptions.teamId, teams.id))
      .where(
        and(
          eq(userSubscriptions.discordId, discordId),
          sql`${teams.name} ILIKE ${"%" + focused + "%"}`,
        ),
      )
      .limit(25);

    await interaction.respond(
      results.map((t) => ({ name: `${t.name} (${t.game})`, value: t.id })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const teamId = interaction.options.getString("team", true);
    const discordId = interaction.user.id;

    const deleted = await db
      .delete(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.discordId, discordId),
          eq(userSubscriptions.teamId, teamId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      await interaction.editReply("You weren't tracking that team.");
      return;
    }

    await interaction.editReply("Team unfollowed. You won't receive notifications for their matches anymore.");
  },
};
