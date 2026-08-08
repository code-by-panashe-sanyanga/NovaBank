import { PrismaClient } from "@prisma/client";

// one shared client for the whole app - creating a new PrismaClient in every
// file opens too many database connections
const prisma = new PrismaClient();

export default prisma;
