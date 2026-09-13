import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

const testCaseSchema = new Schema(
  {
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
    // required: mongoose's required validator REJECTS empty strings, so a
    // "no input" / "no output" test case would be impossible. Presence is
    // enforced by the zod schemas at the API edge instead.
    input: { type: String, maxlength: 1000000 },
    expectedOutput: { type: String, maxlength: 1000000 },
    points: { type: Number, required: true, min: 0, max: 10000 },
    isSample: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

testCaseSchema.index({ problemId: 1, order: 1 });

export type TestCaseRaw = InferSchemaType<typeof testCaseSchema>;
export type TestCaseDoc = mongoose.HydratedDocument<TestCaseRaw, { _id: mongoose.Types.ObjectId }>;

export const TestCase: Model<TestCaseRaw> =
  mongoose.models.TestCase ?? mongoose.model<TestCaseRaw>("TestCase", testCaseSchema);
