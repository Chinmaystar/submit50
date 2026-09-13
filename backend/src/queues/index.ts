import { Queue } from "bullmq";
import { config } from "../config/index.js";
import { createRedisConnection } from "../config/redis.js";
import {
  JUDGE_QUEUE_NAME,
  RUN_QUEUE_NAME,
  type JudgeJobData,
} from "../types.js";
import { logger } from "../utils/logger.js";

let judgeQueue: Queue<JudgeJobData> | null = null;
let runQueue: Queue<JudgeRunJobData> | null = null;

export interface JudgeRunJobData {
  /** Ephemeral sample-test run: not scored, not stored as a submission. */
  userId: string;
  problemId: string;
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb: number;
  comparisonMode: string;
  floatTolerance: number;
  /** sample tests embedded at enqueue time (they are public anyway) */
  tests: { id: string; input: string; expectedOutput: string }[];
}

export function getJudgeQueue(): Queue<JudgeJobData> {
  if (!judgeQueue) {
    judgeQueue = new Queue<JudgeJobData>(JUDGE_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1, // judging is not retried on failure — a failed run is a verdict
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }
  return judgeQueue;
}

export function getRunQueue(): Queue<JudgeRunJobData> {
  if (!runQueue) {
    runQueue = new Queue<JudgeRunJobData>(RUN_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 600, count: 2000 },
        removeOnFail: { age: 3600 },
      },
    });
  }
  return runQueue;
}

export async function enqueueSubmission(jobData: JudgeJobData): Promise<string> {
  const queue = getJudgeQueue();
  const job = await queue.add("judge", jobData, {
    jobId: `sub-${jobData.submissionId}`,
  });
  logger.info("Submission queued", { submissionId: jobData.submissionId, jobId: job.id });
  return job.id ?? "";
}

export async function enqueueRun(jobData: JudgeRunJobData): Promise<string> {
  const queue = getRunQueue();
  const job = await queue.add("run", jobData);
  logger.debug("Sample run queued", { userId: jobData.userId, jobId: job.id });
  return job.id ?? "";
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([judgeQueue?.close(), runQueue?.close()]);
  judgeQueue = null;
  runQueue = null;
}
