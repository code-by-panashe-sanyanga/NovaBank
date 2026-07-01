import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { logAudit } from "../utils/audit";
import { generateTransactionRef } from "../utils/generators";
import { AppError } from "../middleware/errorHandler";

// Prisma client or the interactive transaction client. Same shape for account reads/writes.
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Load an account and confirm it belongs to this user.
 * Returns null instead of throwing so each caller can pick the right message
 * (e.g. "Account not found" vs a frozen-account error after ownership is confirmed).
 */
async function getUsableAccount(db: Db, accountId: number, userId: number) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== userId) return null;
  return account;
}

function parseAmount(amount: string): Prisma.Decimal {
  // Amount arrives as a string from the API so we never hop through a JS float.
  return new Prisma.Decimal(amount);
}

export async function depositFunds(
  userId: number,
  accountId: number,
  amount: string,
  note?: string
) {
  const value = parseAmount(amount);

  return prisma.$transaction(async (tx) => {
    const account = await getUsableAccount(tx, accountId, userId);
    if (!account) throw new AppError("Account not found", 404);
    if (account.status === "FROZEN") throw new AppError("This account is frozen", 400);

    await tx.account.update({
      where: { id: account.id },
      data: { balance: { increment: value } },
    });

    const transaction = await tx.transaction.create({
      data: {
        reference: generateTransactionRef(),
        type: "DEPOSIT",
        amount: value,
        receiverId: account.id,
        note: note || "Deposit",
      },
    });

    await logAudit(userId, "DEPOSIT", `£${amount} into ${account.accountNumber}`);
    return transaction;
  });
}

export async function withdrawFunds(
  userId: number,
  accountId: number,
  amount: string,
  note?: string
) {
  const value = parseAmount(amount);

  // Interactive transaction: re-read the balance inside the same tx as the
  // decrement so two concurrent withdrawals cannot both pass a stale check.
  return prisma.$transaction(async (tx) => {
    const account = await getUsableAccount(tx, accountId, userId);
    if (!account) throw new AppError("Account not found", 404);
    if (account.status === "FROZEN") throw new AppError("This account is frozen", 400);
    if (account.balance.lessThan(value)) throw new AppError("Insufficient funds", 400);

    await tx.account.update({
      where: { id: account.id },
      data: { balance: { decrement: value } },
    });

    const transaction = await tx.transaction.create({
      data: {
        reference: generateTransactionRef(),
        type: "WITHDRAWAL",
        amount: value,
        senderId: account.id,
        note: note || "Withdrawal",
      },
    });

    await logAudit(userId, "WITHDRAWAL", `£${amount} from ${account.accountNumber}`);
    return transaction;
  });
}

export async function transferFunds(
  userId: number,
  fromAccountId: number,
  toAccountNumber: string,
  amount: string,
  note?: string
) {
  const value = parseAmount(amount);

  // Same idea as withdraw: ownership, freeze checks and the balance check all
  // happen inside one interactive transaction before we touch either balance.
  // The old array form (const [, , tx] = await prisma.$transaction([...]))
  // was fine for grouping writes, but it could not re-check the balance after
  // locking the row. Interactive tx fixes that.
  return prisma.$transaction(async (tx) => {
    const fromAccount = await getUsableAccount(tx, fromAccountId, userId);
    if (!fromAccount) throw new AppError("Account not found", 404);
    if (fromAccount.status === "FROZEN") throw new AppError("Your account is frozen", 400);

    const toAccount = await tx.account.findUnique({
      where: { accountNumber: String(toAccountNumber) },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!toAccount) throw new AppError("No account found with that number", 404);
    if (toAccount.id === fromAccount.id) {
      throw new AppError("You can't transfer to the same account", 400);
    }
    if (toAccount.status === "FROZEN") throw new AppError("The receiving account is frozen", 400);
    if (fromAccount.balance.lessThan(value)) throw new AppError("Insufficient funds", 400);

    await tx.account.update({
      where: { id: fromAccount.id },
      data: { balance: { decrement: value } },
    });
    await tx.account.update({
      where: { id: toAccount.id },
      data: { balance: { increment: value } },
    });

    const transaction = await tx.transaction.create({
      data: {
        reference: generateTransactionRef(),
        type: "TRANSFER",
        amount: value,
        senderId: fromAccount.id,
        receiverId: toAccount.id,
        note: note || "Transfer",
      },
    });

    if (toAccount.user.id !== userId) {
      await tx.notification.create({
        data: {
          userId: toAccount.user.id,
          title: "Money received",
          message: `You received £${amount} (ref ${transaction.reference})`,
        },
      });
    }

    await logAudit(
      userId,
      "TRANSFER_SENT",
      `£${amount} from ${fromAccount.accountNumber} to ${toAccount.accountNumber}`
    );

    return transaction;
  });
}
