import type { ChatInputCommandInteraction } from "discord.js";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";
import { TIER_LIMITS, type TierLimits } from "@gametime/shared";
import { isAdminUser } from "./admin";

export async function getUserTier(
  interaction: ChatInputCommandInteraction,
): Promise<TierLimits> {
  const discordId = interaction.user.id;

  // Admins always have premium access for testing
  if (isAdminUser(discordId)) {
    return TIER_LIMITS.premium;
  }

  const { db } = interaction.client;

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);

  if (userRows.length === 0) return TIER_LIMITS.free;

  const user = userRows[0];
  if (
    user.premium &&
    (!user.premiumExpiresAt || user.premiumExpiresAt > new Date())
  ) {
    return TIER_LIMITS.premium;
  }

  return TIER_LIMITS.free;
}

export async function requirePremium(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const tier = await getUserTier(interaction);
  if (!tier.hasOdds) {
    await interaction.editReply(
      "This feature requires **GameTime Premium**. Use `/subscribe` to learn more.",
    );
    return false;
  }
  return true;
}
