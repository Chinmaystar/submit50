export type Role = "STUDENT" | "MENTOR" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  role: Role;
  picture?: string;
}

export type SubmissionStatus =
  | "QUEUED"
  | "COMPILING"
  | "COMPILATION_ERROR"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "INTERNAL_ERROR";

export type TestStatus =
  | "PASSED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "SKIPPED";

export type AssignmentState = "DRAFT" | "PUBLISHED" | "ACTIVE" | "CLOSED" | "ARCHIVED";

export interface Assignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  startTime: string | null;
  deadline: string | null;
  state: AssignmentState;
  leaderboardEnabled: boolean;
  isPublished?: boolean;
  problemCount?: number;
  totalPoints?: number;
  earnedPoints?: number;
  attemptedProblems?: number;
  createdAt: string;
}

export interface Problem {
  id: string;
  assignmentId: string;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  points: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  language: string;
  starterCode: string;
  comparisonMode: "EXACT" | "TOKEN" | "FLOAT";
  order: number;
}

export interface SampleTest {
  id: string;
  input: string;
  expectedOutput: string;
  points: number;
  order: number;
}

export interface Submission {
  id: string;
  userId: string;
  userName?: string;
  problemId: string;
  problemTitle: string;
  problemPoints?: number;
  assignmentId: string;
  language: string;
  status: SubmissionStatus;
  score: number;
  totalScore: number;
  passedCount: number;
  totalCount: number;
  executionTimeMs: number;
  memoryUsedKb: number;
  compileOutput?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface TestResultView {
  index: number;
  isSample: boolean;
  status: TestStatus;
  points: number;
  earned: number;
  executionTimeMs: number;
  memoryUsedKb: number;
  actualOutput?: string;
  stderrExcerpt?: string;
}

export interface SubmissionDetail {
  submission: Omit<Submission, "problemTitle"> & { problemTitle?: string; code?: string };
  testResults: TestResultView[];
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  totalScore: number;
  solvedCount: number;
  problemCount: number;
}

export interface DashboardData {
  user: { id: string; name: string; rollNumber?: string; role: string };
  active: Assignment[];
  upcoming: Assignment[];
  past: Assignment[];
  latestSubmissions: Submission[];
  totals: { assignments: number; problemsSolved: number; problemsAttempted: number };
}

export interface AdminTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  points: number;
  isSample: boolean;
  order: number;
}

export interface AdminStudent {
  _id: string;
  name: string;
  email: string;
  rollNumber?: string;
  role: string;
  disabled: boolean;
  hasPassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Analytics {
  assignment: { id: string; title: string; state: AssignmentState; deadline?: string };
  registered: number;
  submitted: number;
  notSubmitted: number;
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  problemStats: {
    problemId: string;
    title: string;
    points: number;
    solved: number;
    attempted: number;
    avgScore: number;
    notAttempted: number;
  }[];
}

export interface RunTestResult {
  testId: string;
  index: number;
  status: TestStatus;
  actualOutput: string;
  stderrExcerpt: string;
  executionTimeMs: number;
  memoryUsedKb: number;
}

export interface RunResponse {
  compileError?: string;
  results?: RunTestResult[];
  totalExecutionTimeMs?: number;
  pending?: boolean;
  error?: string;
}
