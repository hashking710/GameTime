import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { userSubscriptions } from "@gametime/db";
import { getUserTier } from "../utils/tier";

export default {
  data: new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Check your current plan and feature access") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const discordId = interaction.user.id;

    const subCount = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.discordId, discordId));

    const tier = await getUserTier(interaction);
    const isPremium = tier.hasOdds;

    const embed = new EmbedBuilder()
      .setTitle("Your GameTime Plan")
      .setColor(isPremium ? 0xf1c40f : 0x3498db)
      .addFields(
        {
          name: "Tier",
          value: isPremium ? "Premium" : "Free",
          inline: true,
        },
        {
          name: "Teams Tracked",
          value: `${subCount.length}/${tier.maxTeams}`,
          inline: true,
        },
        {
          name: "Odds Access",
          value: isPremium ? "Full" : "None",
          inline: true,
        },
        {
          name: "Reminders",
          value: isPremium
            ? "60m, 30m, 15m, 5m, Live"
            : "30m, Live",
          inline: true,
        },
      );

    if (!isPremium) {
      embed.setFooter({
        text: "Upgrade to Premium for unlimited teams, odds, and more!",
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
