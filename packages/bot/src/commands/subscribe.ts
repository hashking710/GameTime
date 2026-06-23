import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";

const KOFI_URL = process.env.KOFI_URL ?? "https://ko-fi.com/gametime";

export default {
  data: new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("Get GameTime Premium for odds, unlimited tracking, and more") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db } = interaction.client;
    const discordId = interaction.user.id;

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);

    const isPremium =
      userRows.length > 0 &&
      userRows[0].premium &&
      (!userRows[0].premiumExpiresAt ||
        userRows[0].premiumExpiresAt > new Date());

    if (isPremium) {
      const expiresAt = userRows[0].premiumExpiresAt;
      const embed = new EmbedBuilder()
        .setTitle("You're already Premium!")
        .setColor(0xf1c40f)
        .setDescription(
          [
            "You have full access to all GameTime features.",
            "",
            expiresAt
              ? `Your subscription renews on **${expiresAt.toLocaleDateString()}**.`
              : "Your subscription is active.",
            "",
            "Thank you for supporting GameTime!",
          ].join("\n"),
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("GameTime Premium — $4.99/month")
      .setColor(0xf1c40f)
      .setDescription(
        [
          "Upgrade to Premium and unlock the full GameTime experience:",
          "",
          "**Odds & Betting**",
          "- Live odds from 9+ bookmakers",
          "- Moneyline, spreads, and totals",
          "- Odds comparison across books",
          "- American or decimal format",
          "",
          "**Tracking & Alerts**",
          "- Unlimited team tracking (free: 3)",
          "- All reminder intervals (60m, 30m, 15m, 5m, live)",
          "- Line movement alerts",
          "- Upset alerts",
          "- Daily digest DMs",
          "",
          "**How to subscribe:**",
          `1. Click the button below to go to our Ko-fi page`,
          `2. Subscribe to the **Premium** tier ($4.99/month)`,
          `3. **Important:** Put your Discord ID in the message:`,
          `   \`${discordId}\``,
          "",
          "Your premium access will activate automatically within minutes.",
        ].join("\n"),
      )
      .setFooter({
        text: "Your Discord ID has been copied to the field above for easy pasting.",
      });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Subscribe on Ko-fi")
        .setStyle(ButtonStyle.Link)
        .setURL(KOFI_URL),
      new ButtonBuilder()
        .setCustomId("copy_id")
        .setLabel(`ID: ${discordId}`)
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
