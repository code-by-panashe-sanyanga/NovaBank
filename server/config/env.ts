// load and check the env vars the API actually needs.
// keeping this in one place means a missing JWT_SECRET fails at boot
// instead of halfway through a login request.
import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const clientOrigin =
  process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "http://localhost:3000";

const jwtSecret = required("JWT_SECRET");
if (
  process.env.NODE_ENV === "production" &&
  (jwtSecret.length < 16 || jwtSecret === "change-me-in-prod" || jwtSecret === "pick-a-long-random-string")
) {
  throw new Error("JWT_SECRET is too weak for production. Set a long random value.");
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  clientOrigin,
};
