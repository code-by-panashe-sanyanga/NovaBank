import { Router } from "express";
import { body } from "express-validator";
import * as auth from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { handleValidation } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();

// validation rules live on the route so you can see the API contract
// and its rules in one place

router.post(
  "/register",
  authLimiter,
  [
    body("fullName").trim().isLength({ min: 2 }).withMessage("Please enter your full name"),
    body("email").isEmail().withMessage("Please enter a valid email").normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("phone").optional().trim(),
  ],
  handleValidation,
  auth.register
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Please enter a valid email").normalizeEmail(),
    body("password").notEmpty().withMessage("Please enter your password"),
  ],
  handleValidation,
  auth.login
);

router.post("/logout", requireAuth, auth.logout);
router.get("/me", requireAuth, auth.me);

router.post(
  "/forgot-password",
  authLimiter,
  [body("email").isEmail().withMessage("Please enter a valid email").normalizeEmail()],
  handleValidation,
  auth.forgotPassword
);

router.post(
  "/reset-password",
  authLimiter,
  [
    body("token").notEmpty().withMessage("Reset token missing"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  handleValidation,
  auth.resetPassword
);

export default router;
