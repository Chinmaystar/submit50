import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { COMPARISON_MODES, LANGUAGES } from "../types.js";

const problemSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    statement: { type: String, required: true, maxlength: 40000 },
    inputFormat: { type: String, maxlength: 10000, default: "" },
    outputFormat: { type: String, maxlength: 10000, default: "" },
    constraints: { type: String, maxlength: 10000, default: "" },
    sampleInput: { type: String, maxlength: 100000, default: "" },
    sampleOutput: { type: String, maxlength: 100000, default: "" },
    points: { type: Number, required: true, min: 0, max: 10000 },
    timeLimitMs: { type: Number, default: 2000, min: 100, max: 60000 },
    memoryLimitMb: { type: Number, default: 256, min: 16, max: 2048 },
    outputLimitKb: { type: Number, default: 1024, min: 1, max: 16384 },
    language: { type: String, enum: [...LANGUAGES], default: "cpp17" },
    starterCode: { type: String, maxlength: 65536, default: "" },
    comparisonMode: { type: String, enum: [...COMPARISON_MODES], default: "TOKEN" },
    // For FLOAT comparison mode (relative epsilon)
    floatTolerance: { type: Number, default: 1e-6 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

problemSchema.index({ assignmentId: 1, order: 1 });

export type ProblemRaw = InferSchemaType<typeof problemSchema>;
export type ProblemDoc = mongoose.HydratedDocument<ProblemRaw, { _id: mongoose.Types.ObjectId }>;

export const Problem: Model<ProblemRaw> =
  mongoose.models.Problem ?? mongoose.model<ProblemRaw>("Problem", problemSchema);
