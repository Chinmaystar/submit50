import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

const classroomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 4000, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type ClassroomDoc = InferSchemaType<typeof classroomSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Classroom: Model<ClassroomDoc> =
  mongoose.models.Classroom ?? mongoose.model<ClassroomDoc>("Classroom", classroomSchema);
