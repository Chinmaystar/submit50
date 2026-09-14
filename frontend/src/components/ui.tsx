import type { ReactNode } from "react";
import type { AssignmentState, SubmissionStatus, TestStatus } from "../types";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 animate-spin text-brand-400 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingPage({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    red: "bg-red-500/10 text-red-400 border-red-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    blue: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

const STATUS_META: Record<string, { label: string; tone: string; icon: string; spinner?: boolean }> = {
  QUEUED: { label: "Queued", tone: "slate", icon: "⏳", spinner: true },
  COMPILING: { label: "Compiling", tone: "blue", icon: "⚙️", spinner: true },
  COMPILATION_ERROR: { label: "Compilation Error", tone: "red", icon: "✗" },
  RUNNING: { label: "Running", tone: "blue", icon: "⚡", spinner: true },
  ACCEPTED: { label: "Accepted", tone: "green", icon: "✓" },
  WRONG_ANSWER: { label: "Wrong Answer", tone: "red", icon: "✗" },
  TIME_LIMIT_EXCEEDED: { label: "Time Limit Exceeded", tone: "amber", icon: "⏱" },
  MEMORY_LIMIT_EXCEEDED: { label: "Memory Limit Exceeded", tone: "amber", icon: "📦" },
  OUTPUT_LIMIT_EXCEEDED: { label: "Output Limit Exceeded", tone: "amber", icon: "📄" },
  RUNTIME_ERROR: { label: "Runtime Error", tone: "red", icon: "💥" },
  INTERNAL_ERROR: { label: "Internal Error", tone: "red", icon: "⚠️" },
  PASSED: { label: "Passed", tone: "green", icon: "✓" },
  SKIPPED: { label: "Skipped", tone: "slate", icon: "–" },
};

export function StatusBadge({ status }: { status: SubmissionStatus | TestStatus | string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "slate", icon: "?" };
  return (
    <Badge tone={meta.tone}>
      {meta.spinner ? (
        <Spinner className="mr-1 h-3.5 w-3.5 text-slate-300" />
      ) : (
        <span className="mr-1">{meta.icon}</span>
      )}
      {meta.label}
    </Badge>
  );
}

export function StateBadge({ state }: { state: AssignmentState }) {
  const map: Record<AssignmentState, string> = {
    DRAFT: "slate",
    PUBLISHED: "blue",
    ACTIVE: "green",
    CLOSED: "amber",
    ARCHIVED: "slate",
  };
  return <Badge tone={map[state]}>{state}</Badge>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[88vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "📭", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="mt-3 font-medium text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function ScorePill({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const tone = pct >= 80 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`font-mono text-sm font-semibold ${tone}`}>
      {score}/{total}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{message}</div>;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatMs(ms: number): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatKb(kb: number): string {
  if (!kb) return "—";
  return `${(kb / 1024).toFixed(1)} MB`;
}
