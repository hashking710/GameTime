import { and, eq, lt } from "drizzle-orm";
import { matches, oddsHistory } from "@gametime/db";
import type { Database } from "@gametime/db";
import { createLogger } from "@gametime/shared";

const logger = createLogger("cleanup");

const RETENTION_DAYS = 7;

export async function cleanupStaleData(db: Database): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000);

  const deletedMatches = await db
    .delete(matches)
    .where(
      and(
        eq(matches.status, "completed"),
        lt(matches.updatedAt, cutoff),
      ),
    )
    .returning({ id: matches.id });

  const deletedHistory = await db
    .delete(oddsHistory)
    .where(lt(oddsHistory.fetchedAt, cutoff))
    .returning({ id: oddsHistory.id });

  if (deletedMatches.length > 0 || deletedHistory.length > 0) {
    logger.info(
      {
        matches: deletedMatches.length,
        oddsHistory: deletedHistory.length,
      },
      "Stale data cleaned up",
    );
  }
}
