import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

// runs after the express-validator checks on a route.
// if any check failed, send back the first error message instead of
// carrying on into the controller
export function handleValidation(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}
