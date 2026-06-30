import { Response } from "express";
import prisma from "../utils/prisma";
import { logAudit } from "../utils/audit";
import { AuthRequest } from "../types/types";

// GET /api/admin/customers?search=smith
// paginated customer list with search over name, email and customer id
export async function getCustomers(req: AuthRequest, res: Response) {
  const search = String(req.query.search || "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;

  const where: any = { role: "CUSTOMER" };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { customerId: { contains: search, mode: "insensitive" } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        customerId: true,
        fullName: true,
        email: true,
        phone: true,
        dateJoined: true,
        isLocked: true,
        accounts: {
          select: { id: true, accountNumber: true, type: true, balance: true, status: true },
        },
      },
      orderBy: { dateJoined: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ customers, page, totalPages: Math.ceil(total / pageSize), total });
}

// GET /api/admin/customers/:id - full detail view for one customer
export async function getCustomer(req: AuthRequest, res: Response) {
  const customer = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    select: {
      id: true,
      customerId: true,
      fullName: true,
      email: true,
      phone: true,
      addressLine: true,
      city: true,
      postcode: true,
      dateJoined: true,
      isLocked: true,
      accounts: true,
      loginHistory: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }
  res.json({ customer });
}

// GET /api/admin/transactions - every transaction in the bank, newest first
export async function getAllTransactions(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 15;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        sender: {
          select: { accountNumber: true, user: { select: { fullName: true } } },
        },
        receiver: {
          select: { accountNumber: true, user: { select: { fullName: true } } },
        },
      },
    }),
    prisma.transaction.count(),
  ]);

  res.json({ transactions, page, totalPages: Math.ceil(total / pageSize), total });
}

// shared handler for freezing/unfreezing a customer's account
async function setAccountStatus(req: AuthRequest, res: Response, status: "ACTIVE" | "FROZEN") {
  const accountId = Number(req.params.id);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { user: { select: { id: true, fullName: true } } },
  });
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: { status },
  });

  const action = status === "FROZEN" ? "ACCOUNT_FROZEN" : "ACCOUNT_UNFROZEN";
  await logAudit(
    req.user!.id,
    action,
    `${account.accountNumber} (${account.user.fullName}) by admin`
  );

  // the customer should know their account status changed
  await prisma.notification.create({
    data: {
      userId: account.user.id,
      title: status === "FROZEN" ? "Account frozen" : "Account unfrozen",
      message:
        status === "FROZEN"
          ? `Your account ${account.accountNumber} has been frozen. Contact support for help.`
          : `Your account ${account.accountNumber} is active again.`,
    },
  });

  res.json({ account: { id: updated.id, status: updated.status } });
}

// POST /api/admin/accounts/:id/freeze
export function freezeAccount(req: AuthRequest, res: Response) {
  return setAccountStatus(req, res, "FROZEN");
}

// POST /api/admin/accounts/:id/unfreeze
export function unfreezeAccount(req: AuthRequest, res: Response) {
  return setAccountStatus(req, res, "ACTIVE");
}

// POST /api/admin/users/:id/unlock - unlock a locked login
export async function unlockUser(req: AuthRequest, res: Response) {
  const userId = Number(req.params.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  await prisma.user.update({ where: { id: userId }, data: { isLocked: false } });
  await logAudit(req.user!.id, "USER_UNLOCKED", `${user.customerId} unlocked by admin`);
  res.json({ message: "User unlocked" });
}

// GET /api/admin/audit-logs - recent audit trail, newest first
export async function getAuditLogs(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 20;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { fullName: true, role: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  res.json({ logs, page, totalPages: Math.ceil(total / pageSize), total });
}
