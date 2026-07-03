import { Response } from "express";
import { AuthRequest } from "../types/types";
import { requireAdmin } from "../middleware/auth";

jest.mock("../utils/prisma", () => ({
  __esModule: true,
  default: {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("../utils/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

import prisma from "../utils/prisma";
import { getAuditLogs, unlockUser, freezeAccount } from "../controllers/adminController";

const mockedPrisma = prisma as unknown as {
  auditLog: { findMany: jest.Mock; count: jest.Mock };
  user: { findUnique: jest.Mock; update: jest.Mock };
  account: { findUnique: jest.Mock; update: jest.Mock };
  notification: { create: jest.Mock };
};

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

describe("requireAdmin", () => {
  it("blocks non-admin users", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();
    const req = { user: { id: 1, role: "CUSTOMER" } } as AuthRequest;

    requireAdmin(req, { status, json } as unknown as Response, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admins through", () => {
    const next = jest.fn();
    const req = { user: { id: 1, role: "ADMIN" } } as AuthRequest;
    requireAdmin(req, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("adminController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns paginated audit logs", async () => {
    mockedPrisma.auditLog.findMany.mockResolvedValue([{ id: 1, action: "LOGIN" }]);
    mockedPrisma.auditLog.count.mockResolvedValue(1);

    const { res, json } = mockRes();
    const req = {
      user: { id: 9, role: "ADMIN" },
      query: {},
    } as unknown as AuthRequest;

    await getAuditLogs(req, res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, total: 1, logs: [{ id: 1, action: "LOGIN" }] })
    );
  });

  it("unlocks a locked user", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 4,
      customerId: "NB-100",
      isLocked: true,
    });
    mockedPrisma.user.update.mockResolvedValue({});

    const { res, json } = mockRes();
    const req = {
      user: { id: 9, role: "ADMIN" },
      params: { id: "4" },
    } as unknown as AuthRequest;

    await unlockUser(req, res);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { isLocked: false },
    });
    expect(json).toHaveBeenCalledWith({ message: "User unlocked" });
  });

  it("freezes a customer account and notifies them", async () => {
    mockedPrisma.account.findUnique.mockResolvedValue({
      id: 2,
      accountNumber: "12345678",
      user: { id: 4, fullName: "Alex" },
    });
    mockedPrisma.account.update.mockResolvedValue({ id: 2, status: "FROZEN" });
    mockedPrisma.notification.create.mockResolvedValue({});

    const { res, json } = mockRes();
    const req = {
      user: { id: 9, role: "ADMIN" },
      params: { id: "2" },
    } as unknown as AuthRequest;

    await freezeAccount(req, res);
    expect(mockedPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: "FROZEN" },
    });
    expect(mockedPrisma.notification.create).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ account: { id: 2, status: "FROZEN" } });
  });
});
