import type { FilterQuery, Types } from "mongoose";
import { effectiveState, Assignment, type AssignmentDoc } from "../models/Assignment.js";
import { Problem } from "../models/Problem.js";
import { Submission, TestCase, TestResult, AssignmentScore } from "../models/index.js";
import { notFound } from "../utils/errors.js";

export interface PublicAssignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  classroomId?: string;
  startTime: string | null;
  deadline: string | null;
  state: string;
  leaderboardEnabled: boolean;
  problemCount?: number;
  totalPoints?: number;
  earnedPoints?: number;
  attemptedProblems?: number;
  createdAt: string;
}

export function toPublicAssignment(a: AssignmentDoc, extra?: Partial<PublicAssignment>): PublicAssignment {
  return {
    id: String(a._id),
    title: a.title,
    description: a.description ?? "",
    instructions: a.instructions ?? "",
    classroomId: a.classroomId ? String(a.classroomId) : undefined,
    startTime: a.startTime ? a.startTime.toISOString() : null,
    deadline: a.deadline ? a.deadline.toISOString() : null,
    state: effectiveState(a),
    leaderboardEnabled: a.leaderboardEnabled,
    createdAt: (a.createdAt ?? new Date()).toISOString(),
    ...extra,
  };
}

/** List published assignments visible to students (with computed state). */
export async function listStudentAssignments(userId?: string | Types.ObjectId): Promise<PublicAssignment[]> {
  const now = new Date();
  const assignments = await Assignment.find({
    isPublished: true,
    state: { $ne: "ARCHIVED" },
  })
    .sort({ deadline: 1 })
    .lean();

  const ids = assignments.map((a) => a._id);
  const problems = await Problem.find({ assignmentId: { $in: ids } })
    .select("assignmentId points")
    .lean();

  const byAssignment = new Map<string, { count: number; points: number }>();
  for (const p of problems) {
    const key = String(p.assignmentId);
    const cur = byAssignment.get(key) ?? { count: 0, points: 0 };
    cur.count += 1;
    cur.points += p.points;
    byAssignment.set(key, cur);
  }

  // Per-user best scores so cards can show "earned/total" + a completed tag.
  let scoreByProblem = new Map<string, { score: number }>();
  if (userId) {
    const rows = await AssignmentScore.find({ userId, assignmentId: { $in: ids } })
      .select("problemId score")
      .lean();
    scoreByProblem = new Map(rows.map((r) => [String(r.problemId), r]));
  }

  return assignments
    .filter((a) => effectiveState(a as never, now) !== "DRAFT")
    .map((a) => {
      const stats = byAssignment.get(String(a._id)) ?? { count: 0, points: 0 };
      const earned = problems
        .filter((p) => String(p.assignmentId) === String(a._id))
        .reduce((s, p) => s + (scoreByProblem.get(String(p._id))?.score ?? 0), 0);
      const attempted = problems.filter((p) => String(p.assignmentId) === String(a._id) && scoreByProblem.has(String(p._id))).length;
      return toPublicAssignment(a as never, {
        problemCount: stats.count,
        totalPoints: stats.points,
        earnedPoints: earned,
        attemptedProblems: attempted,
      });
    });
}

export async function getAssignmentOr404(id: string): Promise<AssignmentDoc> {
  const a = await Assignment.findById(id);
  if (!a) throw notFound("Assignment not found.");
  return a;
}

/**
 * Delete an assignment and everything that depends on it: its problems,
 * the problems' test cases, every submission + test result on them, and the
 * score rollups. Irreversible — the admin UI confirms before calling.
 */
export async function deleteAssignment(id: string): Promise<void> {
  const a = await Assignment.findById(id);
  if (!a) throw notFound("Assignment not found.");

  const problemIds = await Problem.find({ assignmentId: a._id }).distinct("_id");
  const submissionIds = await Submission.find({ problemId: { $in: problemIds } }).distinct("_id");

  await Promise.all([
    TestCase.deleteMany({ problemId: { $in: problemIds } }),
    TestResult.deleteMany({ submissionId: { $in: submissionIds } }),
    Submission.deleteMany({ problemId: { $in: problemIds } }),
    AssignmentScore.deleteMany({ assignmentId: a._id }),
    Problem.deleteMany({ assignmentId: a._id }),
  ]);

  await a.deleteOne();
}
