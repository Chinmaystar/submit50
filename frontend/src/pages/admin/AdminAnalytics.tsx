import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi, assignmentApi, apiErrorMessage } from "../../services/api";
import type { Analytics } from "../../types";
import { LoadingPage, ErrorBanner, EmptyState, Spinner, ProgressBar, StateBadge, formatDateTime } from "../../components/ui";

export default function AdminAnalytics() {
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof assignmentApi.adminList>>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assignmentApi.adminList().then((list) => {
      setAssignments(list);
      if (list.length > 0) setSelectedId(list[0].id);
    }).catch(() => undefined);
  }, []);

  const load = useCallback((id: string) => {
    setLoading(true);
    setAnalytics(null);
    adminApi.analytics(id).then(setAnalytics).catch((e) => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId) load(selectedId);
  }, [selectedId, load]);

  const maxAttempted = useMemo(() => {
    if (!analytics) return 0;
    return Math.max(1, ...analytics.problemStats.map((p) => p.attempted));
  }, [analytics]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select className="input !w-auto" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="" disabled>Select an assignment</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      {!selectedId && <EmptyState icon="📊" title="No assignments yet" />}
      {loading || (selectedId && !analytics) ? <LoadingPage /> : analytics && (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{analytics.assignment.title}</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <StateBadge state={analytics.assignment.state} />
                {analytics.assignment.deadline && <span>Deadline {formatDateTime(analytics.assignment.deadline)}</span>}
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-xl font-bold">{analytics.submitted}/{analytics.registered}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Submitted</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-500">{analytics.notSubmitted}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Not Submitted</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Average Score", value: analytics.averageScore.toFixed(1), tone: "text-brand-400" },
              { label: "Median Score", value: analytics.medianScore.toFixed(1), tone: "text-brand-400" },
              { label: "Highest Score", value: analytics.highestScore.toFixed(1), tone: "text-emerald-400" },
              { label: "Lowest Score", value: analytics.lowestScore.toFixed(1), tone: "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="card !p-4 text-center">
                <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Problem Performance</h2>
            <div className="card space-y-4">
              {analytics.problemStats.length === 0 && <div className="text-sm text-slate-500">No problems on this assignment.</div>}
              {analytics.problemStats.map((p) => (
                <div key={p.problemId}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <span className="font-medium">{p.title}</span>
                      <span className="ml-2 text-xs text-slate-500">{p.avgScore.toFixed(1)} avg / {p.points} pts</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.solved} solved · {p.attempted} attempted · {p.notAttempted} not attempted
                    </div>
                  </div>
                  <ProgressBar value={(p.attempted / maxAttempted) * 100} />
                  <div className="mt-1 text-xs text-slate-500">
                    {analytics.registered > 0 ? `${((p.solved / analytics.registered) * 100).toFixed(0)}% of registered solved` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}