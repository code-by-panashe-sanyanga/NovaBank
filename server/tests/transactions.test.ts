import { Prisma } from "@prisma/client";
import { AppError } from "../middleware/errorHandler";
import { transferSchema } from "../middleware/validateTransfer";

jest.mock("../utils/prisma", () => ({
  __esModule: true,
  default: {
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../utils/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../utils/generators", () => ({
  generateTransactionRef: jest.fn().mockReturnValue("TX-TEST-001"),
}));

import prisma from "../utils/prisma";
import { transferFunds, depositFunds, withdrawFunds } from "../services/transactionService";

const mockedPrisma = prisma as unknown as {
  account: { findUnique: jest.Mock; update: jest.Mock };
  transaction: { create: jest.Mock };
  notification: { create: jest.Mock };
  $transaction: jest.Mock;
};

function useInteractiveTx() {
  // service now passes a callback; run it against the same mock client
  mockedPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockedPrisma) => unknown) =>
    fn(mockedPrisma)
  );
}

describe("transferSchema (Zod)", () => {
  it("accepts a valid transfer body with amount as a string", () => {
    const parsed = transferSchema.parse({
      fromAccountId: 1,
      toAccountNumber: "12345678",
      amount: "25.50",
      note: "lunch",
    });
    expect(parsed.fromAccountId).toBe(1);
    expect(parsed.amount).toBe("25.50");
  });

  it("rejects a bad account number", () => {
    const result = transferSchema.safeParse({
      fromAccountId: 1,
      toAccountNumber: "abc",
      amount: "10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = transferSchema.safeParse({
      fromAccountId: 1,
      toAccountNumber: "12345678",
      amount: "0",
    });
    expect(result.success).toBe(false);
  });
});

describe("transferFunds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useInteractiveTx();
  });

  it("throws when the source account is missing", async () => {
    mockedPrisma.account.findUnique.mockResolvedValueOnce(null);

    await expect(transferFunds(1, 99, "12345678", "10")).rejects.toMatchObject({
      message: "Account not found",
      statusCode: 404,
    } satisfies Partial<AppError>);
  });

  it("throws on insufficient funds", async () => {
    mockedPrisma.account.findUnique
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: "ACTIVE",
        accountNumber: "11111111",
        balance: new Prisma.Decimal(5),
      })
      .mockResolvedValueOnce({
        id: 2,
        userId: 2,
        status: "ACTIVE",
        accountNumber: "22222222",
        balance: new Prisma.Decimal(0),
        user: { id: 2, fullName: "Other" },
      });

    await expect(transferFunds(1, 1, "22222222", "10")).rejects.toMatchObject({
      message: "Insufficient funds",
      statusCode: 400,
    });
  });

  it("updates both balances inside the interactive transaction", async () => {
    mockedPrisma.account.findUnique
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: "ACTIVE",
        accountNumber: "11111111",
        balance: new Prisma.Decimal(100),
      })
      .mockResolvedValueOnce({
        id: 2,
        userId: 2,
        status: "ACTIVE",
        accountNumber: "22222222",
        balance: new Prisma.Decimal(0),
        user: { id: 2, fullName: "Other" },
      });

    const created = { reference: "TX-TEST-001", id: 9 };
    mockedPrisma.account.update.mockResolvedValue({});
    mockedPrisma.transaction.create.mockResolvedValue(created);
    mockedPrisma.notification.create.mockResolvedValue({});

    const result = await transferFunds(1, 1, "22222222", "20.00", "rent");
    expect(result).toEqual(created);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.account.update).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.notification.create).toHaveBeenCalled();
  });

  it("rejects transferring to the same account", async () => {
    mockedPrisma.account.findUnique
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: "ACTIVE",
        accountNumber: "11111111",
        balance: new Prisma.Decimal(100),
      })
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: "ACTIVE",
        accountNumber: "11111111",
        balance: new Prisma.Decimal(100),
        user: { id: 1, fullName: "Self" },
      });

    await expect(transferFunds(1, 1, "11111111", "10")).rejects.toMatchObject({
      message: "You can't transfer to the same account",
      statusCode: 400,
    });
  });

  it("rejects transfers from a frozen source account", async () => {
    mockedPrisma.account.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      status: "FROZEN",
      accountNumber: "11111111",
      balance: new Prisma.Decimal(100),
    });

    await expect(transferFunds(1, 1, "22222222", "10")).rejects.toMatchObject({
      message: "Your account is frozen",
      statusCode: 400,
    });
  });

  it("rejects when the destination account number does not exist", async () => {
    mockedPrisma.account.findUnique
      .mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: "ACTIVE",
        accountNumber: "11111111",
        balance: new Prisma.Decimal(100),
      })
      .mockResolvedValueOnce(null);

    await expect(transferFunds(1, 1, "99999999", "10")).rejects.toMatchObject({
      message: "No account found with that number",
      statusCode: 404,
    });
  });
});

describe("depositFunds ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useInteractiveTx();
  });

  it("404s when the account belongs to someone else", async () => {
    mockedPrisma.account.findUnique.mockResolvedValueOnce({
      id: 5,
      userId: 99,
      status: "ACTIVE",
      balance: new Prisma.Decimal(10),
    });

    await expect(depositFunds(1, 5, "20")).rejects.toMatchObject({
      message: "Account not found",
      statusCode: 404,
    });
  });
});

describe("withdrawFunds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useInteractiveTx();
  });

  it("checks balance inside the transaction before decrementing", async () => {
    mockedPrisma.account.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 1,
      status: "ACTIVE",
      accountNumber: "11111111",
      balance: new Prisma.Decimal(3),
    });

    await expect(withdrawFunds(1, 1, "10")).rejects.toMatchObject({
      message: "Insufficient funds",
      statusCode: 400,
    });
    expect(mockedPrisma.account.update).not.toHaveBeenCalled();
  });
});
