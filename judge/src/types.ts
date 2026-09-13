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

export type ComparisonMode = "EXACT" | "TOKEN" | "FLOAT";

export interface JudgeJobData {
  submissionId: string;
  problemId: string;
  assignmentId: string;
  userId: string;
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb: number;
  comparisonMode: ComparisonMode;
  floatTolerance: number;
  isSampleRun?: boolean;
}

export interface JudgeRunJobData {
  userId: string;
  problemId: string;
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb: number;
  comparisonMode: string;
  floatTolerance: number;
  tests: { id: string; input: string; expectedOutput: string }[];
}

export const JUDGE_QUEUE_NAME = "judge-submissions";
export const RUN_QUEUE_NAME = "judge-runs";
