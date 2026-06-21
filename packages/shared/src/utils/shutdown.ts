import { createLogger } from "./logger";

const logger = createLogger("shutdown");

export function onShutdown(cleanup: () => Promise<void>): void {
  let shutting = false;
  const handler = async () => {
    if (shutting) return;
    shutting = true;
    logger.info("Shutting down gracefully...");
    try {
      await cleanup();
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
    }
    process.exit(0);
  };
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}
