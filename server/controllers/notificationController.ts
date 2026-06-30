import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../types/types";

// GET /api/notifications - newest first, capped at 20
export async function getMyNotifications(req: AuthRequest, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });

  res.json({ notifications, unreadCount });
}

// PATCH /api/notifications/read-all - mark everything read when the
// user opens the notification dropdown
export async function markAllRead(req: AuthRequest, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ message: "All read" });
}
