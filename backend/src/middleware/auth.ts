import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../types.js";
import { config } from "../config/index.js";
import { User, type UserDoc } from "../models/User.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export interface AuthedRequest extends Request {
  user?: UserDoc;
}

export interface SessionPayload {
  sub: string; // user id
  role: Role;
}

export function signSession(user: UserDoc): string {
  const payload: SessionPayload = { sub: String(user._id), role: user.role as Role };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, config.jwtSecret) as SessionPayload;
}

/**
 * Reads the session token. The cookie is signed, so cookie-parser stores the
 * decoded value in `req.signedCookies` (and removes it from `req.cookies`).
 * Falls back to `req.cookies` in case a future path sets an unsigned cookie.
 */
export function sessionToken(req: Request): string | undefined {
  return (
    (req.signedCookies as Record<string, string | undefined> | undefined)?.[config.cookieName] ??
    (req.cookies as Record<string, string | undefined> | undefined)?.[config.cookieName]
  );
}

/**
 * Session lookup is done against the DB on every request so that disabling a
 * student or revoking a role takes effect immediately (JWT alone can't).
 */
export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = sessionToken(req);
    if (!token) throw unauthorized();
    const payload = verifySession(token);
    const user = await User.findById(payload.sub);
    if (!user) throw unauthorized();
    if (user.disabled) throw forbidden("Your account has been disabled. Contact the admin.");
    req.user = user;
    next();
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      next(unauthorized("Session expired. Please log in again."));
      return;
    }
    next(e);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      next(forbidden("Insufficient permissions."));
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");
