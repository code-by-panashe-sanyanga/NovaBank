import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthRequest, AuthUser } from "../types/types";
import { env } from "../config/env";

// checks the Authorization header for a valid JWT.
// expects the header to look like: "Bearer <token>"
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthUser;
    // attach the user to the request so controllers can use it
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    // token expired or has been tampered with
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

// used on top of requireAuth for admin-only routes
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}
