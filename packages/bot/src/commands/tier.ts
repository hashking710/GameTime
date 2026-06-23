import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { users, userSubscriptions } from "@gametime/db";

export default {
  data: new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Check your current plan and feature access") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const discordId = interaction.user.id;

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);

    const subCount = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.discordId, discordId));

    const isPremium =
      userRows.length > 0 &&
      userRows[0].premium &&
      (!userRows[0].premiumExpiresAt ||
        userRows[0].premiumExpiresAt > new Date());

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
          value: `${subCount.length}/${isPremium ? "Unlimited" : "3"}`,
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
