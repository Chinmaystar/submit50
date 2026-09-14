/**
 * Idempotent, read-of-small-collection migration for the Problem model.
 *
 * Converts legacy docs that predate multi-language support:
 *   1. `allowedLanguages` absent  → copy the old scalar `language`
 *      (fallback `["cpp17"]`), sanitized to known languages.
 *   2. scalar-string `starterCode` → wrap into `{ cpp17 }` (as used when the
 *      problem was created as C++17-only).
 *
 * Runs at API startup (and seed time) before anything can be served, so old
 * docs never surface with undefined `allowedLanguages`. Existing submissions
 * keep their singular `language` untouched.
 */
import { Problem } from "../models/Problem.js";
import { LANGUAGES } from "../types.js";
import { logger } from "../utils/logger.js";

const KNOWN = new Set<string>(LANGUAGES);

export async function backfillProblemLanguages(): Promise<void> {
  const coll = Problem.collection;

  const missing = await coll
    .find({ allowedLanguages: { $exists: false } })
    .project({ _id: 1, language: 1 })
    .toArray();
  for (const doc of missing) {
    const raw = doc.language;
    let langs: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : ["cpp17"];
    langs = langs.filter((l) => KNOWN.has(l));
    if (langs.length === 0) langs = ["cpp17"];
    await coll.updateOne({ _id: doc._id }, { $set: { allowedLanguages: [...new Set(langs)] } });
  }

  const scalarStarters = await coll
    .find({ starterCode: { $type: "string" } })
    .project({ _id: 1, starterCode: 1 })
    .toArray();
  for (const doc of scalarStarters) {
    await coll.updateOne({ _id: doc._id }, { $set: { starterCode: { cpp17: doc.starterCode ?? "" } } });
  }

  logger.info("Migration backfillProblemLanguages complete", {
    problemsWithMissingAllowedLanguages: missing.length,
    scalarStartersWrapped: scalarStarters.length,
  });
}