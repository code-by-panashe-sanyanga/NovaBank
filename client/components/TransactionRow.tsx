import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { formatMoney, formatDateTime } from "../services/format";

export interface Txn {
  id: number;
  reference: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";
  amount: string;
  status: string;
  note: string | null;
  createdAt: string;
  sender?: { accountNumber: string; userId?: number; user?: { fullName: string } } | null;
  receiver?: { accountNumber: string; userId?: number; user?: { fullName: string } } | null;
}

// one row in a transaction list. `perspectiveAccountIds` are the accounts
// belonging to whoever is looking - used to decide if money came in or out
export default function TransactionRow({
  txn,
  myAccountNumbers,
}: {
  txn: Txn;
  myAccountNumbers: string[];
}) {
  // a transfer is "incoming" if the receiving account is one of mine
  const incoming =
    txn.type === "DEPOSIT" ||
    (txn.type === "TRANSFER" &&
      !!txn.receiver &&
      myAccountNumbers.includes(txn.receiver.accountNumber));

  const Icon =
    txn.type === "TRANSFER" ? ArrowLeftRight : incoming ? ArrowDownLeft : ArrowUpRight;

  return (
    <div className="flex items-center gap-4 py-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          incoming
            ? "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400"
            : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400"
        }`}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{txn.note || txn.type}</p>
        <p className="text-xs text-ink-400">
          {txn.reference} · {formatDateTime(txn.createdAt)}
        </p>
      </div>

      <div className="text-right">
        <p
          className={`font-display text-sm font-semibold ${
            incoming ? "text-brand-600 dark:text-brand-400" : ""
          }`}
        >
          {incoming ? "+" : "-"}
          {formatMoney(txn.amount)}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{txn.status}</p>
      </div>
    </div>
  );
}
