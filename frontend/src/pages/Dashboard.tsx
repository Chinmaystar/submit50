import { usePolling, useCountdown } from "../hooks";
import { dashApi, apiErrorMessage } from "../services/api";
import type { Assignment, Submission } from "../types";
import { LoadingPage, ErrorBanner, StateBadge, ScorePill, StatusBadge, Badge, EmptyState, formatDateTime } from "../components/ui";
import { Link } from "react-router-dom";

function AssignmentCard({ a }: { a: Assignment }) {
  const countdown = useCountdown(a.deadline);
  return (
    <Link to={`/assignments/${a.id}`} className="card block hover:border-slate-700 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{a.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">{a.description}</p>
        </div>
        <StateBadge state={a.state} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {a.problemCount != null && <span>{a.problemCount} problems</span>}
        {a.totalPoints != null && a.totalPoints > 0 && (
          <>
            <ScorePill score={a.earnedPoints ?? 0} total={a.totalPoints} />
            {(a.earnedPoints ?? 0) >= a.totalPoints && <Badge tone="green">✓ Completed</Badge>}
          </>
        )}
        {a.deadline && (
          <span className={countdown.overdue ? "text-amber-500" : ""}>
            {countdown.overdue ? `Ended ${countdown.text}` : `Due in ${countdown.text}`}
          </span>
        )}
      </div>
    </Link>
  );
}

function SubmissionRow({ s }: { s: Submission }) {
  return (
    <Link
      to={`/submissions/${s.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-sm hover:border-slate-700 transition"
    >
      <div className="min-w-0 truncate text-slate-300">{s.problemTitle}</div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={s.status} />
        {s.totalScore > 0 && <ScorePill score={s.score} total={s.totalScore} />}
        <span className="text-xs text-slate-600">{formatDateTime(s.createdAt)}</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data, error } = usePolling(() => dashApi.get(), 30_000);

  if (error) return <div className="p-8"><ErrorBanner message={apiErrorMessage(new Error(error))} /></div>;
  if (!data) return <LoadingPage />;

  const section = (title: string, items: Assignment[], emptyMsg: string) => (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {items.length === 0 ? (
        <EmptyState icon="📋" title={emptyMsg} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <AssignmentCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {data.user.name.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">
          {data.totals.problemsSolved}/{data.totals.problemsAttempted} problems solved across {data.totals.assignments} assignments
        </p>
      </div>

      {section("Active", data.active, "No active assignments")}
      {section("Upcoming", data.upcoming, "No upcoming assignments")}
      {section("Past", data.past, "No past assignments")}

      {data.latestSubmissions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Submissions</h2>
          <div className="space-y-2">
            {data.latestSubmissions.map((s) => (
              <SubmissionRow key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
