import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

const classroomMembershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classroomId: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

classroomMembershipSchema.index({ userId: 1, classroomId: 1 }, { unique: true });

export type ClassroomMembershipDoc = InferSchemaType<typeof classroomMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ClassroomMembership: Model<ClassroomMembershipDoc> =
  mongoose.models.ClassroomMembership ??
  mongoose.model<ClassroomMembershipDoc>("ClassroomMembership", classroomMembershipSchema);
