import { Router } from "express";
import { body } from "express-validator";
import * as tx from "../controllers/transactionController";
import { requireAuth } from "../middleware/auth";
import { handleValidation } from "../middleware/validate";
import { validateTransfer } from "../middleware/validateTransfer";

const router = Router();

router.use(requireAuth);

const amountRules = [
  body("accountId").isInt().withMessage("Account is required"),
  // keep as string/number input but validate as money text so the service
  // can build Decimal without a float hop
  body("amount")
    .customSanitizer((v) => String(v))
    .matches(/^\d+(\.\d{1,2})?$/)
    .withMessage("Amount must be a number with up to 2 decimal places")
    .custom((v) => {
      const n = Number(v);
      return n > 0 && n <= 1_000_000;
    })
    .withMessage("Amount must be more than 0"),
  body("note").optional().trim().isLength({ max: 100 }).withMessage("Note is too long"),
];

router.post("/deposit", amountRules, handleValidation, tx.deposit);
router.post("/withdraw", amountRules, handleValidation, tx.withdraw);

// transfer uses Zod (plus the shared auth middleware)
router.post("/transfer", validateTransfer, tx.transfer);

router.get("/", tx.getMyTransactions);
router.get("/export", tx.exportCsv);

export default router;
