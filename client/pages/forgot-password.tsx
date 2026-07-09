import { useState, FormEvent } from "react";
import Link from "next/link";
import AuthLayout from "../components/AuthLayout";
import api, { errorMessage } from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
    >
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            If that email is registered, a reset link has been sent. (In this
            demo the token is printed to the server console - grab it from
            there and use it on the reset page.)
          </p>
          <Link href="/reset-password" className="btn-primary w-full">
            I have my reset token
          </Link>
        </div>
      ) : (
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
          <button type="submit" className="btn-primary w-full">
            Send reset link
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
