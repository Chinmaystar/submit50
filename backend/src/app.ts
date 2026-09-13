import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/index.js";
import { errorHandler, HttpError } from "./utils/errors.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { problemsRouter } from "./routes/problems.js";
import { problemSubmitRouter, submissionsRouter } from "./routes/submissions.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { adminRouter } from "./routes/admin.js";
import { requireAuth } from "./middleware/auth.js";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", config.trustProxy ? 1 : 0);

  app.use(helmet({ contentSecurityPolicy: false })); // CSP handled by the frontend host
  app.use(
    cors({
      origin(origin, cb) {
        // allow same-origin/no-origin (curl, mobile apps) and whitelisted frontends
        if (!origin || config.frontendUrls.includes(origin.replace(/\/+$/, ""))) {
          cb(null, true);
        } else {
          cb(new HttpError(403, "Origin not allowed.", "CORS"));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ limit: "1mb", type: ["text/csv", "text/plain"] }));
  app.use(cookieParser(config.cookieSecret));
  app.use(globalLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "submit50-api", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/assignments", assignmentsRouter);
  app.use("/api/problems", problemsRouter);
  app.use("/api/problems", problemSubmitRouter);
  app.use("/api/submissions", submissionsRouter);
  app.use("/api", leaderboardRouter); // provides /api/assignments/:id/leaderboard
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/admin", adminRouter);

  // 404 for unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found.", code: "NOT_FOUND" });
  });

  app.use(errorHandler);
  return app;
}
