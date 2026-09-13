/**
 * Minimal read/write models for the judge. The judge owns Submission and
 * TestResult WRITES (verdicts) and reads TestCase content. It has DB
 * credentials but the SANDBOX never does.
 */
import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { TEST_STATUSES, SUBMISSION_STATUSES } from "./types.js";

const submissionSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    assignmentId: Schema.Types.ObjectId,
    problemId: Schema.Types.ObjectId,
    code: String,
    language: String,
    status: { type: String, enum: [...SUBMISSION_STATUSES], index: true },
    score: Number,
    totalScore: Number,
    passedCount: Number,
    totalCount: Number,
    executionTimeMs: Number,
    memoryUsedKb: Number,
    compileOutput: String,
    errorMessage: String,
    judgeName: String,
    fullScoreAt: Date,
  },
  { timestamps: true, collection: "submissions" }
);

const testResultSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, index: true },
    testCaseId: Schema.Types.ObjectId,
    index: Number,
    isSample: Boolean,
    status: { type: String, enum: [...TEST_STATUSES] },
    points: Number,
    earned: Number,
    executionTimeMs: Number,
    memoryUsedKb: Number,
    actualOutput: { type: String, default: "" },
    stderrExcerpt: { type: String, default: "" },
  },
  { timestamps: true, collection: "testresults" }
);

const testCaseSchema = new Schema(
  {
    problemId: Schema.Types.ObjectId,
    input: String,
    expectedOutput: String,
    points: Number,
    isSample: Boolean,
    order: Number,
  },
  { collection: "testcases" }
);

const assignmentScoreSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    assignmentId: Schema.Types.ObjectId,
    problemId: Schema.Types.ObjectId,
    score: Number,
    totalScore: Number,
    achievedAt: Date,
    bestSubmissionId: Schema.Types.ObjectId,
    attempts: Number,
  },
  { timestamps: true, collection: "assignmentscores" }
);

export type SubmissionDoc = InferSchemaType<typeof submissionSchema> & { _id: mongoose.Types.ObjectId };
export type TestResultDoc = InferSchemaType<typeof testResultSchema> & { _id: mongoose.Types.ObjectId };
export type TestCaseDoc = InferSchemaType<typeof testCaseSchema> & { _id: mongoose.Types.ObjectId };
export type AssignmentScoreDoc = InferSchemaType<typeof assignmentScoreSchema> & { _id: mongoose.Types.ObjectId };

export const JudgeSubmission: Model<SubmissionDoc> =
  mongoose.models.Submission ?? mongoose.model<SubmissionDoc>("Submission", submissionSchema);

export const JudgeTestResult: Model<TestResultDoc> =
  mongoose.models.TestResult ?? mongoose.model<TestResultDoc>("TestResult", testResultSchema);

export const JudgeTestCase: Model<TestCaseDoc> =
  mongoose.models.TestCase ?? mongoose.model<TestCaseDoc>("TestCase", testCaseSchema);

export const JudgeAssignmentScore: Model<AssignmentScoreDoc> =
  mongoose.models.AssignmentScore ??
  mongoose.model<AssignmentScoreDoc>("AssignmentScore", assignmentScoreSchema);
