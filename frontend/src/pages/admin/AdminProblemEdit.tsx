import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { problemApi, apiErrorMessage } from "../../services/api";
import { LANGUAGE_LABELS, type LanguageId } from "../../lib/languages";
import type { AdminTestCase } from "../../types";
import { LoadingPage, ErrorBanner, EmptyState, Modal, Spinner, Badge } from "../../components/ui";
import { ProblemForm } from "./ProblemForm";

interface VerifyResult {
  totalTests: number;
  passed: number;
  compileError?: string;
  failed: { index: number; isSample: boolean; status: string; input: string; expectedOutput: string; actualOutput: string }[];
}

function parseBulk(text: string): { input: string; expectedOutput: string; points?: number }[] {
  const blocks = text
    .split(/^={3,}\s*$/m)
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b.trim().length > 0);
  return blocks.map((block) => {
    let points: number | undefined;
    const pt = block.match(/^points\s*[:=]\s*(\d+)\s*$/im);
    if (pt) {
      points = Number(pt[1]);
      block = block.replace(pt[0], "");
    }
    const sep = block.search(/\n[ \t]*\n/);
    if (sep === -1) return { input: block.trim(), expectedOutput: "", points };
    const input = block.slice(0, sep).replace(/^\n/, "");
    const expectedOutput = block.slice(sep + 1).replace(/^\n+/, "").replace(/\s+$/, "");
    return { input, expectedOutput, points };
  });
}

function TestEditorModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: AdminTestCase;
  onClose: () => void;
  onSave: (data: Omit<AdminTestCase, "id" | "order">) => Promise<void>;
}) {
  const [input, setInput] = useState(initial?.input ?? "");
  const [expectedOutput, setExpectedOutput] = useState(initial?.expectedOutput ?? "");
  const [points, setPoints] = useState(initial?.points ?? 1);
  const [isSample, setIsSample] = useState(initial?.isSample ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInput(initial?.input ?? "");
      setExpectedOutput(initial?.expectedOutput ?? "");
      setPoints(initial?.points ?? 1);
      setIsSample(initial?.isSample ?? false);
      setError(null);
    }
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Test Case" : "Add Test Case"} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Input</label>
            <textarea className="input min-h-[120px] font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          <div>
            <label className="label">Expected Output</label>
            <textarea className="input min-h-[120px] font-mono text-xs" value={expectedOutput} onChange={(e) => setExpectedOutput(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="w-28">
            <label className="label">Points</label>
            <input type="number" min={0} className="input" value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isSample} onChange={(e) => setIsSample(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            Sample (visible to students)
          </label>
        </div>
        {error && <ErrorBanner message={error} />}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSave({ input, expectedOutput, points, isSample });
                onClose();
              } catch (e) {
                setError(apiErrorMessage(e));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? <Spinner className="h-4 w-4" /> : null} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminProblemEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Awaited<ReturnType<typeof problemApi.get>>["problem"] | null>(null);
  const [tests, setTests] = useState<AdminTestCase[]>([]);
  const [pointsSummary, setPointsSummary] = useState<{ sum: number; expected: number }>({ sum: 0, expected: 0 });
  const [error, setError] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<AdminTestCase | undefined>(undefined);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [verifySolution, setVerifySolution] = useState("");
  const [verifyLang, setVerifyLang] = useState<LanguageId>("cpp17");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const loadTests = useCallback(() => {
    problemApi.tests(id!).then(({ tests: t, pointsSummary: ps }) => {
      setTests(t);
      setPointsSummary(ps);
    });
  }, [id]);

  useEffect(() => {
    Promise.all([problemApi.get(id!), problemApi.tests(id!)])
      .then(([p, t]) => {
        setProblem(p.problem);
        setTests(t.tests);
        setPointsSummary(t.pointsSummary);
        const allowed = (p.problem.allowedLanguages?.length ? p.problem.allowedLanguages : ["cpp17"]) as LanguageId[];
        setVerifyLang(allowed[0]);
        setVerifySolution(p.problem.referenceSolutions?.[allowed[0]] ?? "");
      })
      .catch((e) => setError(apiErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flash = () => {
    setSavedFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const refreshVerifyData = useCallback(() => {
    loadTests();
  }, [loadTests]);

  const showToast = () => (
    <div className={`fixed bottom-6 right-6 z-[60] rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-opacity ${savedFlash ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      Saved
    </div>
  );

  if (error) return <div className="p-8"><ErrorBanner message={error} /></div>;
  if (!problem) return <LoadingPage />;

  const sampleTotal = tests.filter((t) => t.isSample).reduce((s, t) => s + t.points, 0);
  const hiddenTotal = tests.filter((t) => !t.isSample).reduce((s, t) => s + t.points, 0);

  const handleVerify = async () => {
    if (!verifySolution.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    setBulkError(null);
    try {
      const r = await problemApi.verify(id!, verifySolution, verifyLang);
      setVerifyResult(r);
      refreshVerifyData();
    } catch (e) {
      setBulkError(apiErrorMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      {showToast()}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{problem.title}</h1>
          <Badge tone="blue">{problem.comparisonMode}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {problem.assignmentId && (
            <button
              onClick={() => navigate(`/admin/assignments/${problem.assignmentId}`)}
              className="text-sm text-slate-500 hover:text-slate-300"
            >
              ← Back to assignment
            </button>
          )}
          <button
            onClick={async () => {
              if (!window.confirm(`Delete problem "${problem.title}" and all its tests? This cannot be undone.`)) return;
              setDeleting(true);
              try {
                await problemApi.remove(id!);
                navigate(problem.assignmentId ? `/admin/assignments/${problem.assignmentId}` : "/admin/assignments");
              } catch (e) {
                setError(apiErrorMessage(e));
                setDeleting(false);
              }
            }}
            disabled={deleting}
            className="btn-danger !px-3 !py-1.5 text-xs"
          >
            {deleting ? <Spinner className="h-4 w-4" /> : null} Delete
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Details</h2>
        <ProblemForm
          initial={{
            title: problem.title,
            statement: problem.statement,
            inputFormat: problem.inputFormat,
            outputFormat: problem.outputFormat,
            constraints: problem.constraints,
            sampleInput: problem.sampleInput,
            sampleOutput: problem.sampleOutput,
            points: problem.points,
            timeLimitMs: problem.timeLimitMs,
            memoryLimitMb: problem.memoryLimitMb,
            allowedLanguages: problem.allowedLanguages,
            starterCode: problem.starterCode,
            comparisonMode: problem.comparisonMode,
            order: problem.order,
          }}
          submitLabel="Save Problem"
          onDone={async (values) => {
            await problemApi.update(id!, values);
            flash();
            const updated = await problemApi.get(id!);
            setProblem(updated.problem);
          }}
        />
      </div>

      {/* test manager */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Test Cases
            <span className="ml-3 font-mono text-xs text-slate-500">
              sample {sampleTotal} · hidden {hiddenTotal} · total {pointsSummary.sum}/{pointsSummary.expected}
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingTest(undefined);
                setTestModalOpen(true);
              }}
              className="btn-primary !px-3 !py-1.5 text-xs"
            >
              + Add Test
            </button>
            <details className="relative">
              <summary className="btn-secondary !px-3 !py-1.5 text-xs cursor-pointer">Bulk Upload</summary>
              <div className="absolute right-0 top-full z-10 mt-2 w-[420px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
                <div className="mb-1 text-xs text-slate-400">
                  Separate cases with a line of <code className="text-brand-400">===</code>. Within a case: input (leave blank for no input), then a blank line, then expected output. Optional first line <code className="text-brand-400">points:N</code>.
                </div>
                <textarea
                  className="input min-h-[140px] font-mono text-xs"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'5\n1 2 3 4 5\n\n5\n===\n\nHello World\n===6\n0 1 1 2 3\n\n5'}
                />
                {bulkError && <div className="mt-2"><ErrorBanner message={bulkError} /></div>}
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={async () => {
                      setBulkError(null);
                      try {
                        const parsed = parseBulk(bulkText);
                        if (parsed.length === 0) throw new Error("No test cases found in input");
                        await problemApi.bulkTests(
                          id!,
                          parsed.map((t) => ({ ...t, isSample: false })),
                          true
                        );
                        setBulkText("");
                        loadTests();
                        flash();
                      } catch (e) {
                        setBulkError(apiErrorMessage(e));
                      }
                    }}
                    className="btn-primary"
                  >
                    Import {parseBulk(bulkText).length || 0} cases
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>

        {tests.length === 0 ? (
          <EmptyState icon="🧪" title="No test cases" hint="Add test cases so the judge can score submissions. Hidden tests are never exposed to students." />
        ) : (
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">Input</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-xs text-slate-600">{t.order}</td>
                    <td className="px-4 py-3">
                      {t.isSample ? <Badge tone="blue">sample</Badge> : <Badge>hidden</Badge>}
                    </td>
                    <td className="px-4 py-3 font-mono text-brand-400">{t.points}</td>
                    <td className="max-w-[160px] px-4 py-3">
                      <pre className="truncate font-mono text-xs text-slate-400">{t.input.split("\n")[0]}</pre>
                    </td>
                    <td className="max-w-[160px] px-4 py-3">
                      <pre className="truncate font-mono text-xs text-slate-400">{t.expectedOutput.split("\n")[0]}</pre>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEditingTest(t);
                          setTestModalOpen(true);
                        }}
                        className="mr-2 text-brand-400 hover:text-brand-300 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm("Delete this test case?")) return;
                          try {
                            await problemApi.deleteTest(id!, t.id);
                            loadTests();
                          } catch (e) {
                            alert(apiErrorMessage(e));
                          }
                        }}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* verify panel */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Verify Reference Solution</h2>
        <div className="card space-y-3">
          <p className="text-xs text-slate-500">
            Compile and run a solution against <strong className="text-slate-300">all</strong> test cases before publishing.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Language
              <select
                value={verifyLang}
                onChange={(e) => {
                  const next = e.target.value as LanguageId;
                  setVerifyLang(next);
                  setVerifySolution(problem.referenceSolutions?.[next] ?? "");
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-brand-500 focus:outline-none"
              >
                {(problem.allowedLanguages?.length ? problem.allowedLanguages : ["cpp17"] as LanguageId[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-600">Verifies as {LANGUAGE_LABELS[verifyLang]}</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await problemApi.update(id!, {
                    referenceSolutions: { ...(problem.referenceSolutions ?? {}), [verifyLang]: verifySolution },
                  });
                  flash();
                } catch (e) {
                  alert(apiErrorMessage(e));
                }
              }}
              disabled={!verifySolution.trim()}
              className="ml-auto btn-secondary !px-3 !py-1.5 text-xs"
            >
              Save as reference ({LANGUAGE_LABELS[verifyLang]})
            </button>
          </div>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            value={verifySolution}
            onChange={(e) => setVerifySolution(e.target.value)}
            placeholder="#include <bits/stdc++.h>…"
          />
          <div className="flex items-center gap-3">
            <button onClick={() => void handleVerify()} disabled={verifying || !verifySolution.trim()} className="btn-primary">
              {verifying ? <Spinner className="h-4 w-4" /> : null} Run Verification
            </button>
            {verifyResult && (
              <span className={`text-sm font-medium ${verifyResult.passed === verifyResult.totalTests ? "text-emerald-400" : "text-amber-400"}`}>
                {verifyResult.passed}/{verifyResult.totalTests} passed
              </span>
            )}
          </div>
          {verifyResult?.compileError && (
            <pre className="overflow-x-auto rounded-lg border border-red-900/40 bg-black/40 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">
              {verifyResult.compileError}
            </pre>
          )}
          {verifyResult && verifyResult.failed.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-400">Failed cases</div>
              {verifyResult.failed.slice(0, 10).map((f) => (
                <div key={f.index} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>Test {f.index}</span>
                    {f.isSample && <Badge tone="blue">sample</Badge>}
                    <span className="text-red-400">{f.status}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <pre className="overflow-hidden rounded border border-slate-800 bg-black/40 p-2 text-slate-300 whitespace-pre-wrap">IN: {f.input}</pre>
                    <pre className="overflow-hidden rounded border border-slate-800 bg-black/40 p-2 text-slate-300 whitespace-pre-wrap">EXP: {f.expectedOutput}</pre>
                    <pre className="overflow-hidden rounded border border-red-900/40 bg-red-950/20 p-2 text-red-300 whitespace-pre-wrap">GOT: {f.actualOutput}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <TestEditorModal
        open={testModalOpen}
        initial={editingTest}
        onClose={() => setTestModalOpen(false)}
        onSave={async (data) => {
          if (editingTest) {
            await problemApi.updateTest(id!, editingTest.id, data);
          } else {
            await problemApi.addTest(id!, data);
          }
          loadTests();
          flash();
        }}
      />
    </div>
  );
}