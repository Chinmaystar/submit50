/** Submission / test-case verdicts shared by API, judge and frontend. */
export const SUBMISSION_STATUSES = [
  "QUEUED",
  "COMPILING",
  "COMPILATION_ERROR",
  "RUNNING",
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "INTERNAL_ERROR",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Per-test-case verdicts (subset + passed). */
export const TEST_STATUSES = [
  "PASSED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "SKIPPED",
] as const;

export type TestStatus = (typeof TEST_STATUSES)[number];

export const COMPARISON_MODES = ["EXACT", "TOKEN", "FLOAT"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export const ROLES = ["STUDENT", "MENTOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const LANGUAGES = ["c17", "cpp17", "java17"] as const;
export type LanguageId = (typeof LANGUAGES)[number];

/** Job payload the API puts on the BullMQ judge queue. */
export interface JudgeJobData {
  submissionId: string;
  problemId: string;
  assignmentId: string;
  userId: string;
  language: LanguageId;
  code: string;
  /** Hidden tests are streamed to the judge via Redis-cached payloads, never via the public API. */
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb: number;
  comparisonMode: ComparisonMode;
  floatTolerance: number;
  /** Only present for /run sample executions — not scored, not persisted. */
  isSampleRun?: boolean;
}

export const JUDGE_QUEUE_NAME = "judge-submissions";
export const RUN_QUEUE_NAME = "judge-runs";
