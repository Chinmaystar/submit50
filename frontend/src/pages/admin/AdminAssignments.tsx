import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assignmentApi, apiErrorMessage } from "../../services/api";
import type { Assignment } from "../../types";
import { LoadingPage, ErrorBanner, EmptyState, StateBadge, formatDateTime } from "../../components/ui";

export default function AdminAssignments() {
  const [data, setData] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    assignmentApi.adminList().then(setData).catch((e) => setError(apiErrorMessage(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const removeAssignment = async (a: Assignment) => {
    if (!window.confirm(
      `Delete assignment "${a.title}"? This permanently removes all of its problems, test cases, student submissions, and scores. This cannot be undone.`
    )) return;
    setDeletingId(a.id);
    setDeleteError(null);
    try {
      await assignmentApi.remove(a.id);
      load();
    } catch (e) {
      setDeleteError(apiErrorMessage(e));
    } finally {
      setDeletingId(null);
    }
  };

  if (error) return <div className="p-8"><ErrorBanner message={error} /></div>;
  if (!data) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assignments</h1>
        <button onClick={() => navigate("/admin/assignments/new")} className="btn-primary">+ New Assignment</button>
      </div>

      {deleteError && <ErrorBanner message={deleteError} />}

      {data.length === 0 ? (
        <EmptyState icon="📚" title="No assignments" hint="Create your first assignment to get started." />
      ) : (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Problems</th>
                <th className="px-4 py-3 text-right">Deadline</th>
                <th className="px-4 py-3 text-right">Leaderboard</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3">
                    <Link to={`/admin/assignments/${a.id}`} className="font-medium hover:text-brand-400">{a.title}</Link>
                  </td>
                  <td className="px-4 py-3"><StateBadge state={a.state} /></td>
                  <td className="px-4 py-3 text-right text-slate-400">{a.problemCount ?? 0}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">{formatDateTime(a.deadline)}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{a.leaderboardEnabled ? "On" : "Off"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/assignments/${a.id}`} className="text-sm text-brand-400 hover:text-brand-300">Edit →</Link>
                    <button
                      onClick={() => void removeAssignment(a)}
                      disabled={deletingId !== null}
                      className="ml-3 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === a.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}