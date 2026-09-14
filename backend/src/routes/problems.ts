import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { validate, asyncHandler, badRequest } from "../utils/errors.js";
import { Problem, TestCase } from "../models/index.js";
import { getAssignmentOr404 } from "../services/assignmentService.js";
import { getProblemOr404, toPublicProblem, deleteProblem } from "../services/problemService.js";
import { checkTestPointsConsistency } from "../services/scoringService.js";
import { LANGUAGES, type LanguageId } from "../types.js";

export const problemsRouter = Router();

const languageMap = z
  .object({
    c17: z.string().max(65536).optional(),
    cpp17: z.string().max(65536).optional(),
    java17: z.string().max(65536).optional(),
  })
  .optional();

const referenceMap = z
  .object({
    c17: z.string().max(131072).optional(),
    cpp17: z.string().max(131072).optional(),
    java17: z.string().max(131072).optional(),
  })
  .optional();

const problemInput = z.object({
  assignmentId: z.string(),
  title: z.string().min(1).max(200),
  statement: z.string().min(1).max(40000),
  inputFormat: z.string().max(10000).optional(),
  outputFormat: z.string().max(10000).optional(),
  constraints: z.string().max(10000).optional(),
  sampleInput: z.string().max(100000).optional(),
  sampleOutput: z.string().max(100000).optional(),
  points: z.number().min(0).max(10000),
  timeLimitMs: z.number().min(100).max(60000).optional(),
  memoryLimitMb: z.number().min(16).max(2048).optional(),
  outputLimitKb: z.number().min(1).max(16384).optional(),
  allowedLanguages: z.array(z.enum(LANGUAGES)).min(1),
  starterCode: languageMap,
  referenceSolutions: referenceMap,
  comparisonMode: z.enum(["EXACT", "TOKEN", "FLOAT"]).optional(),
  floatTolerance: z.number().min(1e-12).max(1).optional(),
  order: z.number().int().min(0).optional(),
});

/**
 * Server-side language hygiene: drop unknown/duplicate language ids and
 * keep per-language maps aligned with the effective allowed set.
 */
function sanitizeLanguageBody(
  body: z.infer<typeof problemInput>,
  fallbackAllowed: LanguageId[]
): z.infer<typeof problemInput> {
  const out = { ...body };
  let allowed = Array.isArray(body.allowedLanguages) ? body.allowedLanguages : (fallbackAllowed as LanguageId[]);
  allowed = [...new Set(allowed.filter((l) => (LANGUAGES as readonly string[]).includes(l)))];
  if (allowed.length === 0) throw badRequest("At least one allowed language is required.");
  out.allowedLanguages = allowed as z.infer<typeof problemInput>["allowedLanguages"];

  for (const key of ["starterCode", "referenceSolutions"] as const) {
    const map = body[key] as Record<string, string> | undefined;
    if (map && typeof map === "object") {
      const filtered: Record<string, string> = {};
      for (const lang of allowed) {
        if (typeof map[lang] === "string") filtered[lang] = map[lang];
      }
      out[key] = filtered as never;
    }
  }
  return out;
}

/** Student-facing: public problem fields only (never hidden tests). */
problemsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const assignment = await getAssignmentOr404(String(p.assignmentId));
    const staff = ["ADMIN", "MENTOR"].includes((req as AuthedRequest).user?.role ?? "");
    if (!assignment.isPublished && !staff) throw badRequest("Assignment is not published.");
    const samples = await TestCase.find({ problemId: p._id, isSample: true })
      .sort({ order: 1 })
      .select("input expectedOutput points order")
      .lean();

    res.json({
      problem: toPublicProblem(p, { includeAdmin: staff }),
      // Explicit sample list (same data as the problem's sampleInput fields).
      samples: samples.map((t) => ({
        id: String(t._id),
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: t.points,
        order: t.order,
      })),
    });
  })
);

/* ----------------------------------- admin ---------------------------------- */

problemsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: problemInput }),
  asyncHandler(async (req, res) => {
    const body = sanitizeLanguageBody(req.body as z.infer<typeof problemInput>, ["cpp17"]);
    await getAssignmentOr404(body.assignmentId);
    const p = await Problem.create(body);
    res.status(201).json({ problem: toPublicProblem(p, { includeAdmin: true }) });
  })
);

problemsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: problemInput.partial().omit({ assignmentId: true }) }),
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const fallback = (Array.isArray(p.allowedLanguages) ? p.allowedLanguages : ["cpp17"]) as LanguageId[];
    const body = sanitizeLanguageBody(req.body as z.infer<typeof problemInput>, fallback);
    Object.assign(p, body);
    await p.save();
    res.json({ problem: toPublicProblem(p, { includeAdmin: true }) });
  })
);

problemsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    await deleteProblem(req.params.id);
    res.json({ ok: true });
  })
);

/* ------------------------------ test case admin ------------------------------ */

const testInput = z.object({
  input: z.string().max(1000000),
  expectedOutput: z.string().max(1000000),
  points: z.number().min(0).max(10000),
  isSample: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

/** List tests for a problem — ADMIN ONLY, this is the hidden data. */
problemsRouter.get(
  "/:id/tests",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const tests = await TestCase.find({ problemId: p._id }).sort({ isSample: -1, order: 1 }).lean();
    const consistency = await checkTestPointsConsistency(String(p._id));
    res.json({
      tests: tests.map((t) => ({
        id: String(t._id),
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: t.points,
        isSample: t.isSample,
        order: t.order,
      })),
      pointsSummary: consistency,
    });
  })
);

problemsRouter.post(
  "/:id/tests",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: testInput }),
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const body = req.body as z.infer<typeof testInput>;
    const t = await TestCase.create({ ...body, problemId: p._id });
    res.status(201).json({ test: { id: String(t._id) } });
  })
);

problemsRouter.patch(
  "/:id/tests/:testId",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({ body: testInput.partial() }),
  asyncHandler(async (req, res) => {
    const t = await TestCase.findOne({ _id: req.params.testId, problemId: req.params.id });
    if (!t) throw badRequest("Test case not found.");
    Object.assign(t, req.body);
    await t.save();
    res.json({ ok: true });
  })
);

problemsRouter.delete(
  "/:id/tests/:testId",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  asyncHandler(async (req, res) => {
    await TestCase.deleteOne({ _id: req.params.testId, problemId: req.params.id });
    res.json({ ok: true });
  })
);

/**
 * Bulk upload tests: [{input, expectedOutput, points?, isSample?}] with
 * automatic point splitting. If `distribute` is set, problem.points are split
 * evenly across all hidden tests.
 */
problemsRouter.post(
  "/:id/tests/bulk",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({
    body: z.object({
      distribute: z.boolean().optional(),
      tests: z
        .array(
          z.object({
            input: z.string().max(1000000),
            expectedOutput: z.string().max(1000000),
            points: z.number().min(0).max(10000).optional(),
            isSample: z.boolean().optional(),
          })
        )
        .min(1)
        .max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const { tests, distribute } = req.body as {
      tests: { input: string; expectedOutput: string; points?: number; isSample?: boolean }[];
      distribute?: boolean;
    };

    const hidden = tests.filter((t) => !t.isSample);
    const autoPoints =
      distribute && hidden.length > 0
        ? Math.floor((p.points / hidden.length) * 100) / 100
        : undefined;

    const docs = tests.map((t, i) => ({
      problemId: p._id,
      input: t.input,
      expectedOutput: t.expectedOutput,
      points: t.points ?? (t.isSample ? 0 : autoPoints ?? 0),
      isSample: t.isSample ?? false,
      order: i,
    }));
    const created = await TestCase.insertMany(docs);
    res.status(201).json({ created: created.length, pointsSummary: await checkTestPointsConsistency(String(p._id)) });
  })
);

/**
 * Sanity-check: run the problem's reference solution (admin-provided code)
 * against all tests via the judge. Implemented as a special admin judge job.
 */
problemsRouter.post(
  "/:id/tests/verify",
  requireAuth,
  requireRole("ADMIN", "MENTOR"),
  validate({
    body: z.object({
      referenceSolution: z.string().max(131072),
      language: z.enum(LANGUAGES).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const p = await getProblemOr404(req.params.id);
    const { referenceSolution, language } = req.body as {
      referenceSolution: string;
      language?: LanguageId;
    };
    const allowed = (Array.isArray(p.allowedLanguages) ? p.allowedLanguages : ["cpp17"]) as LanguageId[];
    const lang = language ?? allowed[0] ?? "cpp17";
    if (!allowed.includes(lang)) throw badRequest("Language not allowed for this problem.");
    const { verifyProblemSolution } = await import("../services/verifyService.js");
    const result = await verifyProblemSolution(String(p._id), lang, referenceSolution);
    res.json(result);
  })
);
