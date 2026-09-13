import { User } from "../models/User.js";
import type { UserDoc } from "../models/User.js";
import { verifyPassword } from "../utils/password.js";

/**
 * Accounts are created by admins (single add or CSV import) with an initial
 * password. This verifies credentials and returns the (enabled) user, or null
 * when the email is unknown or the password is wrong.
 */
export async function loginWithPassword(email: string, password: string): Promise<UserDoc | null> {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) return null;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}