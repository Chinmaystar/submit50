import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validate, asyncHandler, badRequest, notFound } from "../utils/errors.js";
import { User, Submission, AssignmentScore, ClassroomMembership, Problem, Assignment } from "../models/index.js";
import { logger } from "../utils/logger.js";
import { hashPassword } from "../utils/password.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/* ------------------------------ student management ------------------------------ */

adminRouter.get(
  "/students",
  validate({
    query: z.object({
      search: z.string().max(120).optional(),
      role: z.string().optional(),
      disabled: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as { search?: string; role?: string; disabled?: string; page?: string; limit?: string };
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 50);

    const filter: Record<string, unknown> = {};
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), "i");
      filter.$or = [{ name: rx }, { email: rx }, { rollNumber: rx }];
    }
    if (q.role) filter.role = q.role;
    if (q.disabled === "true") filter.disabled = true;
    if (q.disabled === "false") filter.disabled = false;

    const [students, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select({ name: 1, email: 1, rollNumber: 1, role: 1, disabled: 1, createdAt: 1, lastLoginAt: 1, passwordHash: 1 })
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      students: students.map(({ passwordHash, ...rest }) => ({
        ...rest,
        hasPassword: Boolean(passwordHash),
      })),
      page,
      total,
      pages: Math.ceil(total / limit),
    });
  })
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

adminRouter.post(
  "/students",
  validate({
    body: z.object({
      name: z.string().min(1).max(120),
      email: z.string().email(),
      rollNumber: z.string().max(32).optional(),
      role: z.enum(["STUDENT", "MENTOR", "ADMIN"]).default("STUDENT"),
      password: z.string().min(8).max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { password, ...body } = req.body as { name: string; email: string; rollNumber?: string; role?: string; password?: string };
    const email = body.email.toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (existing) {
      Object.assign(existing, { name: body.name, rollNumber: body.rollNumber, role: body.role });
      if (password) existing.passwordHash = hashPassword(password);
      await existing.save();
      res.json({ student: existing, updated: true });
      return;
    }
    if (!password) throw badRequest("Password is required for new students.");
    const user = await User.create({ ...body, email, passwordHash: hashPassword(password) });
    res.status(201).json({ student: user, updated: false });
  })
);

adminRouter.patch(
  "/students/:id",
  validate({
    body: z.object({
      role: z.enum(["STUDENT", "MENTOR", "ADMIN"]).optional(),
      disabled: z.boolean().optional(),
      name: z.string().max(120).optional(),
      rollNumber: z.string().max(32).optional(),
      password: z.string().min(8).max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound("Student not found.");
    const { password, ...body } = req.body as { role?: string; disabled?: boolean; name?: string; rollNumber?: string; password?: string };
    // Guard: an admin cannot disable themselves
    if (String(user._id) === String((req as { user?: { _id: unknown } }).user?._id) && body.disabled === true) {
      throw badRequest("You cannot disable your own account.");
    }
    Object.assign(user, body);
    if (password) user.passwordHash = hashPassword(password);
    await user.save();
    res.json({ student: user });
  })
);

/** Cascading account deletion. Sessions are stateless JWTs validated against the
 *  DB on each request, so a deleted user is logged out of every browser at once. */
adminRouter.delete(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound("Student not found.");
    if (String(user._id) === String((req as { user?: { _id: unknown } }).user?._id)) {
      throw badRequest("You cannot delete your own account.");
    }

    const id = user._id;
    await Promise.all([
      Submission.deleteMany({ userId: id }),
      AssignmentScore.deleteMany({ userId: id }),
      ClassroomMembership.deleteMany({ userId: id }),
      user.deleteOne(),
    ]);
    logger.info("Account deleted", { userId: String(id), email: user.email, by: String((req as { user?: { _id: unknown } }).user?._id) });
    res.json({ deleted: true, userId: String(id) });
  })
);

/** CSV import: rollNumber,name,email (header row optional). */
adminRouter.post(
  "/students/import",
  asyncHandler(async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : String((req.body as { csv?: string })?.csv ?? "");
    if (!csv.trim()) throw badRequest("Provide CSV content.");

    const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw badRequest("Could not parse CSV.");
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of parsed.data) {
      if (!Array.isArray(row) || row.length < 3) continue;
      let [rollNumber, name, email, password] = row.map((c) => (c ?? "").trim());
      // Skip header row
      if (/^roll\s*number$/i.test(rollNumber) && /^name$/i.test(name)) continue;
      email = email.toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.push(`Invalid email in row: ${row.join(",")}`);
        continue;
      }
      if (password && password.length < 8) {
        errors.push(`Password too short (min 8 chars) for ${email}`);
        continue;
      }
      try {
        const setFields: Record<string, unknown> = { name: name || email.split("@")[0], rollNumber: rollNumber || undefined };
        if (password) setFields.passwordHash = hashPassword(password);
        const r = await User.updateOne(
          { email },
          {
            $set: setFields,
            $setOnInsert: { role: "STUDENT" },
          },
          { upsert: true }
        );
        if (r.upsertedCount) created += 1;
        else updated += 1;
      } catch (e) {
        errors.push(`Failed for ${email}: ${String(e)}`);
      }
    }

    logger.info("CSV student import", { created, updated, errors: errors.length });
    res.json({ created, updated, errors: errors.slice(0, 20) });
  }),
  // accept raw text/csv bodies too
  (req, _res, next) => {
    next();
  }
);

