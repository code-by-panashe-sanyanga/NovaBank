"""
NovaBank configuration.

Prefer PostgreSQL (DATABASE_URL). SQLite is only for local smoke tests
when Postgres is not available — production and concurrency demos use Postgres.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv("SECRET_KEY", "novabank-dev")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'novabank_ledger.db'}",
)
JWT_HOURS = int(os.getenv("JWT_HOURS", "24"))
IS_POSTGRES = DATABASE_URL.startswith("postgresql")
