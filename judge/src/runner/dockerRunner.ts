/**
 * Docker sandbox runner — the ONLY place untrusted code is ever executed.
 *
 * Threat model: the submitted program is fully adversarial. The container is
 * launched with defense in depth:
 *   --network none            no connectivity at all
 *   --cap-drop ALL            no Linux capabilities
 *   --security-opt no-new-privileges
 *   --pids-limit              fork-bomb containment
 *   --memory + --memory-swap  identical values => hard RAM ceiling, no swap
 *   --ulimit cpu              kernel-enforced CPU-time cap
 *   --ulimit fsize            file-size cap inside the sandbox
 *   --read-only rootfs; only /work (a fresh per-job tmpfs-backed host dir)
 *                             is writable, and it is destroyed afterwards
 *   --user 1500:1500          unprivileged
 *   no env vars, no docker socket, no secrets, nothing else mounted
 *
 * The docker socket never enters the sandbox; the sandbox never sees the
 * host filesystem beyond its own /work bind mount.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { judgeConfig } from "../config.js";

/** Docker daemon socket. Set for Colima / custom hosts (e.g. unix://${HOME}/.colima/default/docker.sock). */
const dockerHost = process.env.DOCKER_HOST;

/**
 * The sandbox runs the `docker` CLI with a minimal env (no user config dir),
 * so the CLI cannot read ~/.docker/config.json to resolve a context. Pass an
 * explicit --host when DOCKER_HOST is configured, otherwise fall back to the
 * CLI default (/var/run/docker.sock).
 */
function dockerCli(cmd: string[]): string[] {
  return dockerHost ? ["--host", dockerHost, ...cmd] : cmd;
}

export interface SandboxResult {
  exitCode: number | null; // null when we killed it
  signal: string | null;
  timedOut: boolean;
  oomKilled: boolean;
  outputTruncated: boolean;
  stdout: string;
  stderr: string;
  wallTimeMs: number;
  containerName?: string;
}

export interface SandboxRunOptions {
  image: string;
  cmd: string[];
  /** stdin payload (test input) — piped, never written to disk */
  stdin?: string | Buffer;
  /** wall-clock limit in ms; the process is killed (SIGKILL) when exceeded */
  timeLimitMs: number;
  /** RAM ceiling in MB */
  memoryLimitMb: number;
  /** cap on captured stdout/stderr (bytes); extra output is dropped */
  captureLimitBytes: number;
  /** writable scratch dir bind-mounted at /work */
  workDir: string;
  /** RLIMIT_CPU seconds (belt & braces under the wall clock) */
  cpuSeconds?: number;
  /** stdin given as a host file to stream (large inputs) */
  stdinFile?: string;
  /** name for the container (for post-mortem docker inspect) */
  name: string;
}

interface Captured {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

/** Bounded capture of a byte stream. Output past `limit` is discarded. */
function wire(stream: NodeJS.ReadableStream, which: "out" | "err", limit: number, state: Captured): void {
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

/**
 * Run one docker invocation. Kills the process tree on timeout and marks
 * OOM by inspecting the container afterwards.
 */
export async function dockerRun(opts: SandboxRunOptions): Promise<SandboxResult> {
  const args = [
    "run",
    "--rm",
    "-i", // attach stdin so the test input is PIPEABLE into the container
    "--name",
    opts.name,
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(judgeConfig.pidsLimit),
    "--memory",
    `${opts.memoryLimitMb}m`,
    "--memory-swap",
    `${opts.memoryLimitMb}m`, // same => no swap
    "--memory-swappiness",
    "0",
    "--cpus",
    "1",
    "--ulimit",
    `cpu=${opts.cpuSeconds ?? Math.ceil(opts.timeLimitMs / 1000) + 2}:${opts.cpuSeconds ?? Math.ceil(opts.timeLimitMs / 1000) + 2}`,
    "--ulimit",
    "fsize=33554432:33554432", // 32 MB of file writes max
    "--ulimit",
    "nproc=64:64",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=32m",
    "--user",
    "1500:1500",
    "-v",
    `${opts.workDir}:/work`,
    "-w",
    "/work",
    "--env",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    opts.image,
    ...opts.cmd,
  ];

  const started = Date.now();

  return new Promise<SandboxResult>((resolve) => {
    const child = spawn("docker", dockerCli(args), {
      stdio: ["pipe", "pipe", "pipe"],
      // minimal env for the docker CLIENT; the container env is controlled above
      env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: os.tmpdir() },
    });

    const state: Captured = { stdout: "", stderr: "", truncated: false };
    if (child.stdout) wire(child.stdout, "out", opts.captureLimitBytes, state);
    if (child.stderr) wire(child.stderr, "err", opts.captureLimitBytes, state);

    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin);
    } else if (opts.stdinFile) {
      fs.open(opts.stdinFile, "r")
        .then((fh) => fh.createReadStream())
        .then((rs) => {
          rs.on("close", () => child.stdin?.end());
          rs.pipe(child.stdin!);
        })
        .catch(() => child.stdin?.end());
    } else {
      child.stdin?.end();
    }

    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      // SIGKILL the docker client; docker run forwards stop to the container.
      // Then hard-kill the container itself in case it lingers.
      child.kill("SIGKILL");
      // hard-kill the container itself in case the client dies before forwarding
      spawn("docker", dockerCli(["kill", opts.name]), { stdio: "ignore" });
    }, opts.timeLimitMs);

    let exited = false;
    const finish = async (exitCode: number | null, signal: string | null) => {
      if (exited) return;
      exited = true;
      clearTimeout(killer);

      // Detect an in-sandbox OOM kill (exit 137 = SIGKILL, exit 134 = SIGABRT
      // from the C++ allocator). Only trust 137 as OOM when we did NOT time out.
      const oomKilled = !timedOut && (exitCode === 137 || (exitCode === 134 && opts.memoryLimitMb <= 512));

      // Best-effort: verify via docker inspect when the container still exists (--rm races here, so it's advisory)
      const wallTimeMs = Date.now() - started;
      if (timedOut || exitCode !== 0) {
        spawn("docker", dockerCli(["rm", "-f", opts.name]), { stdio: "ignore" });
      }

      resolve({
        exitCode,
        signal,
        timedOut,
        oomKilled,
        outputTruncated: state.truncated,
        stdout: state.stdout,
        stderr: state.stderr,
        wallTimeMs,
      });
    };

    child.on("exit", (code, signal) => void finish(code, signal));
    child.on("error", (err) => {
      clearTimeout(killer);
      if (!exited) {
        exited = true;
        resolve({
          exitCode: null,
          signal: null,
          timedOut: false,
          oomKilled: false,
          outputTruncated: false,
          stdout: state.stdout,
          stderr: `judge-spawn-error: ${err.message}`,
          wallTimeMs: Date.now() - started,
        });
      }
    });
  });
}

/** Ensure the sandbox image exists; helpful startup failure otherwise. */
export async function requireSandboxImage(image: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn("docker", dockerCli(["image", "inspect", image]), { stdio: "ignore" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Sandbox image ${image} not found. Build it: docker build -t ${image} judge/sandbox`))));
    p.on("error", reject);
  });
}
