import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { assignmentApi, apiErrorMessage } from "../../services/api";
import { ErrorBanner, Spinner } from "../../components/ui";

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface AssignmentFormValues {
  title: string;
  description: string;
  instructions: string;
  startTime: string;
  deadline: string;
  leaderboardEnabled: boolean;
}

export function AssignmentForm({
  initial,
  submitLabel = "Create Assignment",
  onDone,
}: {
  initial?: Partial<AssignmentFormValues>;
  submitLabel?: string;
  onDone: (values: AssignmentFormValues) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(initial?.leaderboardEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onDone({
        title,
        description,
        instructions,
        startTime: startTime ? new Date(startTime).toISOString() : "",
        deadline: deadline ? new Date(deadline).toISOString() : "",
        leaderboardEnabled,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Assignment 1 — C++ Fundamentals" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input min-h-[64px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary shown on student assignment cards" />
      </div>
      <div>
        <label className="label">Instructions</label>
        <textarea className="input min-h-[96px]" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="How to submit, honor code, output guidelines…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Start Time</label>
          <input type="datetime-local" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={leaderboardEnabled}
          onChange={(e) => setLeaderboardEnabled(e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
        Enable leaderboard
      </label>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-3">
        <button type="submit" disabled={saving || !title} className="btn-primary">
          {saving ? <Spinner className="h-4 w-4" /> : null} {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function NewAssignmentPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <h1 className="text-2xl font-bold">New Assignment</h1>
      <div className="card">
        <AssignmentForm
          onDone={async (values) => {
            const a = await assignmentApi.create(values);
            navigate(`/admin/assignments/${a.id}`);
          }}
        />
      </div>
    </div>
  );
}

export function toInputValue(v: {
  title?: string;
  description?: string;
  instructions?: string;
  startTime?: string | null;
  deadline?: string | null;
  leaderboardEnabled?: boolean;
}) {
  return {
    title: v.title ?? "",
    description: v.description ?? "",
    instructions: v.instructions ?? "",
    startTime: toLocalInputValue(v.startTime ?? null),
    deadline: toLocalInputValue(v.deadline ?? null),
    leaderboardEnabled: v.leaderboardEnabled ?? true,
  };
}