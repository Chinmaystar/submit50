import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { problemApi, apiErrorMessage } from "../../services/api";
import { ErrorBanner, Spinner } from "../../components/ui";

export interface ProblemFormValues {
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  points: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  language: string;
  starterCode: string;
  comparisonMode: "EXACT" | "TOKEN" | "FLOAT";
  order: number;
}

const STARTER_CPP = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;

export function ProblemForm({
  initial,
  submitLabel,
  onDone,
}: {
  initial?: Partial<ProblemFormValues>;
  submitLabel: string;
  onDone: (values: ProblemFormValues) => Promise<void>;
}) {
  const [v, setV] = useState<ProblemFormValues>({
    title: initial?.title ?? "",
    statement: initial?.statement ?? "",
    inputFormat: initial?.inputFormat ?? "",
    outputFormat: initial?.outputFormat ?? "",
    constraints: initial?.constraints ?? "",
    sampleInput: initial?.sampleInput ?? "",
    sampleOutput: initial?.sampleOutput ?? "",
    points: initial?.points ?? 10,
    timeLimitMs: initial?.timeLimitMs ?? 2000,
    memoryLimitMb: initial?.memoryLimitMb ?? 256,
    language: initial?.language ?? "cpp17",
    starterCode: initial?.starterCode ?? STARTER_CPP,
    comparisonMode: initial?.comparisonMode ?? "TOKEN",
    order: initial?.order ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProblemFormValues>(key: K, value: ProblemFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: ProblemFormValues = {
        ...v,
        points: Number(v.points) || 0,
        timeLimitMs: Number(v.timeLimitMs) || 2000,
        memoryLimitMb: Number(v.memoryLimitMb) || 256,
      };
      await onDone(payload);
    } catch (err) {
      setError(apiErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Title *</label>
          <input className="input" value={v.title} onChange={(e) => set("title", e.target.value)} required placeholder="Maximum Element" />
        </div>
        <div>
          <label className="label">Order</label>
          <input type="number" className="input" value={v.order} onChange={(e) => set("order", Number(e.target.value) || 1)} min={1} />
        </div>
      </div>

      <div>
        <label className="label">Problem Statement (Markdown / plain text)</label>
        <textarea className="input min-h-[120px] font-mono text-xs" value={v.statement} onChange={(e) => set("statement", e.target.value)} placeholder="Given an array of N integers, find the maximum element…" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Input Format</label>
          <textarea className="input min-h-[80px] font-mono text-xs" value={v.inputFormat} onChange={(e) => set("inputFormat", e.target.value)} />
        </div>
        <div>
          <label className="label">Output Format</label>
          <textarea className="input min-h-[80px] font-mono text-xs" value={v.outputFormat} onChange={(e) => set("outputFormat", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Constraints</label>
        <textarea className="input min-h-[60px] font-mono text-xs" value={v.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="1 ≤ N ≤ 10^5&#10;-10^9 ≤ A[i] ≤ 10^9" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Sample Input</label>
          <textarea className="input min-h-[80px] font-mono text-xs" value={v.sampleInput} onChange={(e) => set("sampleInput", e.target.value)} />
        </div>
        <div>
          <label className="label">Sample Output</label>
          <textarea className="input min-h-[80px] font-mono text-xs" value={v.sampleOutput} onChange={(e) => set("sampleOutput", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label">Points</label>
          <input type="number" min={0} className="input" value={v.points} onChange={(e) => set("points", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label">Time (sec)</label>
          <input type="number" min={0.1} step={0.1} className="input" value={v.timeLimitMs / 1000} onChange={(e) => set("timeLimitMs", Number((Number(e.target.value) || 1) * 1000))} />
        </div>
        <div>
          <label className="label">Memory (MB)</label>
          <input type="number" min={16} className="input" value={v.memoryLimitMb} onChange={(e) => set("memoryLimitMb", Number(e.target.value) || 256)} />
        </div>
        <div>
          <label className="label">Comparison</label>
          <select className="input" value={v.comparisonMode} onChange={(e) => set("comparisonMode", e.target.value as ProblemFormValues["comparisonMode"])}>
            <option value="TOKEN">TOKEN</option>
            <option value="EXACT">EXACT</option>
            <option value="FLOAT">FLOAT</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Starter Code</label>
        <textarea className="input min-h-[160px] font-mono text-xs" value={v.starterCode} onChange={(e) => set("starterCode", e.target.value)} />
      </div>

      {error && <ErrorBanner message={error} />}
      <button type="submit" disabled={saving || !v.title} className="btn-primary">
        {saving ? <Spinner className="h-4 w-4" /> : null} {submitLabel}
      </button>
    </form>
  );
}

export function NewProblemPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const assignmentId = params.get("assignment") ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <h1 className="text-2xl font-bold">New Problem</h1>
      <div className="card">
        <ProblemForm
          submitLabel="Create Problem"
          onDone={async (values) => {
            const p = await problemApi.create({ ...values, assignmentId });
            navigate(`/admin/problems/${p.id}`);
          }}
        />
      </div>
    </div>
  );
}