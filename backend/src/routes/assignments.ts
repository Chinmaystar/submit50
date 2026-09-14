import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { validate, asyncHandler, notFound, badRequest } from "../utils/errors.js";
import { Assignment, Problem, Submission } from "../models/index.js";
import { effectiveState } from "../models/Assignment.js";
import { listStudentAssignments, toPublicAssignment, getAssignmentOr404, deleteAssignment } from "../services/assignmentService.js";
import { toPublicProblem } from "../services/problemService.js";

export const assignmentsRouter = Router();

const assignmentBase = z
  .object({
    classroomId: z.string().optional().nullable(),
    title: z.string().min(1).max(200),
    description: z.string().max(8000).optional(),
    instructions: z.string().max(20000).optional(),
    startTime: z.coerce.date().optional().nullable(),
    deadline: z.coerce.date().optional().nullable(),
    isPublished: z.boolean().optional(),
    leaderboardEnabled: z.boolean().optional(),
    tieBreak: z.enum(["score", "earliest"]).optional(),
  });

const assignmentInput = assignmentBase.refine(
  (v) => !v.startTime || !v.deadline || v.startTime <= v.deadline,
  {
    message: "Start time must be before the deadline.",
    path: ["deadline"],
  }
);

const assignmentPatchInput = assignmentBase.omit({ classroomId: true }).partial().superRefine((v, ctx) => {
  if (v.startTime && v.deadline && v.startTime > v.deadline) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start time must be before the deadline.",
      path: ["deadline"],
    });
  }
});

/* ---------------------------------- student --------------------------------- */

assignmentsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    res.json({ assignments: await listStudentAssignments(user._id) });
  })
);

assignmentsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    if (!a.isPublished) {
      // Draft assignments are staff-only (admin + mentor)
      if ((req as AuthedRequest).user?.role !== "ADMIN" && (req as AuthedRequest).user?.role !== "MENTOR") {
        throw notFound("Assignment not found.");
      }
    }
    const problems = await Problem.find({ assignmentId: a._id }).sort({ order: 1 }).lean();
    const totalPoints = problems.reduce((s, p) => s + p.points, 0);
    res.json({
      assignment: toPublicAssignment(a, {
        problemCount: problems.length,
        totalPoints,
      }),
      problems: problems.map((p) => {
        const pub = toPublicProblem(p as never);
        // List view: statement bodies + starter code are only served on the
        // problem page, but allowedLanguages is kept so rows can show badges.
        return { ...pub, statement: "", starterCode: {} };
      }),
      state: effectiveState(a),
    });
  })
);

/* ----------------------------------- admin ---------------------------------- */

assignmentsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: assignmentInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof assignmentInput>;
    const a = await Assignment.create({ ...body, createdBy: (req as AuthedRequest).user!._id });
    res.status(201).json({ assignment: toPublicAssignment(a) });
  })
);

assignmentsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: assignmentPatchInput }),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    const body = req.body as z.infer<typeof assignmentPatchInput>;
    if (body.startTime && body.deadline && body.startTime > body.deadline) {
      throw badRequest("Start time must be before the deadline.");
    }
    Object.assign(a, body);
    await a.save();
    res.json({ assignment: toPublicAssignment(a) });
  })
);

/** Publish / unpublish / close / archive transitions */
assignmentsRouter.post(
  "/:id/publish",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    const problems = await Problem.countDocuments({ assignmentId: a._id });
    if (problems === 0) throw badRequest("Add at least one problem before publishing.");
    a.isPublished = true;
    if (a.state === "DRAFT" || a.state === "ARCHIVED") a.state = "PUBLISHED";
    await a.save();
    res.json({ assignment: toPublicAssignment(a) });
  })
);

assignmentsRouter.post(
  "/:id/unpublish",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    a.isPublished = false;
    if (a.state !== "ARCHIVED") a.state = "DRAFT";
    await a.save();
    res.json({ assignment: toPublicAssignment(a) });
  })
);

assignmentsRouter.post(
  "/:id/close",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    a.state = "CLOSED";
    await a.save();
    res.json({ assignment: toPublicAssignment(a) });
  })
);

assignmentsRouter.post(
  "/:id/archive",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    a.state = "ARCHIVED";
    a.isPublished = false;
    await a.save();
    res.json({ assignment: toPublicAssignment(a) });
  })
);

/** Delete an assignment and all cascading data (problems, tests, submissions, scores). */
assignmentsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    await deleteAssignment(req.params.id);
    res.json({ ok: true });
  })
);

/** Admin: full assignment detail incl. problems */
assignmentsRouter.get(
  "/:id/full",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    const problems = await Problem.find({ assignmentId: a._id }).sort({ order: 1 }).lean();
    const submissionCounts = await Submission.aggregate<{ _id: string; count: number }>([
      { $match: { assignmentId: a._id } },
      { $group: { _id: "$problemId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(submissionCounts.map((c) => [String(c._id), c.count]));
    res.json({
      assignment: toPublicAssignment(a),
      problems: problems.map((p) => ({
        ...toPublicProblem(p as never),
        submissionCount: countMap.get(String(p._id)) ?? 0,
      })),
    });
  })
);

// Admin list (all states)
assignmentsRouter.get(
  "/admin/all",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (_req, res) => {
    const list = await Assignment.find().sort({ createdAt: -1 }).lean();
    const problemCounts = await Problem.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$assignmentId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(problemCounts.map((c) => [String(c._id), c.count]));
    res.json({
      assignments: list.map((a) =>
        toPublicAssignment(a as never, { problemCount: countMap.get(String((a as { _id: { toString(): string } })._id)) ?? 0 })
      ),
    });
  })
);
