import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { AuthRequest } from "../types/types";
import { env } from "../config/env";

describe("requireAuth", () => {
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let status: jest.Mock;
  let json: jest.Mock;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    next = jest.fn();
    req = { headers: {} };
    res = { status } as Partial<Response>;
  });

  it("rejects missing Authorization header", () => {
    requireAuth(req as AuthRequest, res as Response, next as NextFunction);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Not logged in" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens", () => {
    req.headers = { authorization: "Bearer not-a-token" };
    requireAuth(req as AuthRequest, res as Response, next as NextFunction);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches user and calls next for a valid token", () => {
    const token = jwt.sign({ id: 7, role: "CUSTOMER" }, env.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };
    requireAuth(req as AuthRequest, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 7, role: "CUSTOMER" });
  });
});

describe("requireAdmin", () => {
  it("blocks non-admins", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();
    const req = { user: { id: 1, role: "CUSTOMER" } } as AuthRequest;
    requireAdmin(req, { status } as unknown as Response, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admins", () => {
    const next = jest.fn();
    const req = { user: { id: 1, role: "ADMIN" } } as AuthRequest;
    requireAdmin(req, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });
});
