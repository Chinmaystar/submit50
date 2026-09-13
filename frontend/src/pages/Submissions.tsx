import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { submissionApi, assignmentApi, apiErrorMessage } from "../services/api";
import type { Submission } from "../types";
import { LoadingPage, ErrorBanner, StatusBadge, ScorePill, EmptyState, Spinner, formatDateTime, formatMs } from "../components/ui";

const PAGE_SIZE = 20;

export default function Submissions() {
  const [params, setParams] = useSearchParams();
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([]);
  const [data, setData] = useState<{ submissions: Submission[]; page: number; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const problemId = params.get("problem") ?? undefined;
  const assignmentId = params.get("assignment") ?? undefined;
  const status = params.get("status") ?? undefined;
  const page = Number(params.get("page") ?? "1");

  useEffect(() => {
    assignmentApi.list().then((list) => setAssignments(list.map((a) => ({ id: a.id, title: a.title })))).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    submissionApi
      .list({ problemId, assignmentId, status, page })
      .then(setData)
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [problemId, assignmentId, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };

  const rows = data?.submissions ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Submissions</h1>
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto" value={assignmentId ?? ""} onChange={(e) => setParam("assignment", e.target.value)}>
            <option value="">All assignments</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <select className="input !w-auto" value={status ?? ""} onChange={(e) => setParam("status", e.target.value)}>
            <option value="">All statuses</option>
            {["ACCEPTED", "WRONG_ANSWER", "COMPILATION_ERROR", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED", "OUTPUT_LIMIT_EXCEEDED", "RUNTIME_ERROR"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && !data ? (
        <LoadingPage />
      ) : rows.length === 0 ? (
        <EmptyState icon="📄" title="No submissions yet" hint="Solve a problem and hit Submit to see your history here." />
      ) : (
        <>
          <div className="card overflow-hidden !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Runtime</th>
                  <th className="px-4 py-3 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <Link to={`/submissions/${s.id}`} className="hover:text-brand-400">{s.problemTitle}</Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-right">{s.totalScore > 0 ? <ScorePill score={s.score} total={s.totalScore} /> : "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatMs(s.executionTimeMs)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{formatDateTime(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("page", String(page - 1));
                  setParams(next);
                }}
              >
                ← Prev
              </button>
              <span className="text-slate-500">Page {page} of {data.pages}</span>
              <button
                className="btn-secondary"
                disabled={page >= data.pages}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("page", String(page + 1));
                  setParams(next);
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}