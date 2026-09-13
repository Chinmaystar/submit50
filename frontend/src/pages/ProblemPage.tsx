import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { problemApi, submissionApi, apiErrorMessage } from "../services/api";
import type { Problem, RunResponse, SampleTest } from "../types";
import CodeEditor, { getDraft } from "../components/CodeEditor";
import { LoadingPage, ErrorBanner, Spinner, StatusBadge, formatMs, formatKb } from "../components/ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function StatementSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{title}</h3>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

function SampleBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-400">{label}</div>
      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-xs leading-relaxed text-slate-200">
        {text || "—"}
      </pre>
    </div>
  );
}

function RunResultView({ resp }: { resp: RunResponse }) {
  if (resp.pending) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner className="h-4 w-4" /> Judge is busy — waiting on the run queue…
      </div>
    );
  }
  if (resp.error) {
    return <ErrorBanner message={resp.error} />;
  }
  if (resp.compileError) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Compilation Error
        </div>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">
          {resp.compileError}
        </pre>
      </div>
    );
  }
  if (!resp.results) {
    return <div className="text-sm text-slate-500">Run returned no results.</div>;
  }
  return (
    <div className="space-y-3">
      {resp.totalExecutionTimeMs != null && (
        <div className="text-xs text-slate-500">Total time: {formatMs(resp.totalExecutionTimeMs)}</div>
      )}
      {resp.results.map((r) => (
        <div key={r.testId} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Test {r.index}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {r.executionTimeMs > 0 && <span>{formatMs(r.executionTimeMs)}</span>}
              {r.memoryUsedKb > 0 && <span>{formatKb(r.memoryUsedKb)}</span>}
            </div>
          </div>
          {r.actualOutput !== undefined && (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap">
              {r.actualOutput === "" ? "(no output)" : r.actualOutput}
            </pre>
          )}
          {r.stderrExcerpt && (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">
              {r.stderrExcerpt}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProblemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [samples, setSamples] = useState<SampleTest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResponse, setRunResponse] = useState<RunResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const codeReady = useRef(false);

  useEffect(() => {
    setRunResponse(null);
    setActionError(null);
    codeReady.current = false;
    problemApi
      .get(id!)
      .then(({ problem: p, samples: s }) => {
        setProblem(p);
        setSamples(s);
        setCode(getDraft(id!) ?? (p.starterCode || ""));
        codeReady.current = true;
      })
      .catch((e) => setLoadError(apiErrorMessage(e)));
  }, [id]);

  const run = useCallback(async () => {
    if (!id || running) return;
    setRunning(true);
    setActionError(null);
    setRunResponse(null);
    try {
      let resp = await submissionApi.run(id, code);
      for (let i = 0; resp.pending && i < 4; i++) {
        await sleep(1500);
        resp = await submissionApi.run(id, code);
      }
      setRunResponse(resp);
    } catch (e) {
      setActionError(apiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }, [id, code, running]);

  const submit = useCallback(async () => {
    if (!id || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const { submissionId } = await submissionApi.submit(id, code);
      navigate(`/submissions/${submissionId}`);
    } catch (e) {
      setActionError(apiErrorMessage(e));
      setSubmitting(false);
    }
  }, [id, code, navigate, submitting]);

  if (loadError) return <div className="p-8"><ErrorBanner message={loadError} /></div>;
  if (!problem) return <LoadingPage />;

  return (
    <div className="flex h-full flex-col gap-4 lg:h-auto">
      <div className="flex flex-col gap-1 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{problem.title}</h1>
          <span className="text-sm text-slate-500">{problem.points} pts</span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{problem.language.toUpperCase()}</span>
          <span>Time: {problem.timeLimitMs / 1000}s</span>
          <span>Memory: {problem.memoryLimitMb} MB</span>
          <span>Comparison: {problem.comparisonMode}</span>
        </div>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-2 lg:min-h-[70vh]">
        {/* statement */}
        <div className="space-y-5 overflow-y-auto pr-1">
          <StatementSection title="Problem Statement">{problem.statement}</StatementSection>
          <StatementSection title="Input Format">{problem.inputFormat}</StatementSection>
          <StatementSection title="Output Format">{problem.outputFormat}</StatementSection>
          <StatementSection title="Constraints">{problem.constraints}</StatementSection>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Examples</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <SampleBlock label="Sample Input" text={problem.sampleInput} />
              <SampleBlock label="Sample Output" text={problem.sampleOutput} />
            </div>
            {samples.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
                  Additional sample cases ({samples.length})
                </summary>
                <div className="mt-2 space-y-3">
                  {samples.map((s) => (
                    <div key={s.id} className="grid gap-2 sm:grid-cols-2">
                      <SampleBlock label={`Sample ${s.order} — Input`} text={s.input} />
                      <SampleBlock label={`Sample ${s.order} — Expected`} text={s.expectedOutput} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>

        {/* editor + actions */}
        <div className="flex min-h-[60vh] flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800">
            <CodeEditor
              problemId={problem.id}
              starterCode={problem.starterCode || ""}
              language="cpp"
              value={code}
              onChange={setCode}
              height="100%"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void run()} disabled={running || submitting} className="btn-secondary">
              {running ? <Spinner className="h-4 w-4" /> : <span>▶</span>} Run Samples
            </button>
            <button
              onClick={() => void submit()}
              disabled={running || submitting || !codeReady.current}
              className="btn-primary"
            >
              {submitting ? <Spinner className="h-4 w-4" /> : null} Submit
            </button>
            <button onClick={() => navigate(`/submissions/${problem.assignmentId ? "?problem=" + problem.id : ""}`)} className="ml-auto text-xs text-slate-500 hover:text-slate-300">
              My submissions →
            </button>
          </div>

          {actionError && <ErrorBanner message={actionError} />}

          {runResponse && <RunResultView resp={runResponse} />}
        </div>
      </div>
    </div>
  );
}