import { QueueEvents } from "bullmq";
import { Problem, TestCase } from "../models/index.js";
import { getRunQueue } from "../queues/index.js";
import { createRedisConnection } from "../config/redis.js";
import { RUN_QUEUE_NAME } from "../types.js";
import { logger } from "../utils/logger.js";
import { badRequest } from "../utils/errors.js";

export interface VerifyResult {
  totalTests: number;
  passed: number;
  failed: {
    index: number;
    isSample: boolean;
    status: string;
    input: string;
    expectedOutput: string;
    actualOutput: string;
  }[];
  compileError?: string;
}

/**
 * Admin-only: run the reference solution against every test of a problem via
 * the judge (never in-process). The HTTP request waits on the queue result —
 * acceptable here because it's an admin debugging tool, and execution still
 * happens exclusively inside the sandbox worker.
 */
export async function verifyProblemSolution(problemId: string, language: string, referenceSolution: string): Promise<VerifyResult> {
  const problem = await Problem.findById(problemId);
  if (!problem) throw badRequest("Problem not found.");

  const allowed = problem.allowedLanguages?.length ? problem.allowedLanguages : ["cpp17"];
  if (!allowed.includes(language)) throw badRequest("Language not allowed for this problem.");

  const tests = await TestCase.find({ problemId: problem._id }).sort({ isSample: -1, order: 1 }).lean();
  if (tests.length === 0) throw badRequest("Add test cases before verifying.");

  const queue = getRunQueue();
  const job = await queue.add("verify", {
    userId: "admin-verify",
    problemId: String(problem._id),
    language,
    code: referenceSolution,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    outputLimitKb: problem.outputLimitKb,
    comparisonMode: problem.comparisonMode,
    floatTolerance: problem.floatTolerance,
    tests: tests.map((t) => ({
      id: String(t._id),
      input: t.input ?? "",
      expectedOutput: t.expectedOutput ?? "",
    })),
  });

  const events = new QueueEvents(RUN_QUEUE_NAME, { connection: createRedisConnection() });
  try {
    const result = (await job.waitUntilFinished(events, 10 * 60_000)) as {
      compileError?: string;
      results: { testId: string; status: string; actualOutput: string }[];
    };

    const failed: VerifyResult["failed"] = [];
    let passed = 0;
    (result?.results ?? []).forEach((r, i) => {
      const t = tests[i];
      if (r.status === "PASSED") {
        passed += 1;
      } else {
        failed.push({
          index: i,
          isSample: t?.isSample ?? false,
          status: r.status,
          input: (t?.input ?? "").slice(0, 4000),
          expectedOutput: (t?.expectedOutput ?? "").slice(0, 4000),
          actualOutput: (r.actualOutput ?? "").slice(0, 4000),
        });
      }
    });

    logger.info("Reference solution verified", { problemId, passed, total: tests.length });
    return {
      totalTests: tests.length,
      passed,
      failed,
      compileError: result?.compileError,
    };
  } finally {
    await events.close();
  }
}
