import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../types/types";

// GET /api/accounts - both accounts for the logged in user
export async function getMyAccounts(req: AuthRequest, res: Response) {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user!.id },
    orderBy: { type: "asc" }, // CURRENT before SAVINGS
  });
  res.json({ accounts });
}

// GET /api/accounts/:id - one account, with a check that it belongs to you
export async function getAccount(req: AuthRequest, res: Response) {
  const accountId = Number(req.params.id);

  const account = await prisma.account.findUnique({ where: { id: accountId } });

  // the ownership check matters - without it any logged in user could
  // read anyone's balance by changing the id in the URL
  if (!account || account.userId !== req.user!.id) {
    return res.status(404).json({ error: "Account not found" });
  }

  res.json({ account });
}

// GET /api/accounts/:id/transactions
// supports ?type=DEPOSIT&search=tesco&from=2026-01-01&to=2026-02-01&page=1
export async function getAccountTransactions(req: AuthRequest, res: Response) {
  const accountId = Number(req.params.id);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== req.user!.id) {
    return res.status(404).json({ error: "Account not found" });
  }

  const { type, search, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;

  // build the where clause up bit by bit depending on which filters are set
  const where: any = {
    OR: [{ senderId: accountId }, { receiverId: accountId }],
  };

  if (type && type !== "ALL") {
    where.type = type;
  }
  if (search) {
    // match against the reference or the note
    where.AND = [
      {
        OR: [
          { reference: { contains: String(search), mode: "insensitive" } },
          { note: { contains: String(search), mode: "insensitive" } },
        ],
      },
    ];
  }
  if (from) {
    where.createdAt = { ...(where.createdAt || {}), gte: new Date(String(from)) };
  }
  if (to) {
    // add a day so "to" is inclusive of that date
    const toDate = new Date(String(to));
    toDate.setDate(toDate.getDate() + 1);
    where.createdAt = { ...(where.createdAt || {}), lt: toDate };
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        sender: { select: { accountNumber: true, user: { select: { fullName: true } } } },
        receiver: { select: { accountNumber: true, user: { select: { fullName: true } } } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    transactions,
    page,
    totalPages: Math.ceil(total / pageSize),
    total,
  });
}
