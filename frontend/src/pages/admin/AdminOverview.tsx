import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, assignmentApi, apiErrorMessage } from "../../services/api";
import type { AdminStudent } from "../../types";
import { LoadingPage, ErrorBanner, EmptyState, Spinner, StateBadge, formatDateTime } from "../../components/ui";

interface FeedItem {
  id: string;
  studentName: string;
  rollNumber: string;
  problemTitle: string;
  status: string;
  score: number;
  totalScore: number;
  createdAt: string;
}

export default function AdminOverview() {
  const [students, setStudents] = useState<AdminStudent[] | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof assignmentApi.adminList>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.students({ page: 1 }).then((r) => r.students),
      adminApi.submissions({ page: 1 }).then((r) => r.submissions),
      assignmentApi.adminList(),
    ])
      .then(([s, f, a]) => {
        setStudents(s);
        setFeed(f as FeedItem[]);
        setAssignments(a);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  if (error) return <div className="p-8"><ErrorBanner message={error} /></div>;
  if (!students || !feed || !assignments) return <LoadingPage />;

  const activeStudents = students.filter((s) => !s.disabled).length;
  const byState: Record<string, number> = {};
  for (const a of assignments) byState[a.state] = (byState[a.state] ?? 0) + 1;

  const stats = [
    { label: "Registered Students", value: students.length, icon: "👥" },
    { label: "Active Students", value: activeStudents, icon: "✅" },
    { label: "Assignments (published)", value: byState["PUBLISHED"] ?? 0, icon: "📚" },
    { label: "Active Right Now", value: byState["ACTIVE"] ?? 0, icon: "⚡" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      <h1 className="text-2xl font-bold">Admin Overview</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Submissions</h2>
            <Link to="/admin/submissions" className="text-xs text-brand-400 hover:underline">View all →</Link>
          </div>
          {feed.length === 0 ? (
            <EmptyState icon="📄" title="No submissions yet" />
          ) : (
            <div className="card !p-0 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {feed.slice(0, 8).map((s) => (
                    <tr key={s.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{s.studentName}</div>
                        <div className="text-xs text-slate-500">{s.rollNumber || s.problemTitle}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{s.problemTitle}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">{formatDateTime(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Assignments</h2>
            <Link to="/admin/assignments/new" className="btn-primary !px-3 !py-1.5 text-xs">+ New</Link>
          </div>
          <div className="space-y-2">
            {assignments.length === 0 && <EmptyState icon="📚" title="No assignments yet" />}
            {assignments.map((a) => (
              <Link
                key={a.id}
                to={`/admin/assignments/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-sm hover:border-slate-700 transition"
              >
                <span className="truncate">{a.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {a.problemCount != null && <span className="text-xs text-slate-500">{a.problemCount} problems</span>}
                  <StateBadge state={a.state} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}