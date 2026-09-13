import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import type { Role } from "../types.js";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    rollNumber: { type: String, trim: true, uppercase: true, sparse: true, index: true },
    role: { type: String, enum: ["STUDENT", "MENTOR", "ADMIN"], default: "STUDENT" },
    picture: { type: String },
    passwordHash: { type: String, select: false },
    disabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, disabled: 1 });

export type UserRaw = InferSchemaType<typeof userSchema>;
export type UserDoc = mongoose.HydratedDocument<UserRaw, { _id: mongoose.Types.ObjectId }>;

export const User: Model<UserRaw> =
  mongoose.models.User ?? mongoose.model<UserRaw>("User", userSchema);
