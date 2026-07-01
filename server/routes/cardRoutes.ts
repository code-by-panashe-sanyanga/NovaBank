import { Router } from "express";
import * as cards from "../controllers/cardController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", cards.getMyCards);
router.post("/:id/freeze", cards.freezeCard);
router.post("/:id/unfreeze", cards.unfreezeCard);

export default router;
