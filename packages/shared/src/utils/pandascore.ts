import { createLogger } from "./logger";

const logger = createLogger("pandascore-auth");

export async function validatePandaScoreApiKey(
  apiKey: string,
  source: string,
): Promise<void> {
  const response = await fetch(
    `https://api.pandascore.co/matches/upcoming?per_page=1&token=${apiKey}`,
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `[${source}] PandaScore API key is invalid (status ${response.status})`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `[${source}] PandaScore API check failed with status ${response.status}`,
    );
  }

  logger.info({ source }, "PandaScore API key validated");
}
