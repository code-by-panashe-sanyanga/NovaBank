"""
FX rates from Frankfurter (ECB, free, no API key).

https://www.frankfurter.app/
We never scrape bank sites — public market data only.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict

import httpx

TWOPLACES = Decimal("0.01")
_CACHE: Dict[str, Decimal] = {}


def get_rate(base: str, quote: str) -> Decimal:
    base = base.upper()
    quote = quote.upper()
    if base == quote:
        return Decimal("1")
    key = f"{base}:{quote}"
    if key in _CACHE:
        return _CACHE[key]
    url = f"https://api.frankfurter.dev/v1/latest?from={base}&to={quote}"
    with httpx.Client(timeout=8.0, follow_redirects=True) as client:
        res = client.get(url)
        res.raise_for_status()
        data = res.json()
    rate = Decimal(str(data["rates"][quote])).quantize(Decimal("0.0001"))
    _CACHE[key] = rate
    return rate


def convert(amount: Decimal, base: str, quote: str) -> Decimal:
    rate = get_rate(base, quote)
    return (amount * rate).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
