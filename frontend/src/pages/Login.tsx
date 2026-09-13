import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, apiErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { ErrorBanner, Spinner } from "../components/ui";

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.login(email, password);
      await refresh();
      navigate("/dashboard");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-400">Submit</span>50
          </h1>
          <p className="mt-2 text-sm text-slate-500">ACM Student Chapter · VNIT Nagpur</p>
        </div>

        <div className="card space-y-4">
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="student@vnit.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <ErrorBanner message={error} />}
            <button type="submit" disabled={loading || !email || !password} className="btn-primary w-full">
              {loading ? <Spinner className="h-4 w-4" /> : "Sign In"}
            </button>
          </form>
          <p className="text-center text-xs text-slate-500">
            Accounts are created by your chapter admin. Contact them if you don't have one.
          </p>
        </div>
      </div>
    </div>
  );
}