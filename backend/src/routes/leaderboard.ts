import { Router } from "express";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { getLeaderboard } from "../services/leaderboardService.js";
import { getAssignmentOr404 } from "../services/assignmentService.js";

export const leaderboardRouter = Router();

leaderboardRouter.get(
  "/assignments/:id/leaderboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    if (!a.isPublished && (req as AuthedRequest).user?.role !== "ADMIN") {
      throw notFound("Assignment not found.");
    }
    const rows = await getLeaderboard(a);
    res.json({ leaderboard: rows });
  })
);

// Admin: leaderboard even when disabled for students
leaderboardRouter.get(
  "/admin/assignments/:id/leaderboard",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const a = await getAssignmentOr404(req.params.id);
    res.json({ leaderboard: await getLeaderboard(a) });
  })
);
