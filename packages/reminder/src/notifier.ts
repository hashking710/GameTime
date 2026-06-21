import type { Client } from "discord.js";
import type { PendingNotification } from "./checker";
import { createLogger } from "@gametime/shared";

const logger = createLogger("notifier");

const GAME_EMOJI: Record<string, string> = {
  cs2: ":gun:",
  valorant: ":dart:",
  lol: ":video_game:",
  dota2: ":crossed_swords:",
  nfl: ":football:",
  nba: ":basketball:",
  mlb: ":baseball:",
  nhl: ":ice_cube:",
  soccer: ":soccer:",
  ufc: ":boxing_glove:",
  f1: ":checkered_flag:",
  tennis: ":tennis:",
};

export async function sendNotifications(
  client: Client,
  notifications: PendingNotification[],
  sentCache: Set<string>,
): Promise<void> {
  for (const notif of notifications) {
    const bucket = getBucket(notif.minutesUntil);
    if (bucket === null) continue;

    const dedupeKey = `${notif.discordId}:${notif.matchId}:${bucket}`;
    if (sentCache.has(dedupeKey)) continue;

    try {
      const user = await client.users.fetch(notif.discordId);
      const emoji = GAME_EMOJI[notif.game] ?? ":trophy:";

      await user.send({
        content: [
          `**Match Alert!** ${emoji}`,
          `**${notif.team1}** vs **${notif.team2}**`,
          `Tournament: ${notif.tournament}`,
          `Game: ${notif.game.toUpperCase()}`,
          bucket === 0
            ? "**Starting NOW!**"
            : `Starting in ~${bucket} minutes!`,
        ].join("\n"),
      });

      sentCache.add(dedupeKey);
      logger.info(
        { discordId: notif.discordId, matchId: notif.matchId, bucket },
        "Notification sent",
      );
    } catch (err) {
      logger.warn(
        { err, discordId: notif.discordId },
        "Failed to send DM",
      );
    }
  }
}

function getBucket(minutes: number): number | null {
  if (minutes <= 2) return 0;
  if (minutes <= 7) return 5;
  if (minutes <= 17) return 15;
  if (minutes <= 35) return 30;
  if (minutes <= 65) return 60;
  return null;
}
