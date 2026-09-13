/**
 * LOCAL DEV FALLBACK — runs compile/exec on the host with process-level
 * limits. NOT a security boundary. Refuses to run in production.
 * Use only for developing the judge loop without a local Docker daemon.
 */
import { spawn } from "node:child_process";
import { judgeConfig } from "../config.js";

export interface LocalRunResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  oomKilled: boolean;
  outputTruncated: boolean;
  stdout: string;
  stderr: string;
  wallTimeMs: number;
}

export function assertLocalAllowed(): void {
  if (judgeConfig.isProd) {
    throw new Error("JUDGE_MODE=local is forbidden in production. Use the Docker sandbox.");
  }
}

function wire(stream: NodeJS.ReadableStream, which: "out" | "err", limit: number, state: { stdout: string; stderr: string; truncated: boolean }): void {
  let len = which === "out" ? state.stdout.length : state.stderr.length;
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk: string | Buffer) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const target = which === "out" ? "stdout" : "stderr";
    if (len >= limit) {
      state.truncated = true;
      return;
    }
    const room = limit - len;
    const piece = text.length > room ? text.slice(0, room) : text;
    state[target] += piece;
    len += piece.length;
    if (piece.length < text.length) state.truncated = true;
  });
}

export function localRun(cmd: string[], opts: { cwd: string; stdin?: string | Buffer; timeLimitMs: number; memoryLimitMb: number; captureLimitBytes: number }): Promise<LocalRunResult> {
  assertLocalAllowed();
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd: opts.cwd, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
    const state = { stdout: "", stderr: "", truncated: false };
    if (child.stdout) wire(child.stdout, "out", opts.captureLimitBytes, state);
    if (child.stderr) wire(child.stderr, "err", opts.captureLimitBytes, state);
    if (opts.stdin !== undefined) child.stdin?.end(opts.stdin);
    else child.stdin?.end();

    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeLimitMs);

    child.on("exit", (code, signal) => {
      clearTimeout(killer);
      resolve({
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        oomKilled: !timedOut && code === 137,
        outputTruncated: state.truncated,
        stdout: state.stdout,
        stderr: state.stderr,
        wallTimeMs: Date.now() - started,
      });
    });
    child.on("error", (err) => {
      clearTimeout(killer);
      resolve({
        exitCode: null,
        signal: null,
        timedOut: false,
        oomKilled: false,
        outputTruncated: false,
        stdout: "",
        stderr: `judge-spawn-error: ${err.message}`,
        wallTimeMs: Date.now() - started,
      });
    });
  });
}
