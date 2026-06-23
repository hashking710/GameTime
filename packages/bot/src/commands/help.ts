import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn about GameTime and its features") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setTitle("GameTime Bot")
      .setColor(0x3498db)
      .setDescription(
        "Your hub for esports and sports match tracking, reminders, and odds.",
      )
      .addFields(
        {
          name: "Free Commands",
          value: [
            "`/today` — Today's matches across all sports",
            "`/upcoming [game]` — Upcoming matches",
            "`/live` — Live matches with auto-updating scores",
            "`/schedule <game>` — Full schedule for a game",
            "`/track <team>` — Follow a team (max 3 free)",
            "`/untrack <team>` — Unfollow a team",
            "`/tier` — Check your plan",
            "`/settings` — Update timezone, quiet hours, favorites, and game alerts",
          ].join("\n"),
        },
        {
          name: "Premium Commands ($4.99/mo)",
          value: [
            "`/odds [game]` — Odds from multiple bookmakers",
            "`/subscribe` — Get Premium",
            "",
            "Premium also unlocks: unlimited tracking, odds in `/upcoming`, all reminder intervals, daily digest, upset & line movement alerts",
          ].join("\n"),
        },
        {
          name: "Supported Games",
          value:
            "**Esports:** CS2, Valorant, LoL, Dota 2\n**Sports:** NFL, NBA, MLB, NHL, Soccer, UFC, F1, Tennis",
        },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
