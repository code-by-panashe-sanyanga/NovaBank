// seeds the database with a demo customer, an admin, and a few months of
// realistic transactions so the dashboard chart has something to show.
// run with: npm run db:seed
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// same generators as the app uses, copied in here so the seed file
// can run on its own without importing app code
function accountNumber() {
  let d = "";
  for (let i = 0; i < 8; i++) d += Math.floor(Math.random() * 10);
  return d;
}

function txnRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return `TXN-${ref}`;
}

function cardNumber() {
  let d = "4";
  for (let i = 0; i < 15; i++) d += Math.floor(Math.random() * 10);
  return d;
}

// a date `daysAgo` days in the past, at a random-ish time of day
function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(9 + (days % 10), (days * 7) % 60, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding database...");

  // wipe everything first so the seed can be re-run
  await prisma.auditLog.deleteMany();
  await prisma.loginHistory.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.card.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("Password123", 10);

  // ---- admin ----
  await prisma.user.create({
    data: {
      customerId: "NB-10001",
      fullName: "Admin User",
      email: "admin@novabank.co.uk",
      passwordHash: password,
      role: "ADMIN",
      phone: "07000 000001",
    },
  });

  // ---- demo customer (the account shown in the README) ----
  const alex = await prisma.user.create({
    data: {
      customerId: "NB-24601",
      fullName: "Alex Morgan",
      email: "alex@example.com",
      passwordHash: password,
      phone: "07700 900123",
      addressLine: "14 Deansgate",
      city: "Manchester",
      postcode: "M3 2BW",
      accounts: {
        create: [
          {
            accountNumber: accountNumber(),
            type: "CURRENT",
            balance: new Prisma.Decimal(2450.75),
          },
          {
            accountNumber: accountNumber(),
            type: "SAVINGS",
            balance: new Prisma.Decimal(8200.0),
          },
        ],
      },
    },
    include: { accounts: true },
  });

  const alexCurrent = alex.accounts.find((a) => a.type === "CURRENT")!;
  const alexSavings = alex.accounts.find((a) => a.type === "SAVINGS")!;

  await prisma.card.create({
    data: {
      cardNumber: cardNumber(),
      expiryMonth: 8,
      expiryYear: 29,
      userId: alex.id,
      accountId: alexCurrent.id,
    },
  });

  // ---- a second customer so transfers have someone to go to ----
  const jamie = await prisma.user.create({
    data: {
      customerId: "NB-31337",
      fullName: "Jamie Chen",
      email: "jamie@example.com",
      passwordHash: password,
      phone: "07700 900456",
      addressLine: "3 Oxford Road",
      city: "Manchester",
      postcode: "M1 5QA",
      accounts: {
        create: [
          {
            accountNumber: accountNumber(),
            type: "CURRENT",
            balance: new Prisma.Decimal(910.4),
          },
          {
            accountNumber: accountNumber(),
            type: "SAVINGS",
            balance: new Prisma.Decimal(3050.0),
          },
        ],
      },
    },
    include: { accounts: true },
  });

  const jamieCurrent = jamie.accounts.find((a) => a.type === "CURRENT")!;

  await prisma.card.create({
    data: {
      cardNumber: cardNumber(),
      expiryMonth: 3,
      expiryYear: 28,
      userId: jamie.id,
      accountId: jamieCurrent.id,
    },
  });

  // ---- transactions spread over ~5 months so the chart looks real ----
  // mix of salary coming in, rent going out, day-to-day spending and
  // the odd transfer between the two demo users
  const history: {
    type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";
    amount: number;
    note: string;
    days: number;
    senderId?: number;
    receiverId?: number;
  }[] = [
    // salary each month
    { type: "DEPOSIT", amount: 1850, note: "Salary", days: 150, receiverId: alexCurrent.id },
    { type: "DEPOSIT", amount: 1850, note: "Salary", days: 120, receiverId: alexCurrent.id },
    { type: "DEPOSIT", amount: 1850, note: "Salary", days: 90, receiverId: alexCurrent.id },
    { type: "DEPOSIT", amount: 1920, note: "Salary", days: 60, receiverId: alexCurrent.id },
    { type: "DEPOSIT", amount: 1920, note: "Salary", days: 30, receiverId: alexCurrent.id },
    { type: "DEPOSIT", amount: 1920, note: "Salary", days: 2, receiverId: alexCurrent.id },
    // rent each month
    { type: "WITHDRAWAL", amount: 750, note: "Rent", days: 148, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 750, note: "Rent", days: 118, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 750, note: "Rent", days: 88, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 750, note: "Rent", days: 58, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 750, note: "Rent", days: 28, senderId: alexCurrent.id },
    // day to day
    { type: "WITHDRAWAL", amount: 62.4, note: "Weekly food shop", days: 96, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 34.99, note: "Gym membership", days: 92, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 89.99, note: "Trainers", days: 75, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 45.6, note: "Petrol", days: 66, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 120.0, note: "Concert tickets", days: 51, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 58.3, note: "Weekly food shop", days: 44, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 34.99, note: "Gym membership", days: 32, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 71.2, note: "Weekly food shop", days: 17, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 26.5, note: "Takeaway", days: 9, senderId: alexCurrent.id },
    { type: "WITHDRAWAL", amount: 44.0, note: "Petrol", days: 4, senderId: alexCurrent.id },
    // saving a bit each month
    { type: "TRANSFER", amount: 200, note: "Monthly savings", days: 85, senderId: alexCurrent.id, receiverId: alexSavings.id },
    { type: "TRANSFER", amount: 200, note: "Monthly savings", days: 55, senderId: alexCurrent.id, receiverId: alexSavings.id },
    { type: "TRANSFER", amount: 250, note: "Monthly savings", days: 25, senderId: alexCurrent.id, receiverId: alexSavings.id },
    // paying a mate back
    { type: "TRANSFER", amount: 35.5, note: "Pizza night", days: 40, senderId: alexCurrent.id, receiverId: jamieCurrent.id },
    { type: "TRANSFER", amount: 18.0, note: "Cinema", days: 12, senderId: jamieCurrent.id, receiverId: alexCurrent.id },
  ];

  for (const t of history) {
    await prisma.transaction.create({
      data: {
        reference: txnRef(),
        type: t.type,
        amount: new Prisma.Decimal(t.amount),
        note: t.note,
        senderId: t.senderId,
        receiverId: t.receiverId,
        createdAt: daysAgo(t.days),
      },
    });
  }

  // a couple of notifications so the bell isn't empty
  await prisma.notification.createMany({
    data: [
      {
        userId: alex.id,
        title: "Welcome to NovaBank",
        message: "Your current and savings accounts are ready to use.",
        isRead: true,
        createdAt: daysAgo(150),
      },
      {
        userId: alex.id,
        title: "Money received",
        message: "You received £18.00 from Jamie Chen (Cinema)",
        createdAt: daysAgo(12),
      },
    ],
  });

  console.log("Done. Demo logins:");
  console.log("  customer  alex@example.com  / Password123");
  console.log("  admin     admin@novabank.co.uk / Password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
