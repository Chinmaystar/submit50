/**
 * The judging pipeline: prepare → compile → run tests → compare → score.
 * Every execution goes through the sandbox runner; this module never spawns
 * anything itself.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { judgeConfig } from "./config.js";
import { dockerRun } from "./runner/dockerRunner.js";
import { localRun, assertLocalAllowed } from "./runner/localRunner.js";
import { ensureJobWorkDir } from "./workdir.js";
import { getLanguage } from "./languages/index.js";
import { compareOutput, type ComparisonMode } from "./checkers/comparison.js";
import type { SandboxResult } from "./runner/dockerRunner.js";
import type { TestStatus } from "./types.js";

export interface TestToRun {
  id: string;
  input: string;
  expectedOutput: string;
  points: number;
  isSample: boolean;
}

export interface TestVerdict {
  testId: string;
  status: TestStatus;
  earned: number;
  executionTimeMs: number;
  memoryUsedKb: number;
  /** actual stdout — always "" for hidden tests (safety enforced here) */
  actualOutput: string;
  stderrExcerpt: string;
}

export interface JudgeOutcome {
  ok: boolean;
  compileError?: string; // set on COMPILATION_ERROR
  verdicts: TestVerdict[];
  totalExecutionTimeMs: number;
  maxMemoryKb: number;
}

interface ExecResult extends SandboxResult {
  wallTimeMs: number;
}

async function sandboxExec(opts: {
  workDir: string;
  cmd: string[];
  stdin?: string | Buffer;
  timeLimitMs: number;
  memoryLimitMb: number;
  captureLimitBytes: number;
  cpuSeconds: number;
  label: string;
  stdinFile?: string;
}): Promise<ExecResult> {
  if (judgeConfig.mode === "docker") {
    const r = await dockerRun({
      image: judgeConfig.sandboxImage,
      cmd: opts.cmd,
      stdin: opts.stdin,
      stdinFile: opts.stdinFile,
      timeLimitMs: opts.timeLimitMs,
      memoryLimitMb: opts.memoryLimitMb,
      captureLimitBytes: opts.captureLimitBytes,
      workDir: opts.workDir,
      cpuSeconds: opts.cpuSeconds,
      name: `s50-${opts.label.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 48)}-${randomUUID().slice(0, 8)}`,
    });
    return r;
  }
  // local dev mode (host exec, non-production only)
  assertLocalAllowed();
  const r = await localRun(opts.cmd, {
    cwd: opts.workDir,
    stdin: opts.stdin,
    timeLimitMs: opts.timeLimitMs,
    memoryLimitMb: opts.memoryLimitMb,
    captureLimitBytes: opts.captureLimitBytes,
  });
  return r;
}

/** /usr/bin/time -f markers make the sandbox report its own peak RSS. */
const TIME_CMD = "/usr/bin/time";
const RSS_MARKER = "S50RSS";
const ELAPSED_MARKER = "S50ELAPSED";
const TIME_FORMAT = `${RSS_MARKER} %M\\n${ELAPSED_MARKER} %e`;

function parseSandboxMetrics(stderr: string): { rssKb: number | null; elapsedMs: number | null; cleanStderr: string } {
  let rssKb: number | null = null;
  let elapsedMs: number | null = null;
  const lines = stderr.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(new RegExp(`${RSS_MARKER}\\s+(\\d+)`));
    if (m) {
      rssKb = Number(m[1]);
      continue;
    }
    const e = line.match(new RegExp(`${ELAPSED_MARKER}\\s+([\\d.]+)`));
    if (e) {
      elapsedMs = Math.round(Number(e[1]) * 1000);
      continue;
    }
    kept.push(line);
  }
  return { rssKb, elapsedMs, cleanStderr: kept.join("\n") };
}

export interface JudgeRequest {
  language: string;
  code: string;
  tests: TestToRun[];
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb: number;
  comparisonMode: ComparisonMode;
  floatTolerance: number;
  /** stop after the first failing hidden test (time saver for long suites) */
  stopOnFail?: boolean;
  label: string;
}

