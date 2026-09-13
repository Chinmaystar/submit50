import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";
import { Assignment, AssignmentScore, Problem, Submission, effectiveState } from "../models/index.js";
import { toPublicAssignment } from "../services/assignmentService.js";

export const dashboardRouter = Router();

/**
 * GET /api/dashboard — everything the student landing page needs in one call:
 * active/upcoming/past assignments, progress, latest submissions, scores.
 */
dashboardRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    const userId = authed.user!._id;
    const now = new Date();

    const assignments = (
      await Assignment.find({ isPublished: true, state: { $ne: "ARCHIVED" } }).lean()
    ).filter((a) => effectiveState(a as never, now) !== "DRAFT");

    const assignmentIds = assignments.map((a) => a._id);
    const problems = await Problem.find({ assignmentId: { $in: assignmentIds } })
      .select("_id assignmentId title points order")
      .sort({ order: 1 })
      .lean();
    const problemIds = problems.map((p) => p._id);

    const [scores, latestSubs] = await Promise.all([
      AssignmentScore.find({ userId, assignmentId: { $in: assignmentIds } }).lean(),
      Submission.find({ userId, problemId: { $in: problemIds } })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate("problemId", "title")
        .select("_id problemId language status score totalScore executionTimeMs createdAt")
        .lean(),
    ]);

    const scoreByProblem = new Map(scores.map((s) => [String(s.problemId), s]));

    const byAssignment = assignments.map((a) => {
      const aProblems = problems.filter((p) => String(p.assignmentId) === String(a._id));
      const totalPoints = aProblems.reduce((s, p) => s + p.points, 0);
      const earned = aProblems.reduce((s, p) => s + (scoreByProblem.get(String(p._id))?.score ?? 0), 0);
      const attempted = aProblems.filter((p) => scoreByProblem.has(String(p._id))).length;
      return {
        ...toPublicAssignment(a as never),
        problemCount: aProblems.length,
        totalPoints,
        earnedPoints: earned,
        attemptedProblems: attempted,
      };
    });

    const active = byAssignment.filter((a) => a.state === "ACTIVE");
    const upcoming = byAssignment.filter((a) => a.state === "PUBLISHED");
    const past = byAssignment.filter((a) => a.state === "CLOSED");

    res.json({
      user: {
        id: String(userId),
        name: authed.user!.name,
        rollNumber: authed.user!.rollNumber,
        role: authed.user!.role,
      },
      active,
      upcoming,
      past,
      latestSubmissions: latestSubs.map((s) => ({
        id: String(s._id),
        problemTitle: (s.problemId as { title?: string } | null)?.title ?? "",
        language: s.language,
        status: s.status,
        score: s.score,
        totalScore: s.totalScore,
        executionTimeMs: s.executionTimeMs,
        createdAt: s.createdAt,
      })),
      totals: {
        assignments: byAssignment.length,
        problemsSolved: scores.filter((s) => s.totalScore > 0 && s.score >= s.totalScore).length,
        problemsAttempted: scores.length,
      },
    });
  })
);
