process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.DATABASE_URL = "postgresql://novabank:novabank@localhost:5432/novabank";
process.env.CLIENT_ORIGIN = "http://localhost:3000";
process.env.NODE_ENV = "test";

jest.mock("../utils/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
  },
}));

import request from "supertest";
import prisma from "../utils/prisma";
import app from "../index";

const mockedPrisma = prisma as unknown as { $queryRaw: jest.Mock };

describe("health endpoints", () => {
  it("GET /api/health returns ok without hitting the database", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/ready is 200 when the database answers", async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await request(app).get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("up");
  });

  it("GET /api/ready is 503 when the database is down", async () => {
    mockedPrisma.$queryRaw.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/api/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
  });
});
