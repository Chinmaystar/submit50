import { AssignmentScore, Problem, Submission, TestCase } from "../models/index.js";
import { logger } from "../utils/logger.js";
import type { Types } from "mongoose";

/**
 * Recomputes the student's best score for a problem and rolls it up into
 * AssignmentScore. Called by the judge worker after storing results.
 * Best = max score across all of the student's submissions (never "latest").
 */
export async function updateBestScore(
  userId: string | Types.ObjectId,
  assignmentId: string | Types.ObjectId,
  problemId: string | Types.ObjectId
): Promise<void> {
  const [best] = await Submission.find({
    userId,
    problemId,
    status: { $in: ["ACCEPTED", "WRONG_ANSWER", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED", "OUTPUT_LIMIT_EXCEEDED", "RUNTIME_ERROR"] },
  })
    .sort({ score: -1, createdAt: 1 })
    .limit(1)
    .lean();

  const attempts = await Submission.countDocuments({ userId, problemId });
  const problem = await Problem.findById(problemId).lean();

  const bestScore = best?.score ?? 0;
  const total = problem?.points ?? 0;
  const achievedAt = best?.fullScoreAt ?? best?.createdAt ?? new Date();

  await AssignmentScore.findOneAndUpdate(
    { userId, problemId },
    {
      $set: {
        assignmentId,
        score: bestScore,
        totalScore: total,
        achievedAt,
        bestSubmissionId: best?._id,
      },
      $setOnInsert: { attempts },
    },
    { upsert: true, new: true }
  );

  logger.info("Best score updated", {
    userId: String(userId),
    problemId: String(problemId),
    score: bestScore,
    total,
  });
}

/**
 * Recalculate an assignment's totalScore for a user (sum of best problem
 * scores). Used by the leaderboard.
 */
export async function getAssignmentTotal(userId: string, assignmentId: string): Promise<number> {
  const rows = await AssignmentScore.find({ userId, assignmentId }).lean();
  return rows.reduce((sum, r) => sum + r.score, 0);
}

/** Validate that test-case points sum == problem points (warning, not error). */
export async function checkTestPointsConsistency(problemId: string): Promise<{ sum: number; expected: number }> {
  const tests = await TestCase.find({ problemId }).select("points").lean();
  const problem = await Problem.findById(problemId).select("points").lean();
  const sum = tests.reduce((s, t) => s + t.points, 0);
  return { sum, expected: problem?.points ?? 0 };
}
