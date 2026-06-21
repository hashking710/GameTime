import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";
import { OddsFormat } from "@gametime/shared";

export default {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configure your GameTime preferences")
    .addStringOption((opt) =>
      opt
        .setName("odds_format")
        .setDescription("Odds display format")
        .setRequired(false)
        .addChoices(
          { name: "Decimal (1.85)", value: "decimal" },
          { name: "American (-118)", value: "american" },
        ),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const discordId = interaction.user.id;
    const oddsFormat = interaction.options.getString("odds_format");

    // Ensure user exists
    await db
      .insert(users)
      .values({ discordId })
      .onConflictDoNothing();

    if (oddsFormat) {
      await db
        .update(users)
        .set({ oddsFormat })
        .where(eq(users.discordId, discordId));

      const label = oddsFormat === OddsFormat.AMERICAN
        ? "American (-118)"
        : "Decimal (1.85)";
      await interaction.editReply(
        `Odds format updated to **${label}**.`,
      );
      return;
    }

    // Show current settings
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);

    const user = userRows[0];
    const currentFormat = user?.oddsFormat === "american"
      ? "American (-118)"
      : "Decimal (1.85)";

    await interaction.editReply(
      `**Your Settings**\n` +
      `Odds format: **${currentFormat}**\n` +
      `Timezone: **${user?.timezone ?? "UTC"}**\n\n` +
      `Use \`/settings odds_format:<value>\` to change your preferences.`,
    );
  },
};
