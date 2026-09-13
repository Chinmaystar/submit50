import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import { validate, asyncHandler, notFound, forbidden, HttpError } from "../utils/errors.js";
import { submitLimiter, runLimiter } from "../middleware/rateLimit.js";
import { Submission, TestResult, Problem, User } from "../models/index.js";
import { createSubmission, runSampleTests } from "../services/submissionService.js";
import { getRunQueue } from "../queues/index.js";
import { QueueEvents } from "bullmq";
import { RUN_QUEUE_NAME } from "../types.js";
import { createRedisConnection } from "../config/redis.js";
import { logger } from "../utils/logger.js";

export const submissionsRouter = Router();

/* ------------------------------ create + run ------------------------------- */

/**
 * POST /api/problems/:id/submit
 * Validates, stores as QUEUED, enqueues a judge job, returns immediately.
 */
export const problemSubmitRouter = Router();
problemSubmitRouter.post(
  "/:id/submit",
  requireAuth,
  submitLimiter(),
  validate({ body: z.object({ code: z.string().min(1), language: z.string().max(20).optional() }) }),
  asyncHandler(async (req, res) => {
    const { code, language } = req.body as { code: string; language?: string };
    const result = await createSubmission(req as AuthedRequest, req.params.id, code, language ?? "cpp17");
    res.status(202).json(result); // 202 Accepted — processing happens async
  })
);

/**
 * POST /api/problems/:id/run — sample tests only. Waits for the judge result
 * (bounded wait) because the response IS the feedback; still executes only in
 * the sandbox worker, never in this process. Bounded to ~60s.
 */
problemSubmitRouter.post(
  "/:id/run",
  requireAuth,
  runLimiter,
  validate({ body: z.object({ code: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };
    const { jobId } = await runSampleTests(req as AuthedRequest, req.params.id, code);

    const events = new QueueEvents(RUN_QUEUE_NAME, { connection: createRedisConnection() });
    try {
      const queue = getRunQueue();
      const job = await queue.getJob(jobId);
      if (!job) throw new HttpError(500, "Run job lost.", "INTERNAL");
      const result = await job.waitUntilFinished(events, 90_000);
      res.json(result ?? { error: "Run timed out." });
    } catch (err) {
      logger.warn("Run wait failed", { err: String(err) });
      res.status(202).json({ jobId, pending: true, error: "Still running — check back shortly." });
    } finally {
      await events.close();
    }
  })
);

/* --------------------------------- history --------------------------------- */

const SUBMISSION_PUBLIC_FIELDS =
  "_id userId problemId assignmentId language status score totalScore passedCount totalCount executionTimeMs memoryUsedKb compileOutput errorMessage createdAt fullScoreAt";

function assertOwnerOrAdmin(req: AuthedRequest, submission: { userId: unknown } & Record<string, unknown>) {
  const isAdmin = req.user?.role === "ADMIN";
  if (!isAdmin && String(submission.userId) !== String(req.user!._id)) {
    throw forbidden("You can only view your own submissions.");
  }
}

submissionsRouter.get(
  "/",
  requireAuth,
  validate({
    query: z.object({
      problemId: z.string().optional(),
      assignmentId: z.string().optional(),
      userId: z.string().optional(), // admin only
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    const q = req.query as {
      problemId?: string;
      assignmentId?: string;
      userId?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);

    const filter: Record<string, unknown> = {};
    // Students are always scoped to themselves; admins may filter by user.
    if (authed.user?.role === "ADMIN" && q.userId) {
      filter.userId = q.userId;
    } else if (authed.user?.role !== "ADMIN") {
      filter.userId = authed.user!._id;
    }
    if (q.problemId) filter.problemId = q.problemId;
    if (q.assignmentId) filter.assignmentId = q.assignmentId;
    if (q.status) filter.status = q.status;

    const [items, total] = await Promise.all([
      Submission.find(filter)
        .select(SUBMISSION_PUBLIC_FIELDS)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name")
        .populate("problemId", "title points")
        .lean(),
      Submission.countDocuments(filter),
    ]);

    res.json({
      submissions: items.map((s) => ({
        id: String(s._id),
        userId: String((s.userId as { _id?: unknown })._id ?? s.userId),
        userName: (s.userId as { name?: string })?.name ?? undefined,
        problemId: String((s.problemId as { _id?: unknown })._id ?? s.problemId),
        problemTitle: (s.problemId as { title?: string })?.title ?? "",
        problemPoints: (s.problemId as { points?: number })?.points ?? 0,
        assignmentId: String(s.assignmentId),
        language: s.language,
        status: s.status,
        score: s.score,
        totalScore: s.totalScore,
        passedCount: s.passedCount,
        totalCount: s.totalCount,
        executionTimeMs: s.executionTimeMs,
        memoryUsedKb: s.memoryUsedKb,
        compileOutput: s.compileOutput,
        errorMessage: s.errorMessage,
        createdAt: s.createdAt,
      })),
      page,
      total,
      pages: Math.ceil(total / limit),
    });
  })
);

submissionsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    const s = await Submission.findById(req.params.id).lean();
    if (!s) throw notFound("Submission not found.");
    assertOwnerOrAdmin(authed, s);

    const results = await TestResult.find({ submissionId: s._id }).sort({ index: 1 }).lean();
    res.json({
      submission: {
        id: String(s._id),
        userId: String(s.userId),
        problemId: String(s.problemId),
        assignmentId: String(s.assignmentId),
        code: authed.user?.role === "ADMIN" || String(s.userId) === String(authed.user!._id) ? s.code : undefined,
        language: s.language,
        status: s.status,
        score: s.score,
        totalScore: s.totalScore,
        passedCount: s.passedCount,
        totalCount: s.totalCount,
        executionTimeMs: s.executionTimeMs,
        memoryUsedKb: s.memoryUsedKb,
        compileOutput: s.compileOutput,
        errorMessage: s.errorMessage,
        createdAt: s.createdAt,
      },
      // Verdicts only. Hidden-test inputs/expected outputs never leave the judge.
      testResults: results.map((r) => ({
        index: r.index,
        isSample: r.isSample,
        status: r.status,
        points: r.points,
        earned: r.earned,
        executionTimeMs: r.executionTimeMs,
        memoryUsedKb: r.memoryUsedKb,
        actualOutput: r.isSample ? r.actualOutput : undefined,
        stderrExcerpt: r.stderrExcerpt || undefined,
      })),
    });
  })
);

/** Re-judge (admin) — requeues an existing submission. */
submissionsRouter.post(
  "/:id/rejudge",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const s = await Submission.findById(req.params.id);
    if (!s) throw notFound("Submission not found.");
    const problem = await Problem.findById(s.problemId);
    if (!problem) throw notFound("Problem not found.");

    s.status = "QUEUED";
    s.score = 0;
    s.passedCount = 0;
    await s.save();

    const { enqueueSubmission } = await import("../queues/index.js");
    await enqueueSubmission({
      submissionId: String(s._id),
      problemId: String(problem._id),
      assignmentId: String(s.assignmentId),
      userId: String(s.userId),
      language: "cpp17",
      code: s.code,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      outputLimitKb: problem.outputLimitKb,
      comparisonMode: problem.comparisonMode,
      floatTolerance: problem.floatTolerance,
    });
    res.json({ ok: true, submissionId: String(s._id) });
  })
);

// convenience re-export for app wiring
export { User };
