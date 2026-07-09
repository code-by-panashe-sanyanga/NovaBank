import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, PiggyBank, ChevronRight } from "lucide-react";
import Protected from "../../components/Protected";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { formatMoney, formatDate } from "../../services/format";

interface Account {
  id: number;
  accountNumber: string;
  sortCode: string;
  type: "CURRENT" | "SAVINGS";
  balance: string;
  currency: string;
  status: string;
  createdAt: string;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    api.get("/accounts").then((res) => setAccounts(res.data.accounts));
  }, []);

  return (
    <Protected>
      <Layout>
        <h1 className="font-display text-2xl font-bold">Your accounts</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Tap an account to see its full statement.
        </p>

        <div className="mt-6 space-y-4">
          {!accounts
            ? [0, 1].map((i) => <div key={i} className="card h-24 animate-pulse" />)
            : accounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  className="card flex items-center gap-5 p-6 transition hover:-translate-y-0.5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    {account.type === "CURRENT" ? <Wallet size={22} /> : <PiggyBank size={22} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">
                        {account.type === "CURRENT" ? "Current account" : "Savings account"}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          account.status === "ACTIVE"
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                            : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                        }`}
                      >
                        {account.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {account.sortCode} · {account.accountNumber} · opened{" "}
                      {formatDate(account.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="font-display text-xl font-bold">
                      {formatMoney(account.balance, account.currency)}
                    </p>
                    <ChevronRight size={18} className="text-ink-300" />
                  </div>
                </Link>
              ))}
        </div>
      </Layout>
    </Protected>
  );
}
