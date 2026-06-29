import rateLimit from "express-rate-limit";

// stricter limit on login/register so someone can't brute force passwords
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// general limit for the rest of the API - generous enough that normal
// use never hits it
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Too many requests, slow down a bit" },
  standardHeaders: true,
  legacyHeaders: false,
});
