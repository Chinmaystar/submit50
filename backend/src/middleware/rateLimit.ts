import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { config } from "../config/index.js";
import { getRedis } from "../config/redis.js";

function makeLimiter(opts: { windowMs: number; max: number; prefix: string; message: string }): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: opts.message, code: "RATE_LIMITED" },
    // Fall back to the in-memory store in tests (no Redis dependency there).
    ...(config.isTest
      ? {}
      : {
          store: new RedisStore({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
            prefix: `rl:${opts.prefix}:`,
          }),
        }),
  });
}

/** Global API limiter. */
export const globalLimiter = makeLimiter({
  ...config.rateLimits.global,
  prefix: "global",
  message: "Too many requests. Please slow down.",
});

/** Login attempts. */
export const authLimiter = makeLimiter({
  ...config.rateLimits.auth,
  prefix: "auth",
  message: "Too many login attempts. Try again later.",
});

/** POST /run sample executions. */
export const runLimiter = makeLimiter({
  ...config.rateLimits.run,
  prefix: "run",
  message: "Too many sample runs. Please wait before running again.",
});

/** POST /submit — key includes the problem so the limit is per student+problem. */
export function submitLimiter(): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimits.submit.windowMs,
    limit: config.rateLimits.submit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: `Submission limit reached (${config.rateLimits.submit.max} per ${config.rateLimits.submit.windowMs / 1000}s for this problem).`, code: "RATE_LIMITED" },
    keyGenerator: (req, res) => {
      const userId = res.locals?.userId ?? (req as { user?: { _id?: unknown } }).user?._id ?? req.ip;
      return `${userId}:${req.params.id ?? "?"}`;
    },
    ...(config.isTest
      ? {}
      : {
          store: new RedisStore({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
            prefix: "rl:submit:",
          }),
        }),
  });
}
