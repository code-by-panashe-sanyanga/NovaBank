import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../types/types";

// GET /api/dashboard
// one endpoint that returns everything the dashboard needs in a single
// request - balances, recent activity and the data for the spending chart
export async function getDashboard(req: AuthRequest, res: Response) {
  const userId = req.user!.id;

  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { type: "asc" },
  });
  const accountIds = accounts.map((a: { id: number }) => a.id);

  // last 5 transactions across both accounts
  const recentTransactions = await prisma.transaction.findMany({
    where: {
      OR: [{ senderId: { in: accountIds } }, { receiverId: { in: accountIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      sender: { select: { accountNumber: true, userId: true } },
      receiver: { select: { accountNumber: true, userId: true } },
    },
  });

  // money out per month for the last 6 months (withdrawals + transfers
  // where this user was the sender). done in JS rather than raw SQL to
  // keep it readable - the row counts here are tiny anyway
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const outgoing = await prisma.transaction.findMany({
    where: {
      senderId: { in: accountIds },
      createdAt: { gte: sixMonthsAgo },
    },
    select: { amount: true, createdAt: true },
  });

  // build the 6 month labels first so months with no spending still show up
  const monthlySpending: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthlySpending.push({
      label: d.toLocaleString("en-GB", { month: "short" }),
      total: 0,
    });
  }

  for (const t of outgoing) {
    const monthsBack =
      (new Date().getFullYear() - t.createdAt.getFullYear()) * 12 +
      (new Date().getMonth() - t.createdAt.getMonth());
    if (monthsBack >= 0 && monthsBack <= 5) {
      monthlySpending[5 - monthsBack].total += Number(t.amount);
    }
  }

  res.json({ accounts, recentTransactions, monthlySpending });
}
