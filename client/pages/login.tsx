import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthLayout from "../components/AuthLayout";
import api, { errorMessage } from "../services/api";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      login(res.data.token, res.data.user);
      // admins land on the admin panel, everyone else on their dashboard
      router.push(res.data.user.role === "ADMIN" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to check on your money.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>

        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          New to NovaBank?{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Open an account
          </Link>
        </p>

        {/* handy for anyone trying out the project */}
        <div className="rounded-xl border border-dashed border-ink-200 p-3 text-xs text-ink-400 dark:border-ink-700">
          <p className="font-semibold text-ink-500 dark:text-ink-300">Demo logins</p>
          <p>customer: alex@example.com / Password123</p>
          <p>admin: admin@novabank.co.uk / Password123</p>
        </div>
      </form>
    </AuthLayout>
  );
}
