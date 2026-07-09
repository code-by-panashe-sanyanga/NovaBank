import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Download, Search } from "lucide-react";
import Link from "next/link";
import Protected from "../../components/Protected";
import Layout from "../../components/Layout";
import TransactionRow, { Txn } from "../../components/TransactionRow";
import api from "../../services/api";
import { formatMoney } from "../../services/format";

interface Account {
  id: number;
  accountNumber: string;
  sortCode: string;
  type: string;
  balance: string;
  status: string;
}

// statement page for one account - filters, search, pagination and CSV export
export default function AccountDetail() {
  const router = useRouter();
  const accountId = router.query.id as string | undefined;

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // filter state
  const [type, setType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!accountId) return; // router not ready on first render
    api
      .get(`/accounts/${accountId}`)
      .then((res) => setAccount(res.data.account))
      .catch(() => router.replace("/accounts"));
  }, [accountId, router]);

  const loadTransactions = useCallback(() => {
    if (!accountId) return;
    const params = new URLSearchParams({ page: String(page) });
    if (type !== "ALL") params.set("type", type);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    api.get(`/accounts/${accountId}/transactions?${params}`).then((res) => {
      setTransactions(res.data.transactions);
      setTotalPages(res.data.totalPages || 1);
    });
  }, [accountId, page, type, search, from, to]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // the export needs the auth header, so a plain <a href> won't work -
  // fetch it as a blob and trigger the download by hand
  async function downloadCsv() {
    const res = await api.get("/transactions/export", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "novabank-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Protected>
      <Layout>
        <Link
          href="/accounts"
          className="mb-4 flex w-fit items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-100"
        >
          <ArrowLeft size={15} /> All accounts
        </Link>

        {account && (
          <div className="card flex flex-wrap items-end justify-between gap-4 p-6">
            <div>
              <p className="text-sm text-ink-400">
                {account.type === "CURRENT" ? "Current account" : "Savings account"} ·{" "}
                {account.sortCode} · {account.accountNumber}
              </p>
              <p className="mt-1 font-display text-4xl font-bold">
                {formatMoney(account.balance)}
              </p>
            </div>
            <button onClick={downloadCsv} className="btn-ghost border border-ink-200 dark:border-ink-700">
              <Download size={16} /> Export CSV
            </button>
          </div>
        )}

        {/* filter bar */}
        <div className="card mt-6 flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input !pl-9"
              placeholder="Search reference or note..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input w-auto"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All types</option>
            <option value="DEPOSIT">Deposits</option>
            <option value="WITHDRAWAL">Withdrawals</option>
            <option value="TRANSFER">Transfers</option>
          </select>
          <input
            type="date"
            className="input w-auto"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="text-sm text-ink-400">to</span>
          <input
            type="date"
            className="input w-auto"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* transaction list */}
        <div className="card mt-6 px-6 py-2">
          <div className="divide-y divide-ink-50 dark:divide-ink-800/50">
            {transactions.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-400">
                No transactions match those filters.
              </p>
            ) : (
              transactions.map((t) => (
                <TransactionRow
                  key={t.id}
                  txn={t}
                  myAccountNumbers={account ? [account.accountNumber] : []}
                />
              ))
            )}
          </div>
        </div>

        {/* pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-sm text-ink-500">
              Page {page} of {totalPages}
            </span>
            <button
              className="btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </Layout>
    </Protected>
  );
}