export async function judgeSubmission(req: JudgeRequest): Promise<JudgeOutcome> {
  const lang = getLanguage(req.language);
  // world-writable job dir (incl. bin/) so the unprivileged sandbox uid
  // (1500:1500) can compile and run — explicit chmod, immune to host umask
  const workDir = await ensureJobWorkDir(judgeConfig.workRoot, `job-${randomUUID()}`);

  try {
    // 1. write source (the only untrusted artifact we persist)
    await fs.writeFile(path.join(workDir, lang.sourceFileName), req.code, { mode: 0o644 });

    // 2. compile inside the sandbox
    const outPath = `/work/bin/${lang.compiledOutputName}`;
    const compile = await sandboxExec({
      workDir,
      cmd: lang.compileCmd(outPath, `/work/${lang.sourceFileName}`),
      timeLimitMs: judgeConfig.compilerTimeoutMs,
      memoryLimitMb: 1024,
      captureLimitBytes: 64 * 1024,
      cpuSeconds: Math.ceil(judgeConfig.compilerTimeoutMs / 1000),
      label: `${req.label}-compile`,
    });

    if (compile.timedOut) {
      return {
        ok: false,
        compileError: "Compilation timed out. Your program may be too complex or too large.",
        verdicts: [],
        totalExecutionTimeMs: 0,
        maxMemoryKb: 0,
      };
    }
    if (compile.exitCode !== 0) {
      const diag = compile.stderr.slice(0, 16_000) || compile.stdout.slice(0, 2000);
      return {
        ok: false,
        compileError: diag || "Compilation failed.",
        verdicts: [],
        totalExecutionTimeMs: 0,
        maxMemoryKb: 0,
      };
    }

    // 3. run each test
    const verdicts: TestVerdict[] = [];
    let totalExecutionTimeMs = 0;
    let maxMemoryKb = 0;
    const runWallLimit = req.timeLimitMs + judgeConfig.timeoutGraceMs;
    const captureLimit = Math.min(req.outputLimitKb * 1024 + 4096, judgeConfig.maxCaptureBytes);

    for (const test of req.tests) {
      const runCmd =
        judgeConfig.mode === "docker"
          ? [TIME_CMD, "-f", TIME_FORMAT, ...lang.runCmd(outPath, { memoryLimitMb: req.memoryLimitMb })]
          : lang.runCmd(outPath, { memoryLimitMb: req.memoryLimitMb });

      const result = await sandboxExec({
        workDir,
        cmd: runCmd,
        stdin: test.input,
        timeLimitMs: runWallLimit,
        memoryLimitMb: req.memoryLimitMb,
        captureLimitBytes: captureLimit,
        cpuSeconds: Math.ceil(runWallLimit / 1000),
        label: `${req.label}-run`,
      });

      const metrics = parseSandboxMetrics(result.stderr);
      // Effective runtime: prefer the sandbox's own elapsed measurement
      // (excludes container startup); fall back to host wall time.
      const execMs = metrics.elapsedMs ?? result.wallTimeMs;
      totalExecutionTimeMs = Math.max(totalExecutionTimeMs, execMs);
      if (metrics.rssKb != null) maxMemoryKb = Math.max(maxMemoryKb, metrics.rssKb);

      let status: TestStatus;
      if (result.timedOut) status = "TIME_LIMIT_EXCEEDED";
      else if (result.oomKilled) status = "MEMORY_LIMIT_EXCEEDED";
      else if (result.outputTruncated && result.exitCode === 0) status = "OUTPUT_LIMIT_EXCEEDED";
      else if (result.exitCode !== 0) {
        // Java heap exhaustion surfaces as a thrown OutOfMemoryError with exit
        // code 1 — indistinguishable from a normal runtime error, but it IS a
        // memory limit hit. C/C++ already get MEMORY_LIMIT_EXCEEDED via SIGKILL
        // (137)/allocator abort (134) in dockerRunner.
        status = /OutOfMemoryError/.test(result.stderr) ? "MEMORY_LIMIT_EXCEEDED" : "RUNTIME_ERROR";
      } else {
        const cmp = compareOutput(req.comparisonMode, test.expectedOutput, result.stdout, req.floatTolerance);
        status = cmp.passed ? "PASSED" : "WRONG_ANSWER";
      }

      // If output was truncated we cannot trust the comparison.
      const failedByLimit = status !== "PASSED" && status !== "WRONG_ANSWER";

      verdicts.push({
        testId: test.id,
        status,
        earned: status === "PASSED" ? test.points : 0,
        executionTimeMs: execMs,
        memoryUsedKb: metrics.rssKb ?? 0,
        // HIDDEN TEST SAFETY: actual output is stored for samples only.
        actualOutput: test.isSample ? result.stdout.slice(0, 100_000) : "",
        stderrExcerpt: failedByLimit || status === "RUNTIME_ERROR" ? metrics.cleanStderr.slice(0, 1500).trim() : "",
      });

      if (req.stopOnFail && status !== "PASSED") break;
    }

    return { ok: true, verdicts, totalExecutionTimeMs, maxMemoryKb };
  } finally {
    // 4. destroy the temporary environment, always
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
