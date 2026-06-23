import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";
import { OddsFormat } from "@gametime/shared";

const TIMEZONE_CHOICES = [
  { name: "Eastern (ET)", value: "America/New_York" },
  { name: "Central (CT)", value: "America/Chicago" },
  { name: "Mountain (MT)", value: "America/Denver" },
  { name: "Pacific (PT)", value: "America/Los_Angeles" },
  { name: "Alaska (AKT)", value: "America/Anchorage" },
  { name: "Hawaii (HST)", value: "Pacific/Honolulu" },
  { name: "UTC", value: "UTC" },
  { name: "UK (GMT/BST)", value: "Europe/London" },
  { name: "Central Europe (CET)", value: "Europe/Berlin" },
  { name: "Eastern Europe (EET)", value: "Europe/Bucharest" },
  { name: "Brazil (BRT)", value: "America/Sao_Paulo" },
  { name: "Japan (JST)", value: "Asia/Tokyo" },
  { name: "Korea (KST)", value: "Asia/Seoul" },
  { name: "Australia East (AEST)", value: "Australia/Sydney" },
  { name: "India (IST)", value: "Asia/Kolkata" },
];

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
    )
    .addStringOption((opt) =>
      opt
        .setName("timezone")
        .setDescription("Your timezone (for daily digest timing)")
        .setRequired(false)
        .addChoices(...TIMEZONE_CHOICES),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const discordId = interaction.user.id;
    const oddsFormat = interaction.options.getString("odds_format");
    const timezone = interaction.options.getString("timezone");

    await db
      .insert(users)
      .values({ discordId })
      .onConflictDoNothing();

    const updates: Record<string, string> = {};
    const confirmations: string[] = [];

    if (oddsFormat) {
      updates.oddsFormat = oddsFormat;
      const label = oddsFormat === OddsFormat.AMERICAN
        ? "American (-118)"
        : "Decimal (1.85)";
      confirmations.push(`Odds format: **${label}**`);
    }

    if (timezone) {
      updates.timezone = timezone;
      confirmations.push(`Timezone: **${timezone}**`);
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set(updates)
        .where(eq(users.discordId, discordId));

      await interaction.editReply(
        `Settings updated!\n${confirmations.join("\n")}`,
      );
      return;
    }

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
      [
        "**Your Settings**",
        `Odds format: **${currentFormat}**`,
        `Timezone: **${user?.timezone ?? "UTC"}**`,
        `Daily digest: **8:00 AM** in your timezone`,
        "",
        "Use `/settings odds_format:` or `/settings timezone:` to change.",
      ].join("\n"),
    );
  },
};
