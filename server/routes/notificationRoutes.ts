import { Router } from "express";
import * as notifications from "../controllers/notificationController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", notifications.getMyNotifications);
router.patch("/read-all", notifications.markAllRead);

export default router;
