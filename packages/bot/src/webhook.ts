import express from "express";
import { eq } from "drizzle-orm";
import { users } from "@gametime/db";
import type { Database } from "@gametime/db";
import type { Client } from "discord.js";
import { createLogger } from "@gametime/shared";

const logger = createLogger("webhook");

interface KofiPayload {
  verification_token: string;
  message_id: string;
  timestamp: string;
  type: string;
  from_name: string;
  message: string;
  amount: string;
  currency: string;
  email: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  tier_name: string | null;
}

export function startWebhookServer(
  db: Database,
  client: Client,
  verificationToken: string,
  port: number = 3000,
) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/kofi", async (req, res) => {
    try {
      const rawData = req.body.data;
      if (!rawData) {
        res.status(400).json({ error: "Missing data" });
        return;
      }

      const payload: KofiPayload = JSON.parse(rawData);

      if (payload.verification_token !== verificationToken) {
        logger.warn("Invalid Ko-fi verification token");
        res.status(403).json({ error: "Invalid token" });
        return;
      }

      logger.info(
        {
          type: payload.type,
          from: payload.from_name,
          amount: payload.amount,
          isSub: payload.is_subscription_payment,
        },
        "Ko-fi webhook received",
      );

      const discordId = extractDiscordId(payload.message);

      if (!discordId) {
        logger.warn(
          { message: payload.message, from: payload.from_name },
          "Could not extract Discord ID from Ko-fi message",
        );
        res.status(200).json({ status: "ok", note: "no discord id found" });
        return;
      }

      const premiumExpiresAt = new Date();
      premiumExpiresAt.setDate(premiumExpiresAt.getDate() + 31);

      await db
        .insert(users)
        .values({
          discordId,
          premium: true,
          premiumExpiresAt,
        })
        .onConflictDoUpdate({
          target: [users.discordId],
          set: {
            premium: true,
            premiumExpiresAt,
          },
        });

      logger.info(
        { discordId, expiresAt: premiumExpiresAt.toISOString() },
        "Premium activated",
      );

      try {
        const user = await client.users.fetch(discordId);
        await user.send(
          [
            "**Welcome to GameTime Premium!**",
            "",
            "Your premium subscription has been activated. You now have access to:",
            "- Unlimited team tracking",
            "- Full odds data from multiple bookmakers",
            "- All reminder intervals (60m, 30m, 15m, 5m, live)",
            "- Line movement alerts",
            "- Daily digest DMs",
            "",
            `Your premium expires on **${premiumExpiresAt.toLocaleDateString()}**. It will renew automatically with your Ko-fi subscription.`,
            "",
            "Thank you for supporting GameTime!",
          ].join("\n"),
        );
      } catch {
        logger.warn({ discordId }, "Could not DM user about premium activation");
      }

      res.status(200).json({ status: "ok", discordId });
    } catch (err) {
      logger.error({ err }, "Ko-fi webhook error");
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.listen(port, () => {
    logger.info({ port }, "Webhook server listening");
  });
}

function extractDiscordId(message: string): string | null {
  if (!message) return null;

  const idMatch = message.match(/\b(\d{17,20})\b/);
  if (idMatch) return idMatch[1];

  return null;
}
