import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { closeRedis, getRedis } from "./config/redis.js";
import { logger } from "./utils/logger.js";
import { backfillProblemLanguages } from "./migrations/backfillProblemLanguages.js";

async function main(): Promise<void> {
  await connectMongo();
  getRedis().ping().catch((e) => logger.error(`Redis ping failed: ${e.message}`));

  // Pre-model migration: legacy problems gain allowedLanguages + starter map.
  await backfillProblemLanguages();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Submit50 API listening on :${config.port} (${config.env})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await closeQueuesSafe();
      await closeRedis();
      await disconnectMongo();
      process.exit(0);
    });
    // force-exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: String(reason) });
  });
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception — exiting", { err: err.stack });
    process.exit(1);
  });
}

async function closeQueuesSafe(): Promise<void> {
  try {
    const { closeQueues } = await import("./queues/index.js");
    await closeQueues();
  } catch {
    /* queue module may not have been initialized */
  }
}

main().catch((err) => {
  logger.error("Fatal startup error", { err: String(err) });
  process.exit(1);
});
