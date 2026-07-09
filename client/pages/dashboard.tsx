import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Wallet, PiggyBank } from "lucide-react";
import Protected from "../components/Protected";
import Layout from "../components/Layout";
import SpendingChart from "../components/SpendingChart";
import TransactionRow, { Txn } from "../components/TransactionRow";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { formatMoney } from "../services/format";

interface Account {
  id: number;
  accountNumber: string;
  sortCode: string;
  type: "CURRENT" | "SAVINGS";
  balance: string;
  status: string;
}

interface DashboardData {
  accounts: Account[];
  recentTransactions: Txn[];
  monthlySpending: { label: string; total: number }[];
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get("/dashboard").then((res) => setData(res.data));
  }, []);

  const myAccountNumbers = data?.accounts.map((a) => a.accountNumber) ?? [];
  const totalBalance =
    data?.accounts.reduce((sum, a) => sum + Number(a.balance), 0) ?? 0;

  return (
    <Protected>
      <Layout>
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold">
            {greeting()}, {user?.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Across both accounts you have{" "}
            <span className="font-semibold text-ink-900 dark:text-ink-100">
              {formatMoney(totalBalance)}
            </span>
          </p>
        </div>

        {/* skeletons while loading so the page doesn't jump around */}
        {!data ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="card h-36 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* account balance cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {data.accounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  className={`card group relative overflow-hidden p-6 transition hover:-translate-y-0.5 ${
                    account.type === "CURRENT"
                      ? "!bg-gradient-to-br !from-ink-900 !via-brand-950 !to-brand-800 !border-0 text-white"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        account.type === "CURRENT"
                          ? "bg-white/10 text-brand-300"
                          : "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400"
                      }`}
                    >
                      {account.type === "CURRENT" ? <Wallet size={18} /> : <PiggyBank size={18} />}
                    </div>
                    {account.status === "FROZEN" && (
                      <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-500">
                        FROZEN
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-4 text-sm ${
                      account.type === "CURRENT" ? "text-white/60" : "text-ink-400"
                    }`}
                  >
                    {account.type === "CURRENT" ? "Current account" : "Savings account"}
                  </p>
                  <p className="font-display text-3xl font-bold">
                    {formatMoney(account.balance)}
                  </p>
                  <p
                    className={`mt-2 text-xs ${
                      account.type === "CURRENT" ? "text-white/50" : "text-ink-400"
                    }`}
                  >
                    {account.sortCode} · {account.accountNumber}
                  </p>
                </Link>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              {/* spending chart */}
              <div className="card p-6 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Spending by month</h2>
                  <span className="text-xs text-ink-400">last 6 months</span>
                </div>
                <div className="mt-4 h-[220px]">
                  <SpendingChart data={data.monthlySpending} />
                </div>
              </div>

              {/* recent transactions */}
              <div className="card p-6 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Recent activity</h2>
                  <Link
                    href="/payments"
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Move money <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="mt-2 divide-y divide-ink-50 dark:divide-ink-800/50">
                  {data.recentTransactions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-400">
                      No transactions yet - make your first deposit!
                    </p>
                  ) : (
                    data.recentTransactions.map((t) => (
                      <TransactionRow key={t.id} txn={t} myAccountNumbers={myAccountNumbers} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </Layout>
    </Protected>
  );
}
