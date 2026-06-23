import { eq, and, inArray } from "drizzle-orm";
import { matches, matchWatches } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger, GAME_EMOJI } from "@gametime/shared";

const logger = createLogger("watch-notifier");

export async function checkWatchedMatches(
  db: Database,
  client: Client,
  sentCache: Set<string>,
): Promise<void> {
  const liveWatches = await db
    .select({
      discordId: matchWatches.discordId,
      matchId: matchWatches.matchId,
      notifyLive: matchWatches.notifyLive,
      notifyCompleted: matchWatches.notifyCompleted,
      team1: matches.team1,
      team2: matches.team2,
      game: matches.game,
      tournament: matches.tournament,
      status: matches.status,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
      streamUrl: matches.streamUrl,
    })
    .from(matchWatches)
    .innerJoin(matches, eq(matchWatches.matchId, matches.id))
    .where(
      inArray(matches.status, ["live", "completed"]),
    );

  for (const watch of liveWatches) {
    const liveKey = `watch:live:${watch.discordId}:${watch.matchId}`;
    const completedKey = `watch:done:${watch.discordId}:${watch.matchId}`;

    const emoji = GAME_EMOJI[watch.game] ?? ":trophy:";

    if (watch.status === "live" && watch.notifyLive && !sentCache.has(liveKey)) {
      sentCache.add(liveKey);
      try {
        const user = await client.users.fetch(watch.discordId);
        const lines = [
          `**Match Started!** ${emoji}`,
          "",
          `**${watch.team1}** vs **${watch.team2}**`,
          `${watch.game.toUpperCase()} — ${watch.tournament}`,
        ];
        if (watch.streamUrl) lines.push(`[Watch Live](${watch.streamUrl})`);
        await user.send({ content: lines.join("\n") });
        logger.info({ discordId: watch.discordId, matchId: watch.matchId }, "Watch live notification sent");
      } catch {
        logger.warn({ discordId: watch.discordId }, "Failed to send watch DM");
      }
    }

    if (watch.status === "completed" && watch.notifyCompleted && !sentCache.has(completedKey)) {
      sentCache.add(completedKey);
      try {
        const user = await client.users.fetch(watch.discordId);
        await user.send({
          content: [
            `**Match Completed!** ${emoji}`,
            "",
            `**${watch.team1}** ${watch.team1Score ?? 0} - ${watch.team2Score ?? 0} **${watch.team2}**`,
            `${watch.game.toUpperCase()} — ${watch.tournament}`,
          ].join("\n"),
        });
        logger.info({ discordId: watch.discordId, matchId: watch.matchId }, "Watch completed notification sent");
      } catch {
        logger.warn({ discordId: watch.discordId }, "Failed to send watch DM");
      }

      await db
        .delete(matchWatches)
        .where(
          and(
            eq(matchWatches.discordId, watch.discordId),
            eq(matchWatches.matchId, watch.matchId),
          ),
        );
    }
  }
}
