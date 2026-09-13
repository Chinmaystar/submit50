import { useParams, Link } from "react-router-dom";
import { usePolling, useCountdown } from "../hooks";
import { assignmentApi, apiErrorMessage } from "../services/api";
import type { Problem } from "../types";
import { LoadingPage, ErrorBanner, StateBadge, ScorePill, ProgressBar } from "../components/ui";

function ProblemRow({ p, assignmentId }: { p: Problem & { earnedPoints?: number }; assignmentId: string }) {
  return (
    <Link
      to={`/problems/${p.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-4 hover:border-slate-700 transition"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">#{p.order}</span>
          <span className="font-medium">{p.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
          <span>{p.points} pts</span>
          <span>{p.timeLimitMs / 1000}s</span>
          <span>{p.memoryLimitMb} MB</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {p.earnedPoints != null && <ScorePill score={p.earnedPoints} total={p.points} />}
      </div>
    </Link>
  );
}

export default function AssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePolling(
    () => assignmentApi.get(id!),
    15_000,
    !!id
  );
  const countdown = useCountdown(data?.assignment?.deadline ?? null);

  if (error) return <div className="p-8"><ErrorBanner message={apiErrorMessage(new Error(error))} /></div>;
  if (!data) return <LoadingPage />;

  const { assignment, problems } = data;

  const totalPoints = problems.reduce((s, p) => s + p.points, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{assignment.title}</h1>
          <StateBadge state={assignment.state} />
        </div>
        {assignment.description && (
          <p className="mt-2 text-sm text-slate-400 whitespace-pre-wrap">{assignment.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-400">
        {assignment.deadline && (
          <div>
            <span className="text-slate-600">Deadline: </span>
            <span className={countdown.overdue ? "text-amber-500 font-medium" : ""}>
              {countdown.overdue ? `Ended ${countdown.text}` : `Due in ${countdown.text}`}
            </span>
          </div>
        )}
        <div>
          <span className="text-slate-600">Total: </span>
          <span>{totalPoints} points · {problems.length} problems</span>
        </div>
      </div>

      {assignment.instructions && (
        <div className="card prose-invert max-w-none text-sm text-slate-300">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Instructions</h3>
          <div className="whitespace-pre-wrap">{assignment.instructions}</div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Problems</h2>
        <div className="space-y-2">
          {problems.map((p) => (
            <ProblemRow key={p.id} p={p} assignmentId={assignment.id} />
          ))}
        </div>
      </section>

      {assignment.leaderboardEnabled && (
        <Link to={`/assignments/${assignment.id}/leaderboard`} className="btn-secondary inline-flex">
          View Leaderboard
        </Link>
      )}
    </div>
  );
}
