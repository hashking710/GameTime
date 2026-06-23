import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";
import { OddsFormat } from "@gametime/shared";
import { withGameChoices } from "../utils/command-options";
import { parseGameOption } from "../utils/game";

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

const HOUR_CHOICES = Array.from({ length: 24 }, (_, hour) => ({
  name: `${String(hour).padStart(2, "0")}:00`,
  value: hour,
}));

function splitCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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
    )
    .addIntegerOption((opt) =>
      opt
        .setName("quiet_start")
        .setDescription("Quiet hours start (0-23 in your timezone)")
        .setRequired(false)
        .addChoices(...HOUR_CHOICES),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("quiet_end")
        .setDescription("Quiet hours end (0-23 in your timezone)")
        .setRequired(false)
        .addChoices(...HOUR_CHOICES),
    )
    .addStringOption((opt) =>
      withGameChoices(opt, {
        name: "mute_game",
        description: "Disable notifications for one game",
        required: false,
      }),
    )
    .addStringOption((opt) =>
      withGameChoices(opt, {
        name: "unmute_game",
        description: "Re-enable notifications for one game",
        required: false,
      }),
    )
    .addStringOption((opt) =>
      opt
        .setName("favorite_team")
        .setDescription("Favorite team(s), comma-separated")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("favorite_league")
        .setDescription("Favorite league(s), comma-separated")
        .setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt
        .setName("clear_preferences")
        .setDescription("Clear muted games and favorites")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { db } = interaction.client;
    const discordId = interaction.user.id;
    const oddsFormat = interaction.options.getString("odds_format");
    const timezone = interaction.options.getString("timezone");
    const quietStart = interaction.options.getInteger("quiet_start");
    const quietEnd = interaction.options.getInteger("quiet_end");
    const muteGameRaw = interaction.options.getString("mute_game");
    const unmuteGameRaw = interaction.options.getString("unmute_game");
    const favoriteTeamRaw = interaction.options.getString("favorite_team");
    const favoriteLeagueRaw = interaction.options.getString("favorite_league");
    const clearPreferences = interaction.options.getBoolean("clear_preferences") ?? false;

    await db
      .insert(users)
      .values({ discordId })
      .onConflictDoNothing();

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);
    const current = userRows[0];

    const updates: Record<string, unknown> = {};
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

    if (quietStart !== null || quietEnd !== null) {
      const start = quietStart ?? current?.quietHoursStart ?? 22;
      const end = quietEnd ?? current?.quietHoursEnd ?? 8;
      updates.quietHoursStart = start;
      updates.quietHoursEnd = end;
      confirmations.push(`Quiet hours: **${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00**`);
    }

    const muteGame = parseGameOption(muteGameRaw);
    const unmuteGame = parseGameOption(unmuteGameRaw);
    const shouldUpdateMutePreferences = Boolean(muteGame || unmuteGame || clearPreferences);
    const mutedGames = new Set<string>((current?.mutedGames as string[] | undefined) ?? []);

    if (muteGame) {
      mutedGames.add(muteGame);
      confirmations.push(`Muted game: **${muteGame.toUpperCase()}**`);
    }
    if (unmuteGame) {
      mutedGames.delete(unmuteGame);
      confirmations.push(`Unmuted game: **${unmuteGame.toUpperCase()}**`);
    }

    const shouldUpdateFavorites = Boolean(favoriteTeamRaw || favoriteLeagueRaw || clearPreferences);
    const favoriteTeams = new Set<string>(
      ((current?.favoriteTeams as string[] | undefined) ?? []).map((value) => value.toLowerCase()),
    );
    const favoriteLeagues = new Set<string>(
      ((current?.favoriteLeagues as string[] | undefined) ?? []).map((value) => value.toLowerCase()),
    );

    if (favoriteTeamRaw) {
      for (const team of splitCsvList(favoriteTeamRaw)) {
        favoriteTeams.add(team.toLowerCase());
      }
      confirmations.push("Favorite team preferences updated");
    }

    if (favoriteLeagueRaw) {
      for (const league of splitCsvList(favoriteLeagueRaw)) {
        favoriteLeagues.add(league.toLowerCase());
      }
      confirmations.push("Favorite league preferences updated");
    }

    if (clearPreferences) {
      favoriteTeams.clear();
      favoriteLeagues.clear();
      mutedGames.clear();
      confirmations.push("Muted games and favorites cleared");
    }

    if (shouldUpdateMutePreferences) {
      updates.mutedGames = Array.from(mutedGames);
    }
    if (shouldUpdateFavorites) {
      updates.favoriteTeams = Array.from(favoriteTeams);
      updates.favoriteLeagues = Array.from(favoriteLeagues);
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

    const user = current;
    const currentFormat = user?.oddsFormat === "american"
      ? "American (-118)"
      : "Decimal (1.85)";

    await interaction.editReply(
      [
        "**Your Settings**",
        `Odds format: **${currentFormat}**`,
        `Timezone: **${user?.timezone ?? "UTC"}**`,
        `Quiet hours: **${user?.quietHoursStart != null && user?.quietHoursEnd != null ? `${String(user.quietHoursStart).padStart(2, "0")}:00-${String(user.quietHoursEnd).padStart(2, "0")}:00` : "Off"}**`,
        `Muted games: **${((user?.mutedGames as string[] | undefined) ?? []).map((g) => g.toUpperCase()).join(", ") || "None"}**`,
        `Favorite teams: **${((user?.favoriteTeams as string[] | undefined) ?? []).join(", ") || "None"}**`,
        `Favorite leagues: **${((user?.favoriteLeagues as string[] | undefined) ?? []).join(", ") || "None"}**`,
        `Daily digest: **8:00 AM** in your timezone`,
        "",
        "Use `/settings` options to update preferences.",
      ].join("\n"),
    );
  },
};
