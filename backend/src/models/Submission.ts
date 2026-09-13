import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { SUBMISSION_STATUSES } from "../types.js";

const submissionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
    code: { type: String, required: true, maxlength: 131072 },
    language: { type: String, required: true, default: "cpp17" },
    status: {
      type: String,
      enum: [...SUBMISSION_STATUSES],
      default: "QUEUED",
      index: true,
    },
    score: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    executionTimeMs: { type: Number, default: 0 },
    memoryUsedKb: { type: Number, default: 0 },
    compileOutput: { type: String, maxlength: 20000, default: "" },
    errorMessage: { type: String, maxlength: 2000, default: "" },
    judgeName: { type: String, default: "" },
    /** Epoch ms of first time this submission reached a full score — used for tie-breaks. */
    fullScoreAt: { type: Date },
  },
  { timestamps: true }
);

// History for a student on a problem, newest first
submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
// Admin monitoring / recent queue
submissionSchema.index({ createdAt: -1 });
submissionSchema.index({ assignmentId: 1, status: 1 });

export type SubmissionRaw = InferSchemaType<typeof submissionSchema>;
export type SubmissionDoc = mongoose.HydratedDocument<SubmissionRaw, { _id: mongoose.Types.ObjectId }>;

export const Submission: Model<SubmissionRaw> =
  mongoose.models.Submission ?? mongoose.model<SubmissionRaw>("Submission", submissionSchema);
