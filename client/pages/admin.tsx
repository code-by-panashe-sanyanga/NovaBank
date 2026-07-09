import { useCallback, useEffect, useState } from "react";
import { Search, Lock, Unlock, Users, ArrowLeftRight, ScrollText } from "lucide-react";
import Protected from "../components/Protected";
import Layout from "../components/Layout";
import api, { errorMessage } from "../services/api";
import { formatMoney, formatDate, formatDateTime } from "../services/format";

// --- types for the three tabs ---

interface AdminAccount {
  id: number;
  accountNumber: string;
  type: string;
  balance: string;
  status: "ACTIVE" | "FROZEN";
}

interface Customer {
  id: number;
  customerId: string;
  fullName: string;
  email: string;
  phone: string | null;
  dateJoined: string;
  isLocked: boolean;
  accounts: AdminAccount[];
}

interface AdminTxn {
  id: number;
  reference: string;
  type: string;
  amount: string;
  status: string;
  note: string | null;
  createdAt: string;
  sender: { accountNumber: string; user: { fullName: string } } | null;
  receiver: { accountNumber: string; user: { fullName: string } } | null;
}

interface AuditEntry {
  id: number;
  action: string;
  details: string;
  createdAt: string;
  user: { fullName: string; role: string };
}

type Tab = "customers" | "transactions" | "audit";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("customers");
  const [error, setError] = useState("");

  // customers tab
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");

  // transactions tab
  const [transactions, setTransactions] = useState<AdminTxn[]>([]);
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotalPages, setTxnTotalPages] = useState(1);

  // audit tab
  const [logs, setLogs] = useState<AuditEntry[]>([]);

  const loadCustomers = useCallback(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    api.get(`/admin/customers${params}`).then((res) => setCustomers(res.data.customers));
  }, [search]);

  // small debounce so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(loadCustomers, 300);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  useEffect(() => {
    if (tab === "transactions") {
      api
        .get(`/admin/transactions?page=${txnPage}`)
        .then((res) => {
          setTransactions(res.data.transactions);
          setTxnTotalPages(res.data.totalPages || 1);
        });
    }
    if (tab === "audit") {
      api.get("/admin/audit-logs").then((res) => setLogs(res.data.logs));
    }
  }, [tab, txnPage]);

  async function toggleAccountStatus(account: AdminAccount) {
    setError("");
    try {
      const action = account.status === "ACTIVE" ? "freeze" : "unfreeze";
      await api.post(`/admin/accounts/${account.id}/${action}`);
      loadCustomers();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function unlockUser(id: number) {
    setError("");
    try {
      await api.post(`/admin/users/${id}/unlock`);
      loadCustomers();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "customers", label: "Customers", icon: Users },
    { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
    { key: "audit", label: "Audit log", icon: ScrollText },
  ];

  return (
    <Protected adminOnly>
      <Layout>
        <h1 className="font-display text-2xl font-bold">Admin panel</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Customer management, every transaction in the bank, and the audit trail.
        </p>

        <div className="mt-6 flex w-fit gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === key
                  ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-100"
                  : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        {/* ---- customers ---- */}
        {tab === "customers" && (
          <>
            <div className="relative mt-6 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input !pl-9"
                placeholder="Search by name, email or customer ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="mt-4 space-y-4">
              {customers.map((customer) => (
                <div key={customer.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{customer.fullName}</p>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                          {customer.customerId}
                        </span>
                        {customer.isLocked && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">
                            LOCKED
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {customer.email} · {customer.phone || "no phone"} · joined{" "}
                        {formatDate(customer.dateJoined)}
                      </p>
                    </div>
                    {customer.isLocked && (
                      <button onClick={() => unlockUser(customer.id)} className="btn-primary !py-1.5 text-xs">
                        <Unlock size={13} /> Unlock login
                      </button>
                    )}
                  </div>

                  {/* the customer's accounts with freeze/unfreeze controls */}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {customer.accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3 dark:border-ink-800"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {account.type === "CURRENT" ? "Current" : "Savings"} ·{" "}
                            {account.accountNumber}
                          </p>
                          <p
                            className={`text-xs font-semibold ${
                              account.status === "ACTIVE"
                                ? "text-brand-600 dark:text-brand-400"
                                : "text-red-500"
                            }`}
                          >
                            {account.status} · {formatMoney(account.balance)}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleAccountStatus(account)}
                          className="btn-ghost !py-1.5 border border-ink-200 text-xs dark:border-ink-700"
                        >
                          {account.status === "ACTIVE" ? (
                            <>
                              <Lock size={13} /> Freeze
                            </>
                          ) : (
                            <>
                              <Unlock size={13} /> Unfreeze
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {customers.length === 0 && (
                <p className="py-10 text-center text-sm text-ink-400">No customers found.</p>
              )}
            </div>
          </>
        )}

        {/* ---- transactions ---- */}
        {tab === "transactions" && (
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">From</th>
                  <th className="px-5 py-3 font-semibold">To</th>
                  <th className="px-5 py-3 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-800/50">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-mono text-xs">{t.reference}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-ink-800">
                        {t.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {t.sender ? `${t.sender.user.fullName} (${t.sender.accountNumber})` : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {t.receiver
                        ? `${t.receiver.user.fullName} (${t.receiver.accountNumber})`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-display font-semibold">
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-400">
                      {formatDateTime(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txnTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 border-t border-ink-100 py-3 dark:border-ink-800">
                <button className="btn-ghost !py-1.5" disabled={txnPage <= 1} onClick={() => setTxnPage((p) => p - 1)}>
                  Previous
                </button>
                <span className="text-sm text-ink-500">
                  Page {txnPage} of {txnTotalPages}
                </span>
                <button
                  className="btn-ghost !py-1.5"
                  disabled={txnPage >= txnTotalPages}
                  onClick={() => setTxnPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- audit log ---- */}
        {tab === "audit" && (
          <div className="card mt-6 px-5 py-2">
            <div className="divide-y divide-ink-50 dark:divide-ink-800/50">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-4 py-3">
                  <span className="w-44 shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-center text-[11px] font-bold tracking-wide dark:bg-ink-800">
                    {log.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{log.details}</p>
                    <p className="text-xs text-ink-400">
                      by {log.user.fullName} ({log.user.role.toLowerCase()})
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-ink-400">{formatDateTime(log.createdAt)}</p>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="py-10 text-center text-sm text-ink-400">Nothing logged yet.</p>
              )}
            </div>
          </div>
        )}
      </Layout>
    </Protected>
  );
}
