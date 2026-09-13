import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { submissionApi, apiErrorMessage } from "../services/api";
import type { SubmissionDetail as Detail } from "../types";
import { LoadingPage, ErrorBanner, StatusBadge, ScorePill, formatMs, formatKb, formatDateTime } from "../components/ui";

const TERMINAL = new Set([
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
  "INTERNAL_ERROR",
]);

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    submissionApi
      .get(id!)
      .then((d) => {
        setDetail(d);
        if (!TERMINAL.has(d.submission.status)) {
          setTimeout(load, 2500);
        }
      })
      .catch((e) => {
        setError(apiErrorMessage(e));
        // transient failures: keep polling while judging
        if (detail && !TERMINAL.has(detail.submission.status)) setTimeout(load, 4000);
      });
  }, [id, detail]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="p-8"><ErrorBanner message={error} /></div>;
  if (!detail) return <LoadingPage />;

  const { submission: s, testResults } = detail;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <Link
        to={`/problems/${s.problemId}`}
        className="inline-flex text-sm text-slate-500 hover:text-slate-300"
      >
        ← Back to code
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Submission #{s.id.slice(0, 8)}</h1>
          <StatusBadge status={s.status} />
        </div>
        <div className="mt-1 text-sm text-slate-500">
          <Link to={`/problems/${s.problemId}`} className="hover:text-brand-400">{s.problemTitle}</Link>
          {" · "}
          {formatDateTime(s.createdAt)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Score", value: s.totalScore > 0 ? <ScorePill score={s.score} total={s.totalScore} /> : "—" },
          { label: "Tests passed", value: `${s.passedCount}/${s.totalCount}` },
          { label: "Runtime", value: formatMs(s.executionTimeMs) },
          { label: "Memory", value: formatKb(s.memoryUsedKb) },
        ].map((item) => (
          <div key={item.label} className="card !p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
            <div className="mt-1 text-base font-semibold">{item.value}</div>
          </div>
        ))}
      </div>

      {s.compileOutput && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Compiler Output</h2>
          <pre className="overflow-x-auto rounded-lg border border-red-900/40 bg-black/40 px-4 py-3 text-xs text-red-300 whitespace-pre-wrap">
            {s.compileOutput}
          </pre>
        </div>
      )}

      {s.errorMessage && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Error</h2>
          <pre className="overflow-x-auto rounded-lg border border-red-900/40 bg-black/40 px-4 py-3 text-xs text-red-300 whitespace-pre-wrap">
            {s.errorMessage}
          </pre>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Test Results</h2>
        <div className="space-y-2">
          {testResults.map((t) => (
            <div key={t.index} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Test {t.index}</span>
                  {t.isSample && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">sample</span>}
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>+{t.earned}/{t.points}</span>
                  {t.executionTimeMs > 0 && <span>{formatMs(t.executionTimeMs)}</span>}
                  {t.memoryUsedKb > 0 && <span>{formatKb(t.memoryUsedKb)}</span>}
                </div>
              </div>
              {t.isSample && t.actualOutput !== undefined && (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap">
                  {t.actualOutput === "" ? "(no output)" : t.actualOutput}
                </pre>
              )}
              {t.stderrExcerpt && (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">
                  {t.stderrExcerpt}
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {s.code && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Your Code</h2>
          <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-black/40 p-4 text-xs leading-relaxed text-slate-200">
            <code>{s.code}</code>
          </pre>
        </>
      )}
    </div>
  );
}