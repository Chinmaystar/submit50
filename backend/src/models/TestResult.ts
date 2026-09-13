import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { TEST_STATUSES } from "../types.js";

/**
 * One row per (submission, test case). Inputs/expected outputs of hidden
 * tests are NEVER stored here in plaintext form readable by students —
 * in fact we store no input/output content at all, only the verdict,
 * plus (for samples) the actual output for display.
 */
const testResultSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
    testCaseId: { type: Schema.Types.ObjectId, ref: "TestCase", required: true },
    index: { type: Number, required: true }, // display order
    isSample: { type: Boolean, default: false },
    status: { type: String, enum: [...TEST_STATUSES], required: true },
    points: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    executionTimeMs: { type: Number, default: 0 },
    memoryUsedKb: { type: Number, default: 0 },
    // Stored ONLY for sample tests so students can diff their output.
    // For hidden tests this is always "" — enforced in the judge writer.
    actualOutput: { type: String, maxlength: 100000, default: "" },
    // Short sanitized stderr excerpt, never includes host info.
    stderrExcerpt: { type: String, maxlength: 2000, default: "" },
  },
  { timestamps: true }
);

testResultSchema.index({ submissionId: 1, index: 1 });

export type TestResultDoc = InferSchemaType<typeof testResultSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TestResult: Model<TestResultDoc> =
  mongoose.models.TestResult ?? mongoose.model<TestResultDoc>("TestResult", testResultSchema);
