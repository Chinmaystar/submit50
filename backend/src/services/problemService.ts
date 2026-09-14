import { Problem, type ProblemDoc } from "../models/Problem.js";
import { TestCase } from "../models/TestCase.js";
import { Submission, TestResult, AssignmentScore } from "../models/index.js";
import type { Document, Types } from "mongoose";
import { notFound } from "../utils/errors.js";

/**
 * PUBLIC problem shape. Hidden test data is intentionally absent — students
 * can only ever see sample tests, and only through dedicated endpoints.
 *
 * `allowedLanguages` is always present (post-migration); legacy-safety
 * fallbacks keep old docs readable even before the backfill has touched them.
 * Reference solutions are admin tooling and are only added with `includeAdmin`.
 */
export function toPublicProblem(p: ProblemDoc | Document, opts: { includeAdmin?: boolean } = {}) {
  const doc = p as ProblemDoc;
  const allowed =
    Array.isArray(doc.allowedLanguages) && doc.allowedLanguages.length > 0
      ? [...doc.allowedLanguages]
      : ["cpp17"];

  const starters = (doc.starterCode && typeof doc.starterCode === "object" ? doc.starterCode : {}) as Record<string, string>;
  const codes: Record<string, string> = {};
  for (const lang of allowed) {
    codes[lang] = typeof starters[lang] === "string" ? starters[lang] : "";
  }

  const out: Record<string, unknown> = {
    id: String(doc._id),
    assignmentId: String(doc.assignmentId),
    title: doc.title,
    statement: doc.statement,
    inputFormat: doc.inputFormat ?? "",
    outputFormat: doc.outputFormat ?? "",
    constraints: doc.constraints ?? "",
    sampleInput: doc.sampleInput ?? "",
    sampleOutput: doc.sampleOutput ?? "",
    points: doc.points,
    timeLimitMs: doc.timeLimitMs,
    memoryLimitMb: doc.memoryLimitMb,
    allowedLanguages: allowed,
    starterCode: codes,
    comparisonMode: doc.comparisonMode,
    order: doc.order,
  };

  if (opts.includeAdmin) {
    const refs = (doc.referenceSolutions && typeof doc.referenceSolutions === "object" ? doc.referenceSolutions : {}) as Record<string, string>;
    const refOut: Record<string, string> = {};
    for (const lang of allowed) {
      refOut[lang] = typeof refs[lang] === "string" ? refs[lang] : "";
    }
    out.referenceSolutions = refOut;
  }

  return out;
}

export async function getProblemOr404(id: string): Promise<ProblemDoc> {
  const p = await Problem.findById(id);
  if (!p) throw notFound("Problem not found.");
  return p;
}

export async function getSampleTests(problemId: string | Types.ObjectId) {
  return TestCase.find({ problemId, isSample: true }).sort({ order: 1 }).lean();
}

/**
 * Delete a problem plus its test cases, the students' submissions with their
 * test results, and the score rollups for the problem.
 */
export async function deleteProblem(id: string): Promise<void> {
  const p = await getProblemOr404(id);

  const submissionIds = await Submission.find({ problemId: p._id }).distinct("_id");

  await Promise.all([
    TestCase.deleteMany({ problemId: p._id }),
    TestResult.deleteMany({ submissionId: { $in: submissionIds } }),
    Submission.deleteMany({ problemId: p._id }),
    AssignmentScore.deleteMany({ problemId: p._id }),
  ]);

  await p.deleteOne();
}
