import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { assignmentApi, apiErrorMessage } from "../services/api";
import type { LeaderboardRow, Assignment } from "../types";
import { LoadingPage, ErrorBanner, EmptyState, formatMs } from "../components/ui";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ assignmentId }: { assignmentId?: string }) {
  const { id } = useParams<{ id: string }>();
  const [selectedId, setSelectedId] = useState<string>(assignmentId ?? id ?? "");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeId = assignmentId ?? id ?? selectedId;

  useEffect(() => {
    setSelectedId(id ?? "");
  }, [id]);

  useEffect(() => {
    assignmentApi.list().then((list) => setAssignments(list)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setRows([]);
      return;
    }
    setRows(null);
    assignmentApi
      .leaderboard(activeId)
      .then(setRows)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [activeId]);

  const best = useMemo(() => rows?.[0]?.score ?? 0, [rows]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        {!id && (
          <select className="input !w-auto" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="" disabled>Select an assignment</option>
            {assignments
              .filter((a) => a.leaderboardEnabled)
              .map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
          </select>
        )}
      </div>

      {error && <ErrorBanner message={error} />}
      {!activeId ? (
        <EmptyState icon="🏆" title="Pick an assignment" hint="Choose an assignment above to view its leaderboard." />
      ) : !rows ? (
        <LoadingPage />
      ) : rows.length === 0 ? (
        <EmptyState icon="🏆" title="No submissions yet" hint="Scores will appear once students start submitting." />
      ) : (
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3 text-right">Solved</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Avg. time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3 font-semibold">
                    {r.rank <= 3 ? <span className="text-lg">{MEDALS[r.rank - 1]}</span> : <span className="text-slate-400">#{r.rank}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{r.name}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{r.solvedCount}/{r.problemCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-semibold text-brand-400">{r.score}</span>
                    <span className="text-slate-500">/{r.totalScore}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-right text-slate-500 sm:table-cell">
                    {best > 0 && r.score > 0 ? <span className="font-mono">{((r.score / Math.max(best, 1)) * 100).toFixed(0)}%</span> : "—"}
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