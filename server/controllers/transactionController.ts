import { Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../types/types";
import * as txService from "../services/transactionService";

// POST /api/transactions/deposit
export async function deposit(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, amount, note } = req.body;
    const transaction = await txService.depositFunds(
      req.user!.id,
      Number(accountId),
      String(amount),
      note
    );
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions/withdraw
export async function withdraw(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, amount, note } = req.body;
    const transaction = await txService.withdrawFunds(
      req.user!.id,
      Number(accountId),
      String(amount),
      note
    );
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions/transfer
export async function transfer(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { fromAccountId, toAccountNumber, amount, note } = req.body;
    // amount is already a validated decimal string from validateTransfer
    const transaction = await txService.transferFunds(
      req.user!.id,
      Number(fromAccountId),
      String(toAccountNumber),
      String(amount),
      note
    );
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions
export async function getMyTransactions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    const accountIds = accounts.map((a: { id: number }) => a.id);

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 10;

    const where = {
      OR: [{ senderId: { in: accountIds } }, { receiverId: { in: accountIds } }],
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          sender: { select: { accountNumber: true, type: true, userId: true } },
          receiver: { select: { accountNumber: true, type: true, userId: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/export
export async function exportCsv(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    const accountIds = accounts.map((a: { id: number }) => a.id);

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ senderId: { in: accountIds } }, { receiverId: { in: accountIds } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { accountNumber: true } },
        receiver: { select: { accountNumber: true } },
      },
    });

    const header = "Reference,Type,Amount,From,To,Status,Note,Date";
    const rows = transactions.map((t) => {
      const note = `"${(t.note || "").replace(/"/g, '""')}"`;
      return [
        t.reference,
        t.type,
        t.amount.toString(),
        t.sender?.accountNumber || "-",
        t.receiver?.accountNumber || "-",
        t.status,
        note,
        t.createdAt.toISOString(),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=novabank-transactions.csv");
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
