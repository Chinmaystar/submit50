import mongoose from "mongoose";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export async function connectMongo(): Promise<typeof mongoose> {
  // NOTE: we deliberately do NOT set mongoose `sanitizeFilter` globally — it
  // rewraps every `$`-prefixed operator (`$ne`, `$in`, `$gt`, ...) into `$eq`,
  // which breaks legitimate server-side filtering. Injection defence happens at
  // the edge instead: every route validates query/body with zod schemas, and
  // free-text search is regex-escaped (see routes/admin.ts).
  const conn = await mongoose.connect(config.mongoUri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
