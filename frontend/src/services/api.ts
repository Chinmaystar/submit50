import axios from "axios";
import type {
  AdminStudent,
  AdminTestCase,
  Analytics,
  Assignment,
  DashboardData,
  LanguageId,
  LeaderboardRow,
  Problem,
  RunResponse,
  SampleTest,
  Submission,
  SubmissionDetail,
  User,
} from "../types";

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? "/api",
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  // CSRF hardening: mutations must be script-initiated JSON, not form posts
  cfg.headers["X-Requested-With"] = "fetch";
  return cfg;
});

export interface ApiErrorShape {
  error: string;
  code?: string;
  details?: { path: string; message: string }[];
}

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorShape | string | undefined;
    if (typeof data === "string") return data;
    if (data?.error) {
      if (data.details?.length) {
        return `${data.error} ${data.details.map((d) => `${d.path}: ${d.message}`).join("; ")}`;
      }
      return data.error;
    }
    return err.message;
  }
  return String(err);
}

/* ------------------------------- auth ------------------------------- */

export const authApi = {
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  login: (email: string, password: string) => api.post("/auth/login", { email, password }).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
};

/* ----------------------------- dashboard ---------------------------- */

export const dashApi = {
  get: () => api.get<DashboardData>("/dashboard").then((r) => r.data),
};

/* ---------------------------- assignments --------------------------- */

export const assignmentApi = {
  list: () => api.get<{ assignments: Assignment[] }>("/assignments").then((r) => r.data.assignments),
  get: (id: string) =>
    api.get<{ assignment: Assignment; problems: Problem[]; state: string }>(`/assignments/${id}`).then((r) => r.data),
  leaderboard: (id: string) =>
    api.get<{ leaderboard: LeaderboardRow[] }>(`/assignments/${id}/leaderboard`).then((r) => r.data.leaderboard),

  // admin
  adminList: () => api.get<{ assignments: Assignment[] }>("/assignments/admin/all").then((r) => r.data.assignments),
  adminFull: (id: string) =>
    api
      .get<{ assignment: Assignment; problems: (Problem & { submissionCount: number })[] }>(`/assignments/${id}/full`)
      .then((r) => r.data),
  create: (data: Partial<Assignment>) => api.post<{ assignment: Assignment }>("/assignments", data).then((r) => r.data.assignment),
  update: (id: string, data: Partial<Assignment>) =>
    api.patch<{ assignment: Assignment }>(`/assignments/${id}`, data).then((r) => r.data.assignment),
  publish: (id: string) => api.post(`/assignments/${id}/publish`).then((r) => r.data),
  unpublish: (id: string) => api.post(`/assignments/${id}/unpublish`).then((r) => r.data),
  close: (id: string) => api.post(`/assignments/${id}/close`).then((r) => r.data),
  archive: (id: string) => api.post(`/assignments/${id}/archive`).then((r) => r.data),
  remove: (id: string) => api.delete(`/assignments/${id}`).then((r) => r.data),
};

/* ------------------------------ problems ---------------------------- */

export const problemApi = {
  get: (id: string) => api.get<{ problem: Problem; samples: SampleTest[] }>(`/problems/${id}`).then((r) => r.data),

  create: (data: Partial<Problem> & { assignmentId: string }) =>
    api.post<{ problem: Problem }>("/problems", data).then((r) => r.data.problem),
  update: (id: string, data: Partial<Problem>) =>
    api.patch<{ problem: Problem }>(`/problems/${id}`, data).then((r) => r.data.problem),
  remove: (id: string) => api.delete(`/problems/${id}`).then((r) => r.data),

  // tests (admin)
  tests: (id: string) =>
    api
      .get<{ tests: AdminTestCase[]; pointsSummary: { sum: number; expected: number } }>(`/problems/${id}/tests`)
      .then((r) => r.data),
  addTest: (id: string, data: Omit<AdminTestCase, "id" | "order">) =>
    api.post(`/problems/${id}/tests`, data).then((r) => r.data),
  bulkTests: (id: string, tests: { input: string; expectedOutput: string; points?: number; isSample?: boolean }[], distribute = true) =>
    api.post(`/problems/${id}/tests/bulk`, { tests, distribute }).then((r) => r.data),
  updateTest: (problemId: string, testId: string, data: Partial<AdminTestCase>) =>
    api.patch(`/problems/${problemId}/tests/${testId}`, data).then((r) => r.data),
  deleteTest: (problemId: string, testId: string) =>
    api.delete(`/problems/${problemId}/tests/${testId}`).then((r) => r.data),
  verify: (id: string, referenceSolution: string, language?: LanguageId) =>
    api
      .post<{
        totalTests: number;
        passed: number;
        failed: { index: number; isSample: boolean; status: string; input: string; expectedOutput: string; actualOutput: string }[];
        compileError?: string;
      }>(`/problems/${id}/tests/verify`, { referenceSolution, language })
      .then((r) => r.data),
};

/* ---------------------------- submissions --------------------------- */

export const submissionApi = {
  submit: (problemId: string, code: string, language: LanguageId) =>
    api.post<{ submissionId: string; status: string }>(`/problems/${problemId}/submit`, { code, language }).then((r) => r.data),
  run: (problemId: string, code: string, language: LanguageId) =>
    api.post<RunResponse>(`/problems/${problemId}/run`, { code, language }).then((r) => r.data),
  list: (params: { problemId?: string; assignmentId?: string; userId?: string; status?: string; page?: number }) =>
    api
      .get<{ submissions: Submission[]; page: number; total: number; pages: number }>("/submissions", { params })
      .then((r) => r.data),
  get: (id: string) => api.get<SubmissionDetail>(`/submissions/${id}`).then((r) => r.data),
  rejudge: (id: string) => api.post(`/submissions/${id}/rejudge`).then((r) => r.data),
};

/* ------------------------------- admin ------------------------------ */

export const adminApi = {
  students: (params: { search?: string; role?: string; disabled?: string; page?: number }) =>
    api.get<{ students: AdminStudent[]; page: number; total: number; pages: number }>("/admin/students", { params }).then((r) => r.data),
  addStudent: (data: { name: string; email: string; rollNumber?: string; role?: string; password?: string }) =>
    api.post("/admin/students", data).then((r) => r.data),
  updateStudent: (
    id: string,
    data: { role?: string; disabled?: boolean; name?: string; rollNumber?: string; password?: string }
  ) => api.patch(`/admin/students/${id}`, data).then((r) => r.data),
  removeStudent: (id: string) => api.delete(`/admin/students/${id}`).then((r) => r.data),
  importCsv: (csv: string) => api.post<{ created: number; updated: number; errors: string[] }>("/admin/students/import", csv, {
    headers: { "Content-Type": "text/csv" },
  }).then((r) => r.data),
  analytics: (assignmentId: string) => api.get<Analytics>(`/admin/assignments/${assignmentId}/analytics`).then((r) => r.data),
  submissions: (params: { status?: string; assignmentId?: string; page?: number }) =>
    api
      .get<
        {
          submissions: {
            id: string;
            studentName: string;
            rollNumber: string;
            problemTitle: string;
            status: string;
            score: number;
            totalScore: number;
            language: string;
            executionTimeMs: number;
            createdAt: string;
          }[];
          page: number;
          total: number;
          pages: number;
        }
      >("/admin/submissions", { params })
      .then((r) => r.data),
};
