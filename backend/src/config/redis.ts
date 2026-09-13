import Redis from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

let connection: Redis | null = null;

/** Shared (non-blocking) Redis connection used by BullMQ queues. */
export function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: true,
      lazyConnect: false,
    });
    connection.on("error", (err) => logger.error(`Redis error: ${err.message}`));
    connection.on("connect", () => logger.info("Redis connected"));
  }
  return connection;
}

/** BullMQ requires dedicated connections for blocking operations. */
export function createRedisConnection(): Redis {
  const c = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  c.on("error", (err) => logger.error(`Redis(error): ${err.message}`));
  return c;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit().catch(() => connection?.disconnect());
    connection = null;
  }
}
