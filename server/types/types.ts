import { Request } from "express";

// the auth middleware decodes the JWT and attaches this to the request
export interface AuthUser {
  id: number;
  role: "CUSTOMER" | "ADMIN";
}

// Request with the logged-in user attached (set by requireAuth middleware)
export interface AuthRequest extends Request {
  user?: AuthUser;
}
