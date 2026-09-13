import { Link } from "react-router-dom";
import { usePolling, useCountdown } from "../hooks";
import { assignmentApi, apiErrorMessage } from "../services/api";
import { LoadingPage, ErrorBanner, StateBadge, ScorePill, Badge, EmptyState } from "../components/ui";

function AssignmentCard({ a }: { a: import("../types").Assignment }) {
  const countdown = useCountdown(a.deadline);
  return (
    <Link to={`/assignments/${a.id}`} className="card block hover:border-slate-700 transition">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{a.title}</h3>
        <StateBadge state={a.state} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-slate-400">{a.description}</p>
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

export default function Assignments() {
  const { data, error } = usePolling(() => assignmentApi.list(), 30_000);

  if (error) return <div className="p-8"><ErrorBanner message={apiErrorMessage(new Error(error))} /></div>;
  if (!data) return <LoadingPage />;

  const active = data.filter((a) => a.state === "ACTIVE" || a.state === "PUBLISHED");
  const upcoming = data.filter((a) => a.state === "DRAFT");
  const past = data.filter((a) => a.state === "CLOSED" || a.state === "ARCHIVED");

  const section = (title: string, items: typeof data, emptyMsg: string) => (
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
      <h1 className="text-2xl font-bold">Assignments</h1>
      {section("Active", active, "No active assignments")}
      {section("Upcoming", upcoming, "No upcoming assignments")}
      {section("Past", past, "No past assignments")}
    </div>
  );
}
