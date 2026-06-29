import { NextFunction, Request, Response } from "express";
import { z } from "zod";

// Keep amount as a decimal string at the boundary. Coercing to number first
 // would let float noise in before Prisma.Decimal ever sees it.
const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimal places")
  .refine((v) => {
    const n = Number(v);
    return n > 0 && n <= 1_000_000;
  }, "Amount must be more than 0 and at most 1000000");

export const transferSchema = z.object({
  fromAccountId: z.coerce.number().int().positive(),
  toAccountNumber: z.string().trim().regex(/^\d{8}$/, "Account number should be 8 digits"),
  amount: moneyString,
  note: z.string().trim().max(100).optional(),
});

export type TransferBody = z.infer<typeof transferSchema>;

export function validateTransfer(req: Request, res: Response, next: NextFunction) {
  // Allow number bodies from older clients by stringifying first.
  const body = {
    ...req.body,
    amount:
      req.body?.amount === undefined || req.body?.amount === null
        ? req.body?.amount
        : String(req.body.amount),
  };

  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message || "Invalid transfer payload" });
  }
  req.body = parsed.data;
  next();
}
