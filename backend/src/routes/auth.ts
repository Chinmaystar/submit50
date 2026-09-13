import { Router } from "express";
import { z } from "zod";
import { config } from "../config/index.js";
import { signSession } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { loginWithPassword } from "../services/authService.js";
import { asyncHandler, unauthorized } from "../utils/errors.js";

export const authRouter = Router();

/* --------------------------- password login --------------------------- */

authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const user = await loginWithPassword(email, password);
    if (!user) throw unauthorized("Invalid email or password.");
    if (user.disabled) throw unauthorized("Your account has been disabled. Contact the admin.");
    res.cookie(config.cookieName, signSession(user), cookieOptions(req));
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  })
);

authRouter.post("/logout", (req, res) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    // Lightweight: verify token only; full user doc fetched by requireAuth elsewhere
    const { sessionToken } = await import("../middleware/auth.js");
    const token = sessionToken(req);
    if (!token) {
      res.status(401).json({ error: "Not logged in." });
      return;
    }
    const { verifySession } = await import("../middleware/auth.js");
    const { User } = await import("../models/User.js");
    const payload = verifySession(token);
    const user = await User.findById(payload.sub).lean();
    if (!user || user.disabled) {
      res.status(401).json({ error: "Not logged in." });
      return;
    }
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      rollNumber: user.rollNumber,
      role: user.role,
      picture: user.picture,
    });
  })
);

function isSecureReq(req: { protocol: string; get: (h: string) => string | undefined }): boolean {
  return req.protocol === "https" || req.get("x-forwarded-proto") === "https";
}

export function cookieOptions(req: { protocol: string; get: (h: string) => string | undefined }) {
  return {
    httpOnly: true,
    secure: config.isProd || isSecureReq(req),
    sameSite: "lax" as const,
    signed: true,
    maxAge: config.cookieMaxAgeMs,
    path: "/",
  };
}