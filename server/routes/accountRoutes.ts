import { Router } from "express";
import * as accounts from "../controllers/accountController";
import { requireAuth } from "../middleware/auth";

const router = Router();

// everything account-related needs a login
router.use(requireAuth);

router.get("/", accounts.getMyAccounts);
router.get("/:id", accounts.getAccount);
router.get("/:id/transactions", accounts.getAccountTransactions);

export default router;
