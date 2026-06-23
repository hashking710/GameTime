import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { and, gte, lt, asc, eq } from "drizzle-orm";
import { matches, users } from "@gametime/db";
import { getOrSet, CacheKeys, CacheTTL } from "@gametime/cache";
import { buildMatchEmbed } from "../utils/embeds";
import { sendPaginated } from "../utils/pagination";
import { deduplicateMatches } from "../utils/dedup";
import { noMatchesMessage } from "../utils/command-messages";
import { loadUserMatchPreferences, sortMatchesByPreferences } from "../utils/match-preferences";

function getStartOfDayInTimezone(timezone: string): { startOfDay: Date; endOfDay: Date; localDateStr: string } {
  const now = new Date();

  // Use formatToParts — reliable across all Node.js/Docker ICU configurations
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parseInt(dateParts.find((p) => p.type === "year")?.value ?? "1970");
  const month = parseInt(dateParts.find((p) => p.type === "month")?.value ?? "1"); // 1-indexed
  const day = parseInt(dateParts.find((p) => p.type === "day")?.value ?? "1");
  const localDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // UTC midnight of that local date as a starting approximation
  const utcMidnightGuess = new Date(Date.UTC(year, month - 1, day));

  // Find what time utcMidnightGuess represents in the target timezone to derive the offset
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcMidnightGuess);

  const h = parseInt(timeParts.find((p) => p.type === "hour")?.value ?? "0");
  const m = parseInt(timeParts.find((p) => p.type === "minute")?.value ?? "0");
  const s = parseInt(timeParts.find((p) => p.type === "second")?.value ?? "0");
  // h >= 12 means the timezone is behind UTC (negative offset)
  const offsetMs = ((h < 12 ? h : h - 24) * 3600 + m * 60 + s) * 1000;

  const startOfDay = new Date(utcMidnightGuess.getTime() - offsetMs);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  return { startOfDay, endOfDay, localDateStr };
}

export default {
  data: new SlashCommandBuilder()
    .setName("today")
    .setDescription("Show today's matches across all sports") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { db, redis } = interaction.client;

    const [userRow] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.discordId, interaction.user.id))
      .limit(1);

    const timezone = userRow?.timezone ?? "UTC";
    const { startOfDay, endOfDay, localDateStr } = getStartOfDayInTimezone(timezone);

    const todayMatches = await getOrSet(
      redis,
      CacheKeys.todayMatches(timezone, localDateStr),
      async () => {
        return db
          .select()
          .from(matches)
          .where(
            and(
              gte(matches.startTime, startOfDay),
              lt(matches.startTime, endOfDay),
            ),
          )
          .orderBy(asc(matches.startTime))
          .limit(50);
      },
      CacheTTL.TODAY,
    );

    const dedupedMatches = deduplicateMatches(todayMatches);
    const preferences = await loadUserMatchPreferences(db, interaction.user.id);
    const sortedMatches = sortMatchesByPreferences(dedupedMatches, preferences);

    if (sortedMatches.length === 0) {
      await interaction.editReply(noMatchesMessage("today"));
      return;
    }

    const embeds = sortedMatches.map(buildMatchEmbed);
    await sendPaginated(interaction, embeds);
  },
};
