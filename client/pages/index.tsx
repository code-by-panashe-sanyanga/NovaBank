import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  PieChart,
  CreditCard,
  Bell,
  Lock,
} from "lucide-react";
import Logo from "../components/Logo";

// public landing page - the "shop window" before you log in
export default function Home() {
  const features = [
    {
      icon: Zap,
      title: "Instant transfers",
      text: "Send money to any NovaBank account with just their account number. It lands before you've closed the app.",
    },
    {
      icon: PieChart,
      title: "See where it goes",
      text: "A monthly spending chart that actually makes sense, so payday doesn't stay a mystery.",
    },
    {
      icon: CreditCard,
      title: "Freeze in a tap",
      text: "Left your card in the pub? Freeze it instantly and unfreeze it when it turns up.",
    },
    {
      icon: Bell,
      title: "Know the moment",
      text: "Notifications when money arrives, when your card changes, when anything happens.",
    },
    {
      icon: ShieldCheck,
      title: "Two accounts built in",
      text: "Every customer gets a current account and a savings account from day one.",
    },
    {
      icon: Lock,
      title: "Locked down",
      text: "Hashed passwords, rate-limited logins and a full audit trail behind the scenes.",
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/register" className="btn-primary">
            Open an account
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 text-center lg:pt-24">
          <p className="mx-auto mb-6 w-fit rounded-full border border-brand-200 bg-brand-50 px-4 py-1 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
            Current + savings accounts, one app
          </p>
          <h1 className="mx-auto max-w-3xl font-display text-5xl font-bold leading-tight lg:text-6xl">
            Your money,{" "}
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">
              minus the faff
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-ink-500 dark:text-ink-400">
            NovaBank is a clean, fast current account. Move money, watch your
            spending and freeze your card - all in seconds.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link href="/register" className="btn-primary !px-7 !py-3 !text-base">
              Get started <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn-ghost !px-7 !py-3 !text-base">
              I have an account
            </Link>
          </div>

          {/* fake app preview card */}
          <div className="card mx-auto mt-16 max-w-2xl p-6 text-left">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-400">Current account</p>
                <p className="font-display text-4xl font-bold">£2,450.75</p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                ACTIVE
              </span>
            </div>
            <div className="mt-6 space-y-3">
              {[
                { name: "Salary", amount: "+£1,920.00", sub: "Yesterday" },
                { name: "Monthly savings", amount: "-£250.00", sub: "3 days ago" },
                { name: "Weekly food shop", amount: "-£71.20", sub: "Last week" },
              ].map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between border-b border-ink-50 pb-3 last:border-0 last:pb-0 dark:border-ink-800/50"
                >
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-ink-400">{t.sub}</p>
                  </div>
                  <p
                    className={`font-display text-sm font-semibold ${
                      t.amount.startsWith("+") ? "text-brand-600" : ""
                    }`}
                  >
                    {t.amount}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold">
          Everything a bank should do
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink-100 py-8 text-center text-sm text-ink-400 dark:border-ink-800">
        NovaBank. Student portfolio project, not a real bank. Please don't
        deposit real money.
      </footer>
    </div>
  );
}