/* ---------------------------------- analytics ---------------------------------- */

adminRouter.get(
  "/assignments/:id/analytics",
  asyncHandler(async (req, res) => {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) throw notFound("Assignment not found.");

    const problems = await Problem.find({ assignmentId: assignment._id }).sort({ order: 1 }).lean();
    const scores = await AssignmentScore.find({ assignmentId: assignment._id }).lean();

    const registered = await User.countDocuments({ role: { $in: ["STUDENT", "MENTOR"] }, disabled: false });

    const byUser = new Map<string, number>();
    for (const s of scores) {
      byUser.set(String(s.userId), (byUser.get(String(s.userId)) ?? 0) + s.score);
    }
    const submittedUsers = byUser.size;
    const scoreValues = [...byUser.values()].sort((a, b) => a - b);
    const avg = scoreValues.length ? scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length : 0;
    const median =
      scoreValues.length === 0
        ? 0
        : scoreValues.length % 2 === 1
          ? scoreValues[(scoreValues.length - 1) / 2]
          : (scoreValues[scoreValues.length / 2 - 1] + scoreValues[scoreValues.length / 2]) / 2;

    const problemStats = problems.map((p) => {
      const rows = scores.filter((s) => String(s.problemId) === String(p._id));
      const solved = rows.filter((r) => r.totalScore > 0 && r.score >= r.totalScore).length;
      const attempted = rows.length;
      const avgScore = attempted ? rows.reduce((s, r) => s + r.score, 0) / attempted : 0;
      return {
        problemId: String(p._id),
        title: p.title,
        points: p.points,
        solved,
        attempted,
        avgScore: Math.round(avgScore * 10) / 10,
        notAttempted: Math.max(0, registered - attempted),
      };
    });

    res.json({
      assignment: {
        id: String(assignment._id),
        title: assignment.title,
        state: assignment.state,
        deadline: assignment.deadline,
      },
      registered,
      submitted: submittedUsers,
      notSubmitted: Math.max(0, registered - submittedUsers),
      averageScore: Math.round(avg * 10) / 10,
      medianScore: Math.round(median * 10) / 10,
      highestScore: scoreValues.at(-1) ?? 0,
      lowestScore: scoreValues[0] ?? 0,
      problemStats,
    });
  })
);

/** Submission monitoring feed */
adminRouter.get(
  "/submissions",
  validate({
    query: z.object({
      status: z.string().optional(),
      assignmentId: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as { status?: string; assignmentId?: string; page?: string };
    const page = Number(q.page ?? 1);
    const limit = 30;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.assignmentId) filter.assignmentId = q.assignmentId;

    const [items, total] = await Promise.all([
      Submission.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name rollNumber")
        .populate("problemId", "title")
        .lean(),
      Submission.countDocuments(filter),
    ]);

    res.json({
      submissions: items.map((s) => ({
        id: String(s._id),
        studentName: (s.userId as { name?: string } | null)?.name ?? "",
        rollNumber: (s.userId as { rollNumber?: string } | null)?.rollNumber ?? "",
        problemTitle: (s.problemId as { title?: string } | null)?.title ?? "",
        status: s.status,
        score: s.score,
        totalScore: s.totalScore,
        language: s.language,
        executionTimeMs: s.executionTimeMs,
        createdAt: s.createdAt,
      })),
      page,
      total,
      pages: Math.ceil(total / limit),
    });
  })
);
