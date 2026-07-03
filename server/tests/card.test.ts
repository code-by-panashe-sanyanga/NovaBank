import { Response } from "express";
import { AuthRequest } from "../types/types";

jest.mock("../utils/prisma", () => ({
  __esModule: true,
  default: {
    card: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
import { freezeCard, unfreezeCard, getMyCards } from "../controllers/cardController";

const mockedPrisma = prisma as unknown as {
  card: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  notification: { create: jest.Mock };
};

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

describe("cardController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists cards with masked numbers only", async () => {
    mockedPrisma.card.findMany.mockResolvedValue([
      {
        id: 1,
        cardNumber: "4111111111111111",
        expiryMonth: 2,
        expiryYear: 29,
        isFrozen: false,
        account: { accountNumber: "12345678", type: "CURRENT" },
      },
    ]);

    const { res, json } = mockRes();
    const req = { user: { id: 7, role: "CUSTOMER" } } as AuthRequest;

    await getMyCards(req, res);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0];
    expect(payload.cards[0].maskedNumber).toContain("****");
    expect(JSON.stringify(payload)).not.toContain("4111111111111111");
  });

  it("refuses to freeze someone else's card", async () => {
    mockedPrisma.card.findUnique.mockResolvedValue({
      id: 3,
      userId: 99,
      cardNumber: "4111111111119999",
    });

    const { res, status, json } = mockRes();
    const req = {
      user: { id: 1, role: "CUSTOMER" },
      params: { id: "3" },
    } as unknown as AuthRequest;

    await freezeCard(req, res);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "Card not found" });
    expect(mockedPrisma.card.update).not.toHaveBeenCalled();
  });

  it("freezes an owned card and writes a notification", async () => {
    mockedPrisma.card.findUnique.mockResolvedValue({
      id: 3,
      userId: 1,
      cardNumber: "4111111111114242",
    });
    mockedPrisma.card.update.mockResolvedValue({ id: 3, isFrozen: true });
    mockedPrisma.notification.create.mockResolvedValue({});

    const { res, json } = mockRes();
    const req = {
      user: { id: 1, role: "CUSTOMER" },
      params: { id: "3" },
    } as unknown as AuthRequest;

    await freezeCard(req, res);
    expect(mockedPrisma.card.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { isFrozen: true },
    });
    expect(mockedPrisma.notification.create).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ card: { id: 3, isFrozen: true } });
  });

  it("unfreezes an owned card", async () => {
    mockedPrisma.card.findUnique.mockResolvedValue({
      id: 3,
      userId: 1,
      cardNumber: "4111111111114242",
    });
    mockedPrisma.card.update.mockResolvedValue({ id: 3, isFrozen: false });
    mockedPrisma.notification.create.mockResolvedValue({});

    const { res, json } = mockRes();
    const req = {
      user: { id: 1, role: "CUSTOMER" },
      params: { id: "3" },
    } as unknown as AuthRequest;

    await unfreezeCard(req, res);
    expect(mockedPrisma.card.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { isFrozen: false },
    });
    expect(json).toHaveBeenCalledWith({ card: { id: 3, isFrozen: false } });
  });
});
