/**
 * Judge worker — consumes BullMQ queues and runs the sandbox pipeline.
 *
 * Deployment: this process runs on a dedicated Docker-capable VPS. It holds
 * MongoDB + Redis credentials but NO API secrets, and the sandbox containers
 * it launches receive none of them (no env passthrough, no extra mounts).
 */
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import mongoose from "mongoose";
import { judgeConfig } from "./config.js";
import { logger } from "./logger.js";
import { judgeSubmission } from "./judge.js";
import type { ComparisonMode, JudgeJobData, JudgeRunJobData, TestStatus } from "./types.js";
import { JUDGE_QUEUE_NAME, RUN_QUEUE_NAME } from "./types.js";
import { persistSubmissionResult } from "./results.js";
import { JudgeSubmission, JudgeTestCase } from "./models.js";
import { requireSandboxImage } from "./runner/dockerRunner.js";
import { assertLocalAllowed } from "./runner/localRunner.js";

function redisConn() {
  return new Redis(judgeConfig.redisUrl, { maxRetriesPerRequest: null });
}

async function processJudgeJob(job: Job<JudgeJobData>): Promise<void> {
  const d = job.data;
  logger.info("Judging submission", { submissionId: d.submissionId, job: job.id });

  await setSubmissionStatus(d.submissionId, "COMPILING");

  // Fetch hidden tests directly from the DB — they never transit the public API.
  const tests = await JudgeTestCase.find({ problemId: d.problemId }).sort({ order: 1 }).lean();

  await setSubmissionStatus(d.submissionId, "RUNNING");

  const outcome = await judgeSubmission({
    language: d.language,
    code: d.code,
    timeLimitMs: d.timeLimitMs,
    memoryLimitMb: d.memoryLimitMb,
    outputLimitKb: d.outputLimitKb,
    comparisonMode: d.comparisonMode,
    floatTolerance: d.floatTolerance,
    tests: tests.map((t) => ({
      id: String(t._id),
      input: t.input ?? "",
      expectedOutput: t.expectedOutput ?? "",
      points: t.points ?? 0,
      isSample: t.isSample ?? false,
    })),
    label: d.submissionId.slice(-8),
  });

  await persistSubmissionResult(d.submissionId, outcome);
}

async function setSubmissionStatus(submissionId: string, status: "COMPILING" | "RUNNING"): Promise<void> {
  await JudgeSubmission.updateOne({ _id: submissionId, status: { $in: ["QUEUED", "COMPILING", "RUNNING"] } }, { status });
}

async function processRunJob(job: Job<JudgeRunJobData>): Promise<unknown> {
  const d = job.data;
  logger.debug("Sample run", { job: job.id, userId: d.userId });
  const outcome = await judgeSubmission({
    language: d.language,
    code: d.code,
    timeLimitMs: d.timeLimitMs,
    memoryLimitMb: d.memoryLimitMb,
    outputLimitKb: d.outputLimitKb,
    comparisonMode: d.comparisonMode as ComparisonMode,
    floatTolerance: d.floatTolerance,
    tests: d.tests.map((t) => ({
      id: t.id,
      input: t.input,
      expectedOutput: t.expectedOutput,
      points: 0,
      isSample: true,
    })),
    stopOnFail: false,
    label: `run-${String(job.id)}`,
  });

  return {
    compileError: outcome.compileError,
    results: outcome.verdicts.map((v, i) => ({
      testId: v.testId,
      index: i,
      status: v.status as TestStatus,
      actualOutput: v.actualOutput,
      stderrExcerpt: v.stderrExcerpt,
      executionTimeMs: v.executionTimeMs,
      memoryUsedKb: v.memoryUsedKb,
    })),
    totalExecutionTimeMs: outcome.totalExecutionTimeMs,
  };
}

export async function startWorker(): Promise<void> {
  if (judgeConfig.mode === "docker") {
    await requireSandboxImage(judgeConfig.sandboxImage);
    logger.info("Docker sandbox image verified", { image: judgeConfig.sandboxImage });
  } else {
    assertLocalAllowed();
    logger.warn("JUDGE_MODE=local — running submissions on the HOST. Dev only, NOT sandboxed.");
  }

  await mongoose.connect(judgeConfig.mongoUri, { maxPoolSize: 10 });
  logger.info("Judge connected to MongoDB");

  const connection = redisConn();

  const judgeWorker = new Worker<JudgeJobData>(JUDGE_QUEUE_NAME, processJudgeJob, {
    connection,
    concurrency: judgeConfig.concurrency,
    lockDuration: 10 * 60_000, // long jobs (many tests)
  });
  judgeWorker.on("failed", (job, err) => {
    logger.error("Judge job failed", { jobId: job?.id, err: err.message });
    if (job) {
      // Fail safely: mark the submission INTERNAL_ERROR so it never sticks in RUNNING.
      void JudgeSubmission.updateOne(
        { _id: job.data.submissionId, status: { $in: ["QUEUED", "COMPILING", "RUNNING"] } },
        { status: "INTERNAL_ERROR", errorMessage: "Judge worker failure. An admin can re-judge this submission." }
      ).catch(() => undefined);
    }
  });

  const runWorker = new Worker<JudgeRunJobData>(RUN_QUEUE_NAME, processRunJob, {
    connection,
    concurrency: Math.max(1, judgeConfig.concurrency),
    lockDuration: 5 * 60_000,
  });
  runWorker.on("failed", (job, err) => {
    logger.error("Run job failed", { jobId: job?.id, err: err.message });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} — judge shutting down`);
    await Promise.allSettled([judgeWorker.close(), runWorker.close(), connection.quit(), mongoose.disconnect()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", { reason: String(reason) }));

  logger.info("Judge worker started", { name: judgeConfig.name, mode: judgeConfig.mode, concurrency: judgeConfig.concurrency });
}

startWorker().catch((err) => {
  logger.error("Judge worker fatal", { err: String(err?.stack ?? err) });
  process.exit(1);
});
