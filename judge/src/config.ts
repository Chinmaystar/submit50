import dotenv from "dotenv";
import os from "node:os";
import path from "node:path";
dotenv.config();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got: ${v}`);
  return n;
}

const isProd = process.env.NODE_ENV === "production";

export const judgeConfig = {
  env: process.env.NODE_ENV ?? "development",
  isProd,
  name: process.env.JUDGE_NAME ?? "judge-1",
  mongoUri: process.env.MONGODB_URI ?? (isProd ? undefined : "mongodb://localhost:27017/submit50")!,
  redisUrl: process.env.REDIS_URL ?? (isProd ? undefined : "redis://localhost:6379")!,

  /**
   * "docker" (production): every compile+run happens in a disposable sandbox
   * container. "local" (DEV ONLY): executes on the host without Docker.
   * local mode refuses to start in production — it must never see untrusted
   * code on the API host.
   */
  mode: (process.env.JUDGE_MODE ?? (isProd ? "docker" : "local")) as "docker" | "local",
  concurrency: num("JUDGE_CONCURRENCY", 2),
  sandboxImage: process.env.SANDBOX_IMAGE ?? "acm-judge-sandbox:latest",

  compilerTimeoutMs: num("COMPILER_TIMEOUT_S", 30) * 1000,
  /** Extra wall-clock slack on top of the problem time limit to absorb
   *  container startup and scheduling overhead. */
  timeoutGraceMs: num("JUDGE_TIMEOUT_GRACE_S", 2) * 1000,
  /** Hard cap on captured stdout/stderr per run (bytes), independent of the
   *  problem's output limit so judge bookkeeping can't be blown up. */
  maxCaptureBytes: 8 * 1024 * 1024,
  /** PIDs allowed inside one sandbox (fork-bomb defense). 64 is plenty for
   *  C/C++; raised to 128 to leave headroom for JVM GC/JIT threads. */
  pidsLimit: num("JUDGE_PIDS_LIMIT", 128),
  /* Scratch root for per-job compile dirs (auto-cleaned). Bind mounts are
   * resolved inside the Docker daemon: macOS/Colima only shares $HOME, so a
   * default under /tmp mounts as an empty dir there. Use a home path on macOS. */
  workRoot:
    process.env.JUDGE_WORK_DIR ??
    (process.platform === "darwin" ? path.join(os.homedir(), ".submit50-judge-work") : "/tmp/submit50-judge-work"),
};
