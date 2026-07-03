process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-at-least-16-chars";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://novabank:novabank@localhost:5432/novabank";
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
process.env.NODE_ENV = "test";
