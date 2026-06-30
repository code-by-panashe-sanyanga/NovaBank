import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../utils/prisma";
import { logAudit } from "../utils/audit";
import {
  generateAccountNumber,
  generateCustomerId,
  generateCardNumber,
} from "../utils/generators";
import { AuthRequest } from "../types/types";

// tokens last a day - long enough that you don't get logged out mid-demo,
// short enough to be sensible
function createToken(id: number, role: string) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: "1d",
  });
}

// record every login attempt, successful or not, for the login history page
async function recordLogin(userId: number, req: Request, success: boolean) {
  await prisma.loginHistory.create({
    data: {
      userId,
      ipAddress: req.ip || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      success,
    },
  });
}

// POST /api/auth/register
// creates the user plus their two accounts and a debit card in one go,
// so a brand new user can log straight in and see a working bank
export async function register(req: Request, res: Response) {
  const { fullName, email, password, phone } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: "An account with that email already exists" });
  }

  // 10 salt rounds is the usual default - slow enough to be safe
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      customerId: generateCustomerId(),
      fullName,
      email,
      passwordHash,
      phone,
      accounts: {
        create: [
          { accountNumber: generateAccountNumber(), type: "CURRENT" },
          { accountNumber: generateAccountNumber(), type: "SAVINGS" },
        ],
      },
      notifications: {
        create: {
          title: "Welcome to NovaBank",
          message: "Your current and savings accounts are ready to use.",
        },
      },
    },
    include: { accounts: true },
  });

  // give them a debit card linked to the current account
  const currentAccount = user.accounts.find(
    (a: { type: string }) => a.type === "CURRENT"
  )!;
  const now = new Date();
  await prisma.card.create({
    data: {
      cardNumber: generateCardNumber(),
      expiryMonth: now.getMonth() + 1,
      // cards expire 4 years from issue
      expiryYear: (now.getFullYear() + 4) % 100,
      userId: user.id,
      accountId: currentAccount.id,
    },
  });

  await logAudit(user.id, "USER_REGISTERED", `New customer ${user.customerId}`);
  await recordLogin(user.id, req, true);

  const token = createToken(user.id, user.role);
  res.status(201).json({
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  });
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // deliberately vague error - don't tell an attacker which half was wrong
  if (!user) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await recordLogin(user.id, req, false);
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  if (user.isLocked) {
    await recordLogin(user.id, req, false);
    return res.status(403).json({ error: "This account is locked. Contact support." });
  }

  await recordLogin(user.id, req, true);

  const token = createToken(user.id, user.role);
  res.json({
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  });
}

// POST /api/auth/logout
// with JWTs the server doesn't keep sessions - the client just deletes
// its token. this endpoint exists so the action still gets audit logged
export async function logout(req: AuthRequest, res: Response) {
  if (req.user) {
    await logAudit(req.user.id, "USER_LOGOUT", "User logged out");
  }
  res.json({ message: "Logged out" });
}

// GET /api/auth/me - the frontend calls this on page load to restore the session
export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      customerId: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      dateJoined: true,
    },
  });
  res.json({ user });
}

// POST /api/auth/forgot-password
// real banks would email a link - I don't have an email server, so the
// token gets printed to the server console instead. the flow is the same.
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  // always answer the same way so you can't use this to check
  // which emails are registered
  const reply = { message: "If that email is registered, a reset link has been sent." };
  if (!user) {
    return res.json(reply);
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    },
  });

  console.log(`[password reset] token for ${email}: ${resetToken}`);
  res.json(reply);
}

// POST /api/auth/reset-password
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() }, // token still valid
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Reset link is invalid or has expired" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiry: null },
  });

  await logAudit(user.id, "PASSWORD_RESET", "Password changed via reset link");
  res.json({ message: "Password updated, you can log in now" });
}
