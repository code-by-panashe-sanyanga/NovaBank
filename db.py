"""
SQLite access for NovaBank.

Money is stored as TEXT of Decimal strings (e.g. "120.50") so we never
use binary floats for balances.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("NOVABANK_DB", Path(__file__).resolve().parent / "novabank.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  address_line TEXT,
  city TEXT,
  postcode TEXT,
  role TEXT NOT NULL DEFAULT 'CUSTOMER',
  date_joined TEXT NOT NULL DEFAULT (datetime('now')),
  is_locked INTEGER NOT NULL DEFAULT 0,
  reset_token TEXT,
  reset_token_expiry TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT NOT NULL UNIQUE,
  sort_code TEXT NOT NULL DEFAULT '04-29-09',
  type TEXT NOT NULL,
  balance TEXT NOT NULL DEFAULT '0.00',
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sender_id INTEGER REFERENCES accounts(id),
  receiver_id INTEGER REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number TEXT NOT NULL UNIQUE,
  expiry_month INTEGER NOT NULL,
  expiry_year INTEGER NOT NULL,
  is_frozen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL REFERENCES users(id)
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
