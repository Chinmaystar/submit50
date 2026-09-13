/* Minimal structured logger. Keeps secrets and hidden-test contents out. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const current: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[current];
}

function line(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const text = JSON.stringify(payload);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => line("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => line("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => line("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => line("error", msg, meta),
};
