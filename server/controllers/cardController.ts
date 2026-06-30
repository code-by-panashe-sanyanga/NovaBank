import { Response } from "express";
import prisma from "../utils/prisma";
import { logAudit } from "../utils/audit";
import { maskCardNumber } from "../utils/generators";
import { AuthRequest } from "../types/types";

// GET /api/cards - the user's cards with masked numbers.
// the full card number never leaves the server
export async function getMyCards(req: AuthRequest, res: Response) {
  const cards = await prisma.card.findMany({
    where: { userId: req.user!.id },
    include: { account: { select: { accountNumber: true, type: true } } },
  });

  const safeCards = cards.map((card) => ({
    id: card.id,
    maskedNumber: maskCardNumber(card.cardNumber),
    // pad so February shows as 02/29 not 2/29
    expiry: `${String(card.expiryMonth).padStart(2, "0")}/${card.expiryYear}`,
    isFrozen: card.isFrozen,
    account: card.account,
  }));

  res.json({ cards: safeCards });
}

// shared logic for freeze + unfreeze since they only differ by the flag
async function setFrozen(req: AuthRequest, res: Response, frozen: boolean) {
  const cardId = Number(req.params.id);

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== req.user!.id) {
    return res.status(404).json({ error: "Card not found" });
  }

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { isFrozen: frozen },
  });

  const action = frozen ? "CARD_FROZEN" : "CARD_UNFROZEN";
  await logAudit(req.user!.id, action, `Card ending ${card.cardNumber.slice(-4)}`);

  // tell the user in their notifications too - freezing a card is the
  // kind of thing you want a record of
  await prisma.notification.create({
    data: {
      userId: req.user!.id,
      title: frozen ? "Card frozen" : "Card unfrozen",
      message: `Your card ending ${card.cardNumber.slice(-4)} has been ${frozen ? "frozen" : "unfrozen"}.`,
    },
  });

  res.json({ card: { id: updated.id, isFrozen: updated.isFrozen } });
}

// POST /api/cards/:id/freeze
export function freezeCard(req: AuthRequest, res: Response) {
  return setFrozen(req, res, true);
}

// POST /api/cards/:id/unfreeze
export function unfreezeCard(req: AuthRequest, res: Response) {
  return setFrozen(req, res, false);
}
