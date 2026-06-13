"""Merchant / note keyword → spending category (Monzo-style insights)."""

from __future__ import annotations

from typing import Optional

RULES = [
    ("groceries", ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "coop", "grocery"]),
    ("transport", ["tfl", "uber", "train", "rail", "bus", "petrol", "shell", "bp", "parking"]),
    ("eating_out", ["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "nando", "deliveroo", "uber eats"]),
    ("entertainment", ["netflix", "spotify", "cinema", "game", "steam", "ticket"]),
    ("bills", ["rent", "council", "water", "electric", "gas", "broadband", "ee ", "vodafone", "o2 "]),
    ("shopping", ["amazon", "ebay", "shop", "store", "ikea", "primark"]),
    ("gambling", ["betfair", "bet365", "poker", "casino", "gambling", "ladbrokes", "william hill"]),
]


def categorise(note: Optional[str], kind: str) -> str:
    text = (note or "").lower()
    if kind == "DEPOSIT":
        if any(w in text for w in ("salary", "payroll", "wage")):
            return "income"
        return "income"
    if kind == "TRANSFER":
        return "transfers"
    for category, words in RULES:
        if any(w in text for w in words):
            return category
    return "other"
