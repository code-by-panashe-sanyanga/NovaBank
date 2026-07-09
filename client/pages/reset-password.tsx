import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthLayout from "../components/AuthLayout";
import api, { errorMessage } from "../services/api";

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
      // give them a second to read the success message then off to login
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Paste the reset token you were sent, then pick a new password."
    >
      {done ? (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          Password updated. Taking you to the login page...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="token" className="label">
              Reset token
            </label>
            <input
              id="token"
              className="input font-mono text-xs"
              placeholder="paste it here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              New password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="8+ characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Update password
          </button>
          <p className="text-center text-sm">
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
