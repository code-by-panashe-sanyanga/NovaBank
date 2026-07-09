import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthLayout from "../components/AuthLayout";
import api, { errorMessage } from "../services/api";
import { useAuth } from "../hooks/useAuth";

export default function Register() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // client-side checks first for instant feedback - the server
    // validates everything again anyway
    if (form.password.length < 8) {
      return setError("Password needs to be at least 8 characters");
    }
    if (form.password !== form.confirm) {
      return setError("Passwords don't match");
    }

    setSubmitting(true);
    try {
      const res = await api.post("/auth/register", {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      login(res.data.token, res.data.user);
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Open your account"
      subtitle="Takes about two minutes. You'll get a current account, a savings account and a debit card."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="fullName" className="label">
            Full name
          </label>
          <input
            id="fullName"
            className="input"
            placeholder="Alex Morgan"
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="phone" className="label">
            Phone <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="phone"
            className="input"
            placeholder="07700 900000"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="8+ characters"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="confirm" className="label">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              className="input"
              placeholder="Same again"
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Setting things up..." : "Open my account"}
        </button>

        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          Already banking with us?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
