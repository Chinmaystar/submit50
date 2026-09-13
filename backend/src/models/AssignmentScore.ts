import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

/**
 * Denormalized best-score-per-problem rollup used for leaderboards and
 * analytics. Best = max over the student's submissions for that problem
 * (never simply the latest).
 */
const assignmentScoreSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
    score: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    /** epoch ms when the current best score was first achieved */
    achievedAt: { type: Date, default: Date.now },
    bestSubmissionId: { type: Schema.Types.ObjectId, ref: "Submission" },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assignmentScoreSchema.index({ userId: 1, assignmentId: 1, problemId: 1 }, { unique: true });
assignmentScoreSchema.index({ assignmentId: 1, score: -1 });

export type AssignmentScoreDoc = InferSchemaType<typeof assignmentScoreSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AssignmentScore: Model<AssignmentScoreDoc> =
  mongoose.models.AssignmentScore ??
  mongoose.model<AssignmentScoreDoc>("AssignmentScore", assignmentScoreSchema);
