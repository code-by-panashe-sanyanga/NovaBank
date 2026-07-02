#!/usr/bin/env tsx
// Only seed when the DB has zero users. Safe to run against Railway without wiping anyone.
import { execFileSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`Already have ${count} user(s), skipping seed.`);
    return;
  }
  console.log("Empty DB, running full seed...");
  await prisma.$disconnect();
  execFileSync("npx", ["tsx", path.join(__dirname, "seed.ts")], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: process.env,
  });
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
