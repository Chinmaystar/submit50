import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

export type AssignmentState = "DRAFT" | "PUBLISHED" | "ACTIVE" | "CLOSED" | "ARCHIVED";

const assignmentSchema = new Schema(
  {
    classroomId: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 8000, default: "" },
    instructions: { type: String, maxlength: 20000, default: "" },
    startTime: { type: Date },
    deadline: { type: Date },
    isPublished: { type: Boolean, default: false, index: true },
    state: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ACTIVE", "CLOSED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    leaderboardEnabled: { type: Boolean, default: true },
    // Leaderboard tie-break: "score" (default) or "earliest" (earliest full-score timestamp first)
    tieBreak: { type: String, enum: ["score", "earliest"], default: "score" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

assignmentSchema.index({ state: 1, deadline: 1 });
assignmentSchema.index({ classroomId: 1, isPublished: 1 });

export type AssignmentRaw = InferSchemaType<typeof assignmentSchema>;
export type AssignmentDoc = mongoose.HydratedDocument<AssignmentRaw, { _id: mongoose.Types.ObjectId }>;

export const Assignment: Model<AssignmentRaw> =
  mongoose.models.Assignment ?? mongoose.model<AssignmentRaw>("Assignment", assignmentSchema);

/** Compute the effective public state of an assignment at a moment in time. */
export function effectiveState(a: {
  state: AssignmentState;
  isPublished: boolean;
  startTime?: Date | null;
  deadline?: Date | null;
}, now = new Date()): AssignmentState {
  if (a.state === "ARCHIVED" || a.state === "CLOSED") return a.state;
  if (!a.isPublished) return "DRAFT";
  if (a.startTime && now < a.startTime) return "PUBLISHED"; // visible but not open
  if (a.deadline && now > a.deadline) return "CLOSED";
  return "ACTIVE";
}

/** Whether students may submit right now. Backend-enforced; never trust the client. */
export function isSubmissionOpen(a: {
  isPublished: boolean;
  startTime?: Date | null;
  deadline?: Date | null;
}, now = new Date()): { open: boolean; reason?: string } {
  if (!a.isPublished) return { open: false, reason: "Assignment is not published." };
  if (a.startTime && now < a.startTime)
    return { open: false, reason: "Assignment has not started yet." };
  if (a.deadline && now > a.deadline)
    return { open: false, reason: "The deadline for this assignment has passed." };
  return { open: true };
}
