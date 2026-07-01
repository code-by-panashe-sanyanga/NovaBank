import { Router } from "express";
import { getDashboard } from "../controllers/dashboardController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getDashboard);

export default router;
