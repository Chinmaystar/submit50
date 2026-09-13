/**
 * Persists judge verdicts to MongoDB. Runs in the judge worker process —
 * never in the API server.
 */
import { JudgeSubmission, JudgeTestResult, JudgeTestCase, JudgeAssignmentScore } from "./models.js";
import type { JudgeOutcome } from "./judge.js";
import { logger } from "./logger.js";
import type { SubmissionStatus } from "./types.js";
import { judgeConfig } from "./config.js";

function overallStatus(outcome: JudgeOutcome, testsTotal: number): SubmissionStatus {
  if (!outcome.ok) return "COMPILATION_ERROR";
  const passedAll = outcome.verdicts.length === testsTotal && outcome.verdicts.every((v) => v.status === "PASSED");
  if (passedAll) return "ACCEPTED";
  // overall = first failing test's status (display order)
  for (const v of outcome.verdicts) {
    if (v.status !== "PASSED") return v.status as SubmissionStatus;
  }
  return "WRONG_ANSWER";
}

export async function persistSubmissionResult(
  submissionId: string,
  outcome: JudgeOutcome
): Promise<void> {
  const submission = await JudgeSubmission.findById(submissionId);
  if (!submission) {
    logger.error("Judge result for missing submission", { submissionId });
    return;
  }

  if (!outcome.ok) {
    submission.status = "COMPILATION_ERROR";
    submission.compileOutput = (outcome.compileError ?? "").slice(0, 20_000);
    submission.score = 0;
    submission.passedCount = 0;
    submission.totalCount = 0;
    submission.judgeName = judgeConfig.name;
    await submission.save();
    logger.info("Submission judged", { submissionId, status: "COMPILATION_ERROR" });
    return;
  }

  // test cases for points + sample flags
  const testIds = outcome.verdicts.map((v) => v.testId);
  const tests = await JudgeTestCase.find({ _id: { $in: testIds } }).lean();
  const testById = new Map(tests.map((t) => [String(t._id), t]));

  await JudgeTestResult.deleteMany({ submissionId: submission._id });

  const docs = outcome.verdicts.map((v, i) => {
    const t = testById.get(v.testId);
    return {
      submissionId: submission._id,
      testCaseId: t?._id,
      index: i,
      isSample: t?.isSample ?? false,
      status: v.status,
      points: t?.points ?? 0,
      earned: v.earned,
      executionTimeMs: v.executionTimeMs,
      memoryUsedKb: v.memoryUsedKb,
      actualOutput: (t?.isSample ? v.actualOutput : "") ?? "",
      stderrExcerpt: v.stderrExcerpt ?? "",
    };
  });
  if (docs.length > 0) await JudgeTestResult.insertMany(docs);

  const score = outcome.verdicts.reduce((s, v) => s + v.earned, 0);
  const totalScore = tests
    .filter((t) => outcome.verdicts.some((v) => String(v.testId) === String(t._id)))
    .reduce((s, t) => s + (t.points ?? 0), 0);
  const passedCount = outcome.verdicts.filter((v) => v.status === "PASSED").length;

  submission.status = overallStatus(outcome, docs.length);
  submission.score = score;
  submission.totalScore = totalScore;
  submission.passedCount = passedCount;
  submission.totalCount = docs.length;
  submission.executionTimeMs = outcome.totalExecutionTimeMs;
  submission.memoryUsedKb = outcome.maxMemoryKb;
  submission.judgeName = judgeConfig.name;
  if (submission.status === "ACCEPTED") {
    submission.fullScoreAt = submission.fullScoreAt ?? new Date();
  }
  await submission.save();

  await updateBestScore(String(submission.userId), String(submission.assignmentId), String(submission.problemId));

  logger.info("Submission judged", {
    submissionId,
    status: submission.status,
    score,
    totalScore,
    verdicts: outcome.verdicts.map((v) => v.status),
  });
}

/** Best = max score across the student's submissions for the problem. */
export async function updateBestScore(userId: string, assignmentId: string, problemId: string): Promise<void> {
  const scored = await JudgeSubmission.find({
    userId,
    problemId,
    status: { $in: ["ACCEPTED", "WRONG_ANSWER", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED", "OUTPUT_LIMIT_EXCEEDED", "RUNTIME_ERROR"] },
  })
    .sort({ score: -1, createdAt: 1 })
    .limit(1)
    .lean();

  const attempts = await JudgeSubmission.countDocuments({ userId, problemId });
  const best = scored[0];

  await JudgeAssignmentScore.findOneAndUpdate(
    { userId, problemId },
    {
      $set: {
        assignmentId,
        score: best?.score ?? 0,
        totalScore: best?.totalScore ?? 0,
        achievedAt: best?.fullScoreAt ?? best?.createdAt ?? new Date(),
        bestSubmissionId: best?._id,
      },
      $setOnInsert: { attempts },
    },
    { upsert: true }
  );
}
