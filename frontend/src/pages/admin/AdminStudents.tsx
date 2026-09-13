import { useCallback, useEffect, useState } from "react";
import { adminApi, apiErrorMessage } from "../../services/api";
import type { AdminStudent } from "../../types";
import { LoadingPage, ErrorBanner, Modal, EmptyState, Spinner, Badge, formatDateTime } from "../../components/ui";

const PAGE_SIZE = 25;

export default function AdminStudents() {
  const [students, setStudents] = useState<AdminStudent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [disabledFilter, setDisabledFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .students({ search: search || undefined, disabled: disabledFilter || undefined, page })
      .then((r) => {
        setStudents(r.students);
        setTotal(r.total);
        setPages(r.pages);
      })
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [search, disabledFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="text-xs text-slate-500">{total} registered</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImportOpen(true)} className="btn-secondary">Import CSV</button>
          <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add Student</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, email, roll no…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select className="input !w-auto" value={disabledFilter} onChange={(e) => { setDisabledFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="false">Enabled</option>
          <option value="true">Disabled</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      {students === null ? (
        <LoadingPage />
      ) : students.length === 0 ? (
        <EmptyState icon="👥" title="No students match" hint={total === 0 ? "Add students manually or import a CSV (rollNumber,name,email[,password])." : "Try a different search."} />
      ) : (
        <>
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roll No</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <StudentRow key={s._id} s={s} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="text-slate-500">Page {page} of {pages}</span>
              <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      <AddStudentModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => { setSearch(""); setDisabledFilter(""); load(); }} />
    </div>
  );
}

function StudentRow({ s, onChanged }: { s: AdminStudent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggleDisable = async () => {
    setBusy(true);
    try {
      await adminApi.updateStudent(s._id, { disabled: !s.disabled });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className={`border-b border-slate-800/60 last:border-0 transition ${s.disabled ? "opacity-50" : "hover:bg-slate-800/30"}`}>
      <td className="px-4 py-2.5 font-medium">{s.name || "—"}</td>
      <td className="px-4 py-2.5 text-slate-400">{s.email}</td>
      <td className="px-4 py-2.5 text-slate-400">{s.rollNumber || "—"}</td>
      <td className="px-4 py-2.5">
        <Badge tone={s.role === "ADMIN" ? "violet" : "slate"}>{s.role}</Badge>
      </td>
      <td className="px-4 py-2.5">
        {s.hasPassword ? <Badge tone="green">password set</Badge> : <Badge tone="amber">no password</Badge>}
      </td>
      <td className="px-4 py-2.5">
        {s.disabled ? <Badge tone="red">disabled</Badge> : <Badge tone="green">enabled</Badge>}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-xs text-slate-500 lg:table-cell">{formatDateTime(s.lastLoginAt)}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => void toggleDisable()} disabled={busy} className="text-xs text-amber-400 hover:text-amber-300">
            {busy ? "…" : s.disabled ? "Enable" : "Disable"}
          </button>
          <SetPasswordModal id={s._id} email={s.email} onDone={() => void onChanged()} />
          <DeleteStudentModal id={s._id} name={s.name} email={s.email} onDone={onChanged} />
        </div>
      </td>
    </tr>
  );
}

function DeleteStudentModal({ id, name, email, onDone }: { id: string; name: string; email: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.removeStudent(id);
      setOpen(false);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-red-400 hover:text-red-300">
        Delete
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete account">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Permanently delete <span className="font-medium text-slate-100">{name || email}</span> ({email})? Their
            submissions, scores and classroom memberships are removed too. This cannot be undone.
          </p>
          {error && <ErrorBanner message={error} />}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => void submit()} disabled={saving} className="btn-danger">
              {saving ? <Spinner className="h-4 w-4" /> : null} Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function AddStudentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [role, setRole] = useState("STUDENT");
  const [roleSwitcher, setRoleSwitcher] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setRollNumber("");
      setRole("STUDENT");
      setPassword("");
      setError(null);
      setInfo(null);
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const r = await adminApi.addStudent({ name, email, rollNumber: rollNumber || undefined, role, password });
      if (r.updated) setInfo(`\"${email}\" already existed and was updated.`);
      else setInfo("Student created.");
      onCreated();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Student">
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@vnit.ac.in" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Roll Number</label>
            <input className="input" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} placeholder="21241020" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setRoleSwitcher(e.target.value); }}>
              <option value="STUDENT">STUDENT</option>
              <option value="MENTOR">MENTOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Password *</label>
          <input
            type="text"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="their login password (min 8 chars)"
          />
          <p className="mt-1 text-xs text-slate-500">The student signs in with their email + this password.</p>
        </div>
        {roleSwitcher === "ADMIN" && role === "ADMIN" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Admin accounts get full access to all assignments, problems, students and analytics.
          </div>
        )}
        {error && <ErrorBanner message={error} />}
        {info && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{info}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => void submit()} disabled={saving || !name || !email || password.length < 8} className="btn-primary">
            {saving ? <Spinner className="h-4 w-4" /> : null} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SetPasswordModal({ id, email, onDone }: { id: string; email: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateStudent(id, { password });
      setOpen(false);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-sky-400 hover:text-sky-300">
        Set password
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Set Password — ${email}`}>
        <div className="space-y-3">
          <div>
            <label className="label">New password (min 8 chars)</label>
            <input
              type="text"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => void submit()} disabled={saving || password.length < 8} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" /> : null} Save
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ImportCsvModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      setCsv("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const header = csv.trim().split("\n");
      const hasHeader = /^roll|name|email/i.test(header[0] ?? "");
      const body = hasHeader ? header.slice(1).join("\n") : csv;
      const r = await adminApi.importCsv(body);
      setResult(r);
      onImported();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Students (CSV)" wide>
      <div className="space-y-3">
        <div>
          <label className="label">CSV content — format: <code className="text-brand-400">rollNumber,name,email[,password]</code></label>
          <textarea
            className="input min-h-[180px] font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"21241001,Rahul Sharma,rahul@vnit.ac.in,hello123\n21241002,Aditya Verma,aditya@vnit.ac.in,hello456\n21241003,Aryan Patel,aryan@vnit.ac.in"}
          />
        </div>
        <p className="text-xs text-slate-500">
          Existing emails are updated, new ones created. The 4th column (password, min 8 chars) is optional — students
          without one can't log in until you set a password in the table.
        </p>
        {error && <ErrorBanner message={error} />}
        {result && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Created {result.created}, updated {result.updated}
            {result.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs text-amber-300">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Done</button>
          <button onClick={() => void submit()} disabled={saving || !csv.trim()} className="btn-primary">
            {saving ? <Spinner className="h-4 w-4" /> : null} Import
          </button>
        </div>
      </div>
    </Modal>
  );
}