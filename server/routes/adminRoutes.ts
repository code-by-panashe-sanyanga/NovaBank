import { Router } from "express";
import * as admin from "../controllers/adminController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// every admin route needs a valid login AND the admin role
router.use(requireAuth, requireAdmin);

router.get("/customers", admin.getCustomers);
router.get("/customers/:id", admin.getCustomer);
router.get("/transactions", admin.getAllTransactions);
router.post("/accounts/:id/freeze", admin.freezeAccount);
router.post("/accounts/:id/unfreeze", admin.unfreezeAccount);
router.post("/users/:id/unlock", admin.unlockUser);
router.get("/audit-logs", admin.getAuditLogs);

export default router;
