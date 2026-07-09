import { useEffect, useState, FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Send } from "lucide-react";
import Protected from "../components/Protected";
import Layout from "../components/Layout";
import api, { errorMessage } from "../services/api";
import { formatMoney } from "../services/format";

interface Account {
  id: number;
  accountNumber: string;
  type: string;
  balance: string;
}

type Tab = "transfer" | "deposit" | "withdraw";

// one page for all three ways of moving money, switched with tabs
export default function Payments() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState<Tab>("transfer");

  // shared form state across the tabs
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountNumber, setToAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadAccounts() {
    api.get("/accounts").then((res) => {
      setAccounts(res.data.accounts);
      // preselect the current account since that's what you use 90% of the time
      if (res.data.accounts.length > 0 && !fromAccountId) {
        setFromAccountId(String(res.data.accounts[0].id));
      }
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadAccounts, []);

  const tabs: { key: Tab; label: string; icon: typeof Send }[] = [
    { key: "transfer", label: "Transfer", icon: Send },
    { key: "deposit", label: "Deposit", icon: ArrowDownLeft },
    { key: "withdraw", label: "Withdraw", icon: ArrowUpRight },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      if (tab === "transfer") {
        const res = await api.post("/transactions/transfer", {
          fromAccountId: Number(fromAccountId),
          toAccountNumber,
          amount: Number(amount),
          note,
        });
        setSuccess(`Sent ${formatMoney(amount)} — ref ${res.data.transaction.reference}`);
      } else {
        const res = await api.post(`/transactions/${tab}`, {
          accountId: Number(fromAccountId),
          amount: Number(amount),
          note,
        });
        setSuccess(
          `${tab === "deposit" ? "Deposited" : "Withdrew"} ${formatMoney(amount)} — ref ${
            res.data.transaction.reference
          }`
        );
      }
      // reset the money fields but keep the account selection
      setAmount("");
      setNote("");
      setToAccountNumber("");
      loadAccounts(); // refresh balances shown in the dropdown
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Protected>
      <Layout>
        <h1 className="font-display text-2xl font-bold">Move money</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Transfer to another NovaBank account, or top up / withdraw from your own.
        </p>

        <div className="card mt-6 max-w-xl p-6">
          {/* tab switcher */}
          <div className="flex gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setError("");
                  setSuccess("");
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
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

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                {success}
              </p>
            )}

            <div>
              <label htmlFor="from" className="label">
                {tab === "deposit" ? "Into account" : "From account"}
              </label>
              <select
                id="from"
                className="input"
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type === "CURRENT" ? "Current" : "Savings"} · {a.accountNumber} ·{" "}
                    {formatMoney(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            {tab === "transfer" && (
              <div>
                <label htmlFor="to" className="label">
                  To account number
                </label>
                <input
                  id="to"
                  className="input"
                  placeholder="8 digit account number"
                  value={toAccountNumber}
                  onChange={(e) => setToAccountNumber(e.target.value)}
                  maxLength={8}
                  required
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  Tip: your own savings account works here too - that's how you move money
                  between your accounts.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="amount" className="label">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                  £
                </span>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input !pl-8"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="note" className="label">
                Reference <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                id="note"
                className="input"
                placeholder="e.g. Rent, Pizza night..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={100}
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting
                ? "Processing..."
                : tab === "transfer"
                ? "Send money"
                : tab === "deposit"
                ? "Deposit"
                : "Withdraw"}
            </button>
          </form>
        </div>
      </Layout>
    </Protected>
  );
}
