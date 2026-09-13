import { Types } from "mongoose";
import { config } from "../config/index.js";
import { Assignment, isSubmissionOpen, Problem, Submission } from "../models/index.js";
import { enqueueRun, enqueueSubmission, type JudgeRunJobData } from "../queues/index.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { getSampleTests } from "./problemService.js";
import { logger } from "../utils/logger.js";
import type { AuthedRequest } from "../middleware/auth.js";

const QUEUE_WAIT_MAX_MS = 10_000;

export interface SubmitResult {
  submissionId: string;
  status: "QUEUED";
}

/** Full server-side validation chain for a scored submission (section 28). */
export async function createSubmission(
  req: AuthedRequest,
  problemId: string,
  code: string,
  language: string
): Promise<SubmitResult> {
  const user = req.user!;

  const problem = await Problem.findById(problemId);
  if (!problem) throw notFound("Problem not found.");

  const assignment = await Assignment.findById(problem.assignmentId);
  if (!assignment) throw notFound("Assignment not found.");

  // 3/4: validate assignment visibility + deadline — enforced server-side.
  const open = isSubmissionOpen(assignment);
  if (!open.open) throw forbidden(open.reason ?? "Submissions are closed.");

  // 5: validate source code
  const codeBuf = Buffer.from(code, "utf8");
  if (codeBuf.length === 0) throw badRequest("Code is empty.");
  if (codeBuf.length > config.maxCodeBytes) {
    throw badRequest(`Code exceeds the maximum size of ${Math.floor(config.maxCodeBytes / 1024)} KB.`);
  }

  // 6/7: persist as QUEUED
  const submission = await Submission.create({
    userId: user._id,
    assignmentId: assignment._id,
    problemId: problem._id,
    code,
    language: language || problem.language,
    status: "QUEUED",
    totalScore: problem.points,
  });

  // 8: enqueue the judge job (never executed in-process)
  try {
    await enqueueSubmission({
      submissionId: String(submission._id),
      problemId: String(problem._id),
      assignmentId: String(assignment._id),
      userId: String(user._id),
      language: "cpp17",
      code,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      outputLimitKb: problem.outputLimitKb,
      comparisonMode: problem.comparisonMode,
      floatTolerance: problem.floatTolerance,
    });
  } catch (err) {
    // Redis/queue down — fail safely, mark the submission so it's not stuck in QUEUED forever.
    logger.error("Failed to enqueue judge job", { submissionId: String(submission._id), err: String(err) });
    await Submission.updateOne(
      { _id: submission._id, status: "QUEUED" },
      { status: "INTERNAL_ERROR", errorMessage: "Judge queue unavailable. Please retry." }
    );
    throw badRequest("Judge queue is temporarily unavailable. Please try again shortly.");
  }

  return { submissionId: String(submission._id), status: "QUEUED" };
}

/** RUN = sample tests only, ephemeral, never scored or persisted. */
export async function runSampleTests(
  req: AuthedRequest,
  problemId: string,
  code: string
): Promise<{ jobId: string }> {
  const user = req.user!;
  if (!code || Buffer.byteLength(code, "utf8") > config.maxCodeBytes) {
    throw badRequest("Invalid code.");
  }

  const problem = await Problem.findById(problemId);
  if (!problem) throw notFound("Problem not found.");

  const assignment = await Assignment.findById(problem.assignmentId);
  if (!assignment) throw notFound("Assignment not found.");
  const open = isSubmissionOpen(assignment);
  if (!open.open) throw forbidden(open.reason ?? "Submissions are closed.");

  const samples = await getSampleTests(problem._id as Types.ObjectId);
  if (samples.length === 0) throw badRequest("This problem has no sample tests.");

  const jobData: JudgeRunJobData = {
    userId: String(user._id),
    problemId: String(problem._id),
    language: "cpp17",
    code,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    outputLimitKb: problem.outputLimitKb,
    comparisonMode: problem.comparisonMode,
    floatTolerance: problem.floatTolerance,
    tests: samples.map((t) => ({
      id: String(t._id),
      input: t.input ?? "",
      expectedOutput: t.expectedOutput ?? "",
    })),
  };

  const jobId = await enqueueRun(jobData);
  return { jobId };
}
