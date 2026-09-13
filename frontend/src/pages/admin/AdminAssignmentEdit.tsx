import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { assignmentApi, problemApi, apiErrorMessage } from "../../services/api";
import type { Problem } from "../../types";
import { LoadingPage, ErrorBanner, EmptyState, Spinner, StateBadge, ScorePill } from "../../components/ui";
import { AssignmentForm, toInputValue } from "./AssignmentForm";

type FullProblem = Problem & { submissionCount: number };

export default function AdminAssignmentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{ assignment: Awaited<ReturnType<typeof assignmentApi.adminFull>>["assignment"]; problems: FullProblem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    assignmentApi.adminFull(id!).then((d) => setData(d)).catch((e) => setError(apiErrorMessage(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="p-8"><ErrorBanner message={error} /></div>;
  if (!data) return <LoadingPage />;

  const { assignment, problems } = data;
  const totalPoints = problems.reduce((s, p) => s + p.points, 0);

  const transition = (action: "publish" | "unpublish" | "close" | "archive") => async () => {
    setBusyState(action);
    setActionError(null);
    try {
      await assignmentApi[action](id!);
      load();
    } catch (e) {
      setActionError(apiErrorMessage(e));
    } finally {
      setBusyState(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{assignment.title}</h1>
          <StateBadge state={assignment.state} />
        </div>
        <button onClick={() => navigate("/admin/assignments")} className="text-sm text-slate-500 hover:text-slate-300">← Back</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {assignment.state === "DRAFT" || assignment.state === "PUBLISHED" ? (
          <button onClick={() => void transition("publish")()} disabled={busyState !== null} className="btn-primary">
            {busyState === "publish" ? <Spinner className="h-4 w-4" /> : null} Publish
          </button>
        ) : null}
        {assignment.state === "ACTIVE" ? (
          <button onClick={() => void transition("close")()} disabled={busyState !== null} className="btn-secondary">
            {busyState === "close" ? <Spinner className="h-4 w-4" /> : null} End Assignment
          </button>
        ) : null}
        {assignment.state === "PUBLISHED" ? (
          <button onClick={() => void transition("unpublish")()} disabled={busyState !== null} className="btn-secondary">
            {busyState === "unpublish" ? <Spinner className="h-4 w-4" /> : null} Unpublish
          </button>
        ) : null}
        {assignment.state !== "ARCHIVED" ? (
          <button onClick={() => void transition("archive")()} disabled={busyState !== null} className="btn-secondary">
            {busyState === "archive" ? <Spinner className="h-4 w-4" /> : null} Archive
          </button>
        ) : null}
        {assignment.leaderboardEnabled && (
          <Link to={`/admin/leaderboard?assignment=${assignment.id}`} className="btn-secondary">Leaderboard</Link>
        )}
        <button
          onClick={async () => {
            if (!window.confirm(
              `Delete assignment "${assignment.title}"? This permanently removes all of its problems, test cases, student submissions, and scores. This cannot be undone.`
            )) return;
            setDeleting(true);
            setActionError(null);
            try {
              await assignmentApi.remove(id!);
              navigate("/admin/assignments");
            } catch (e) {
              setActionError(apiErrorMessage(e));
              setDeleting(false);
            }
          }}
          disabled={deleting || busyState !== null}
          className="btn-danger"
        >
          {deleting ? <Spinner className="h-4 w-4" /> : null} Delete Assignment
        </button>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Edit Details</h2>
        <AssignmentForm
          initial={toInputValue(assignment)}
          submitLabel="Save Changes"
          onDone={async (values) => {
            await assignmentApi.update(id!, values);
            load();
          }}
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Problems <span className="ml-2 text-slate-600">{problems.length} · {totalPoints} pts</span>
          </h2>
          <button
            onClick={() => navigate(`/admin/problems/new?assignment=${assignment.id}`)}
            className="btn-primary !px-3 !py-1.5 text-xs"
          >
            + Add Problem
          </button>
        </div>
        {problems.length === 0 ? (
          <EmptyState icon="🧩" title="No problems yet" hint="Add your first problem, then its test cases." />
        ) : (
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3 text-right">Points</th>
                  <th className="px-4 py-3 text-right">Time</th>
                  <th className="px-4 py-3 text-right">Memory</th>
                  <th className="px-4 py-3 text-right">Submissions</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-xs text-slate-600">{p.order}</td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/problems/${p.id}`} className="font-medium hover:text-brand-400">{p.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-brand-400">{p.points}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{p.timeLimitMs / 1000}s</td>
                    <td className="px-4 py-3 text-right text-slate-500">{p.memoryLimitMb} MB</td>
                    <td className="px-4 py-3 text-right text-slate-500">{p.submissionCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/problems/${p.id}`} className="text-sm text-brand-400 hover:text-brand-300">Edit →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}