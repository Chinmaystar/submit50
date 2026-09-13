import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, assignmentApi, submissionApi, apiErrorMessage } from "../../services/api";
import { LoadingPage, ErrorBanner, EmptyState, Spinner, StatusBadge, ScorePill, formatMs, formatDateTime } from "../../components/ui";

interface Row {
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
}

export default function AdminSubmissions() {
  const [status, setStatus] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [rejudging, setRejudging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assignmentApi.adminList().then((list) => setAssignments(list.map((a) => ({ id: a.id, title: a.title })))).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setRows(null);
    adminApi
      .submissions({ status: status || undefined, assignmentId: assignmentId || undefined, page })
      .then((r) => {
        setRows(r.submissions);
        setPage(r.page);
        setPages(r.pages);
        setTotal(r.total);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [status, assignmentId, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Submissions</h1>
          <p className="text-xs text-slate-500">{total} total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto" value={assignmentId} onChange={(e) => { setAssignmentId(e.target.value); setPage(1); }}>
            <option value="">All assignments</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {["QUEUED", "COMPILING", "RUNNING", "ACCEPTED", "WRONG_ANSWER", "COMPILATION_ERROR", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED", "OUTPUT_LIMIT_EXCEEDED", "RUNTIME_ERROR", "INTERNAL_ERROR"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!rows ? (
        <LoadingPage />
      ) : rows.length === 0 ? (
        <EmptyState icon="📄" title="No submissions" hint="Adjust the filters or wait for students to submit." />
      ) : (
        <>
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Runtime</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Submitted</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{s.studentName}</div>
                      <div className="text-xs text-slate-500">{s.rollNumber || s.language}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{s.problemTitle}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2.5 text-right">{s.totalScore > 0 ? <ScorePill score={s.score} total={s.totalScore} /> : "—"}</td>
                    <td className="hidden px-4 py-2.5 text-right text-slate-500 md:table-cell">{formatMs(s.executionTimeMs)}</td>
                    <td className="hidden px-4 py-2.5 text-right text-xs text-slate-500 md:table-cell">{formatDateTime(s.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/submissions/${s.id}`} className="text-xs text-brand-400 hover:text-brand-300">View</Link>
                        <button
                          onClick={async () => {
                            setRejudging(s.id);
                            try {
                              await submissionApi.rejudge(s.id);
                              load();
                            } catch (e) {
                              alert(apiErrorMessage(e));
                            } finally {
                              setRejudging(null);
                            }
                          }}
                          disabled={rejudging !== null}
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          {rejudging === s.id ? "Rejudging…" : "Rejudge"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="text-slate-500">Page {page} of {pages}</span>
              <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}