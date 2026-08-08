import prisma from "./prisma";

// small helper so controllers can write an audit entry in one line.
// wrapped in try/catch because a failed audit write shouldn't take
// down the actual request
export async function logAudit(userId: number, action: string, details: string) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, details },
    });
  } catch (err) {
    console.error("audit log failed:", err);
  }
}
