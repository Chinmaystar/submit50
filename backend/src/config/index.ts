import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got: ${v}`);
  return n;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd,
  isTest: process.env.NODE_ENV === "test",
  port: num("PORT", 4000),

  mongoUri: required(
    "MONGODB_URI",
    isProd ? undefined : "mongodb://localhost:27017/submit50"
  ),
  redisUrl: required("REDIS_URL", isProd ? undefined : "redis://localhost:6379"),

  // Session/JWT signing secrets. In production these MUST be set explicitly.
  jwtSecret: required(
    "JWT_SECRET",
    isProd ? undefined : "dev-only-insecure-secret-change-me"
  ),
  cookieSecret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || "dev-only-insecure-secret-change-me",
  cookieName: "s50_session",
  cookieMaxAgeMs: 1000 * 60 * 60 * 24 * 7, // 7 days

  // Comma-separated emails auto-promoted to ADMIN on login.
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Allowed CORS origins; comma-separated. Required in production.
  frontendUrls: (process.env.FRONTEND_URL ?? (isProd ? "" : "http://localhost:5173"))
    .split(",")
    .map((u) => u.trim().replace(/\/+$/, ""))
    .filter(Boolean),

  trustProxy: process.env.TRUST_PROXY === "1" || isProd,

  rateLimits: {
    global: { windowMs: num("RATE_LIMIT_WINDOW_MS", 60_000), max: num("RATE_LIMIT_MAX_REQUESTS", 300) },
    submit: { windowMs: num("SUBMIT_RATE_WINDOW_MS", 60_000), max: num("SUBMIT_RATE_MAX", 5) },
    run: { windowMs: num("RUN_RATE_WINDOW_MS", 300_000), max: num("RUN_RATE_MAX", 15) },
    auth: { windowMs: num("AUTH_RATE_WINDOW_MS", 900_000), max: num("AUTH_RATE_MAX", 20) },
  },

  // Submission source code size cap (bytes)
  maxCodeBytes: num("MAX_CODE_BYTES", 64 * 1024),
};

export type AppConfig = typeof config;
