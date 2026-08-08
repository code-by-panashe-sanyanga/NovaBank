// helpers for generating the fake-but-realistic numbers the bank uses

// 8 digit account number, same format as UK banks
export function generateAccountNumber(): string {
  let digits = "";
  for (let i = 0; i < 8; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
}

// customer ids look like NB-52918 (NB = NovaBank)
export function generateCustomerId(): string {
  const num = 10000 + Math.floor(Math.random() * 90000);
  return `NB-${num}`;
}

// transaction references like TXN-8F2K1A - easier to read out over
// the phone than a raw database id
export function generateTransactionRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 confusion
  let ref = "";
  for (let i = 0; i < 6; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TXN-${ref}`;
}

// 16 digit card number starting with 4 so it looks like a Visa debit
export function generateCardNumber(): string {
  let digits = "4";
  for (let i = 0; i < 15; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
}

// cards only ever show the last 4 digits to the frontend
export function maskCardNumber(cardNumber: string): string {
  return `**** **** **** ${cardNumber.slice(-4)}`;
}
