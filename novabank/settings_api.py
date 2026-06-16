"""
Settings API — bank-style IA: profile, security, cards, notifications,
payments, privacy, app prefs, support.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from novabank.auth import (
    check_password,
    create_session,
    get_current_user,
    get_token_jti,
    hash_password,
)
from novabank.database import get_db
from novabank.models import (
    Account,
    AuditLog,
    AuthSession,
    Card,
    LoginHistory,
    Pot,
    RecurringTransfer,
    SavedPayee,
    SupportTicket,
    User,
)
from novabank.services.ledger import fmt, mask_card, money

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULT_NOTIF_PREFS = {
    "push": {
        "every_transaction": True,
        "large_only": False,
        "low_balance": True,
        "failed_payments": True,
        "security": True,
    },
    "email": {
        "every_transaction": False,
        "large_only": True,
        "low_balance": True,
        "failed_payments": True,
        "security": True,
    },
    "sms": {
        "every_transaction": False,
        "large_only": False,
        "low_balance": False,
        "failed_payments": False,
        "security": True,
    },
}


def _prefs(user: User) -> dict:
    if user.notification_prefs:
        try:
            return json.loads(user.notification_prefs)
        except json.JSONDecodeError:
            pass
    return json.loads(json.dumps(DEFAULT_NOTIF_PREFS))


def _profile_out(user: User) -> dict:
    return {
        "customerId": user.customer_id,
        "fullName": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "addressLine": user.address_line,
        "city": user.city,
        "postcode": user.postcode,
        "dateJoined": user.date_joined.isoformat() if user.date_joined else None,
        "emailVerified": True,  # stub badge for demo
        "phoneVerified": bool(user.phone),
    }


class ProfileIn(BaseModel):
    fullName: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = None
    addressLine: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None


class PasswordIn(BaseModel):
    currentPassword: str
    newPassword: str = Field(min_length=8, max_length=128)


class SecurityTogglesIn(BaseModel):
    totpEnabled: Optional[bool] = None
    biometricEnabled: Optional[bool] = None


class NotifPrefsIn(BaseModel):
    prefs: Dict[str, Any]
    dailySpendAlert: Optional[str] = None


class AppPrefsIn(BaseModel):
    preferredCurrency: Optional[str] = None
    language: Optional[str] = None
    fontScale: Optional[str] = None
    highContrast: Optional[bool] = None


class PrivacyIn(BaseModel):
    marketingEmail: Optional[bool] = None
    marketingSms: Optional[bool] = None
    openBankingShare: Optional[bool] = None


class PaymentsPrefsIn(BaseModel):
    defaultAccountId: Optional[int] = None
    transferLimit: Optional[str] = None


class PayeeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    accountNumber: str = Field(min_length=8, max_length=16)
    sortCode: str = "04-29-09"
    nickname: Optional[str] = None


class RecurringIn(BaseModel):
    fromAccountId: int
    toAccountNumber: str
    amount: str
    note: Optional[str] = None
    frequency: str = "MONTHLY"


class CardSettingsIn(BaseModel):
    dailyLimit: Optional[str] = None
    perTxnLimit: Optional[str] = None
    blockedCategories: Optional[List[str]] = None
    contactlessEnabled: Optional[bool] = None
    onlineEnabled: Optional[bool] = None
    atmEnabled: Optional[bool] = None
    internationalEnabled: Optional[bool] = None


class PinIn(BaseModel):
    newPin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=5, max_length=2000)
    relatedReference: Optional[str] = None


@router.get("/overview")
def settings_overview(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    jti: Annotated[Optional[str], Depends(get_token_jti)],
):
    accounts = db.scalars(select(Account).where(Account.user_id == user.id).order_by(Account.type)).all()
    pots = db.scalars(select(Pot).where(Pot.user_id == user.id)).all()
    cards = db.scalars(select(Card).where(Card.user_id == user.id)).all()
    sessions = db.scalars(
        select(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked.is_(False))
        .order_by(AuthSession.last_seen.desc())
    ).all()
    logins = db.scalars(
        select(LoginHistory)
        .where(LoginHistory.user_id == user.id)
        .order_by(LoginHistory.created_at.desc())
        .limit(20)
    ).all()
    payees = db.scalars(
        select(SavedPayee).where(SavedPayee.user_id == user.id).order_by(SavedPayee.name)
    ).all()
    recurring = db.scalars(
        select(RecurringTransfer)
        .where(RecurringTransfer.user_id == user.id)
        .order_by(RecurringTransfer.created_at.desc())
    ).all()
    tickets = db.scalars(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(20)
    ).all()

    pot_by_acct = {p.account_id: p for p in pots}

    def acct_row(a: Account) -> dict:
        pot = pot_by_acct.get(a.id)
        return {
            "id": a.id,
            "type": a.type,
            "accountNumber": a.account_number,
            "currency": a.currency,
            "balance": str(fmt(Decimal(str(a.balance_cache)))),
            "status": a.status,
            "potName": pot.name if pot else None,
        }

    return {
        "profile": _profile_out(user),
        "linkedAccounts": [acct_row(a) for a in accounts],
        "security": {
            "totpEnabled": bool(user.totp_enabled),
            "biometricEnabled": bool(user.biometric_enabled),
            "sessions": [
                {
                    "id": s.id,
                    "ip": s.ip_address,
                    "userAgent": s.user_agent,
                    "createdAt": s.created_at.isoformat() if s.created_at else None,
                    "lastSeen": s.last_seen.isoformat() if s.last_seen else None,
                    "trusted": s.trusted,
                    "current": s.jti == jti,
                }
                for s in sessions
            ],
            "loginActivity": [
                {
                    "id": r.id,
                    "ip": r.ip_address,
                    "userAgent": r.user_agent,
                    "success": r.success,
                    "createdAt": r.created_at.isoformat() if r.created_at else None,
                }
                for r in logins
            ],
        },
        "cards": [
            {
                "id": c.id,
                "maskedNumber": mask_card(c.card_number),
                "isFrozen": c.is_frozen,
                "blockedCategories": [x for x in (c.blocked_categories or "").split(",") if x],
                "dailyLimit": str(c.daily_limit) if c.daily_limit is not None else None,
                "perTxnLimit": str(c.per_txn_limit) if c.per_txn_limit is not None else None,
                "contactlessEnabled": c.contactless_enabled,
                "onlineEnabled": c.online_enabled,
                "atmEnabled": c.atm_enabled,
                "internationalEnabled": c.international_enabled,
            }
            for c in cards
        ],
        "notifications": {
            "prefs": _prefs(user),
            "dailySpendAlert": str(user.daily_spend_alert) if user.daily_spend_alert is not None else None,
        },
        "payments": {
            "defaultAccountId": user.default_account_id,
            "transferLimit": str(user.transfer_limit) if user.transfer_limit is not None else None,
            "payees": [
                {
                    "id": p.id,
                    "name": p.name,
                    "accountNumber": p.account_number,
                    "sortCode": p.sort_code,
                    "nickname": p.nickname,
                }
                for p in payees
            ],
            "recurring": [
                {
                    "id": r.id,
                    "amount": str(r.amount),
                    "note": r.note,
                    "frequency": r.frequency,
                    "status": r.status,
                    "toAccountNumber": r.to_account_number,
                    "nextRun": r.next_run.isoformat() if r.next_run else None,
                }
                for r in recurring
            ],
            "roundUps": {
                "enabled": bool(user.round_ups_enabled),
                "potId": user.round_up_pot_id,
            },
        },
        "privacy": {
            "marketingEmail": bool(user.marketing_email),
            "marketingSms": bool(user.marketing_sms),
            "openBankingShare": bool(user.open_banking_share),
        },
        "app": {
            "preferredCurrency": user.preferred_currency or "GBP",
            "language": user.language or "en-GB",
            "fontScale": user.font_scale or "md",
            "highContrast": bool(user.high_contrast),
        },
        "support": {
            "tickets": [
                {
                    "id": t.id,
                    "subject": t.subject,
                    "status": t.status,
                    "relatedReference": t.related_reference,
                    "createdAt": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tickets
            ],
            "faq": [
                {"q": "How do pots work?", "a": "Pots are sub-accounts with their own balance and optional savings target."},
                {"q": "Are transfers instant?", "a": "Transfers between NovaBank customers settle immediately. External transfers can be simulated as pending."},
                {"q": "Is the health score a credit score?", "a": "No. It is a toy score from your NovaBank activity only."},
            ],
        },
    }


@router.patch("/profile")
def update_profile(
    body: ProfileIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.fullName is not None:
        user.full_name = body.fullName.strip()
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.addressLine is not None:
        user.address_line = body.addressLine.strip() or None
    if body.city is not None:
        user.city = body.city.strip() or None
    if body.postcode is not None:
        user.postcode = body.postcode.strip().upper() or None
    db.add(AuditLog(user_id=user.id, action="PROFILE_UPDATE", details="personal details"))
    db.commit()
    return {"ok": True, "profile": _profile_out(user), "verification": "Email/phone changes would trigger a verification flow in production."}


@router.post("/password")
def change_password(
    body: PasswordIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if not check_password(body.currentPassword, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.newPassword)
    db.add(AuditLog(user_id=user.id, action="PASSWORD_CHANGE", details="ok"))
    db.commit()
    return {"ok": True}


@router.patch("/security")
def security_toggles(
    body: SecurityTogglesIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.totpEnabled is not None:
        user.totp_enabled = body.totpEnabled
    if body.biometricEnabled is not None:
        user.biometric_enabled = body.biometricEnabled
    db.commit()
    return {
        "ok": True,
        "totpEnabled": user.totp_enabled,
        "biometricEnabled": user.biometric_enabled,
        "note": "TOTP/SMS and biometric are toggles for demo — wire a real authenticator app for production.",
    }


@router.post("/sessions/{session_id}/revoke")
def revoke_session(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    jti: Annotated[Optional[str], Depends(get_token_jti)],
):
    session = db.get(AuthSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Not found")
    if session.jti == jti:
        raise HTTPException(400, "Cannot revoke the current session here — use Log out")
    session.revoked = True
    db.commit()
    return {"ok": True}


@router.post("/sessions/revoke-others")
def revoke_other_sessions(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    jti: Annotated[Optional[str], Depends(get_token_jti)],
):
    rows = db.scalars(
        select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked.is_(False))
    ).all()
    count = 0
    for s in rows:
        if s.jti != jti:
            s.revoked = True
            count += 1
    db.add(AuditLog(user_id=user.id, action="SESSIONS_REVOKED", details=str(count)))
    db.commit()
    return {"ok": True, "revoked": count}


@router.post("/sessions/{session_id}/trust")
def trust_session(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    session = db.get(AuthSession, session_id)
    if not session or session.user_id != user.id or session.revoked:
        raise HTTPException(404, "Not found")
    session.trusted = True
    db.commit()
    return {"ok": True, "trusted": True}


@router.patch("/cards/{card_id}")
def update_card_settings(
    card_id: int,
    body: CardSettingsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    card = db.get(Card, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Not found")
    if body.dailyLimit is not None:
        card.daily_limit = money(body.dailyLimit) if body.dailyLimit else None
    if body.perTxnLimit is not None:
        card.per_txn_limit = money(body.perTxnLimit) if body.perTxnLimit else None
    if body.blockedCategories is not None:
        blocked = sorted({c.strip().lower() for c in body.blockedCategories if c.strip()})
        card.blocked_categories = ",".join(blocked) if blocked else None
    if body.contactlessEnabled is not None:
        card.contactless_enabled = body.contactlessEnabled
    if body.onlineEnabled is not None:
        card.online_enabled = body.onlineEnabled
    if body.atmEnabled is not None:
        card.atm_enabled = body.atmEnabled
    if body.internationalEnabled is not None:
        card.international_enabled = body.internationalEnabled
    db.commit()
    return {"ok": True}


@router.post("/cards/{card_id}/pin")
def change_pin(
    card_id: int,
    body: PinIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    card = db.get(Card, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Not found")
    # PIN is never stored — mock acknowledgement only
    db.add(AuditLog(user_id=user.id, action="CARD_PIN_CHANGE", details=mask_card(card.card_number)))
    db.commit()
    return {"ok": True, "message": "PIN updated (mock — not stored)."}


@router.put("/notifications")
def update_notifications(
    body: NotifPrefsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user.notification_prefs = json.dumps(body.prefs)
    if body.dailySpendAlert is not None:
        user.daily_spend_alert = money(body.dailySpendAlert) if body.dailySpendAlert else None
    db.commit()
    return {"ok": True}


@router.put("/payments")
def update_payments_prefs(
    body: PaymentsPrefsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.defaultAccountId is not None:
        acct = db.get(Account, body.defaultAccountId)
        if not acct or acct.user_id != user.id:
            raise HTTPException(400, "Invalid account")
        user.default_account_id = body.defaultAccountId
    if body.transferLimit is not None:
        user.transfer_limit = money(body.transferLimit) if body.transferLimit else None
    db.commit()
    return {"ok": True}


@router.post("/payees")
def add_payee(
    body: PayeeIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    payee = SavedPayee(
        name=body.name.strip(),
        account_number=body.accountNumber.strip(),
        sort_code=body.sortCode.strip(),
        nickname=(body.nickname or "").strip() or None,
        user_id=user.id,
    )
    db.add(payee)
    db.commit()
    db.refresh(payee)
    return {"id": payee.id}


@router.delete("/payees/{payee_id}")
def delete_payee(
    payee_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    payee = db.get(SavedPayee, payee_id)
    if not payee or payee.user_id != user.id:
        raise HTTPException(404, "Not found")
    db.delete(payee)
    db.commit()
    return {"ok": True}


@router.post("/recurring")
def add_recurring(
    body: RecurringIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    acct = db.get(Account, body.fromAccountId)
    if not acct or acct.user_id != user.id:
        raise HTTPException(400, "Invalid account")
    freq = body.frequency.upper()
    if freq not in ("WEEKLY", "MONTHLY"):
        raise HTTPException(400, "Frequency must be WEEKLY or MONTHLY")
    amount = money(body.amount)
    days = 7 if freq == "WEEKLY" else 30
    row = RecurringTransfer(
        amount=fmt(amount),
        note=body.note,
        frequency=freq,
        status="ACTIVE",
        next_run=datetime.utcnow() + timedelta(days=days),
        from_account_id=body.fromAccountId,
        to_account_number=body.toAccountNumber.strip(),
        user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": row.status}


@router.post("/recurring/{item_id}/cancel")
def cancel_recurring(
    item_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    row = db.get(RecurringTransfer, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Not found")
    row.status = "CANCELLED"
    db.commit()
    return {"ok": True}


@router.put("/privacy")
def update_privacy(
    body: PrivacyIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.marketingEmail is not None:
        user.marketing_email = body.marketingEmail
    if body.marketingSms is not None:
        user.marketing_sms = body.marketingSms
    if body.openBankingShare is not None:
        user.open_banking_share = body.openBankingShare
    db.commit()
    return {"ok": True}


@router.put("/app")
def update_app_prefs(
    body: AppPrefsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.preferredCurrency:
        user.preferred_currency = body.preferredCurrency.upper()[:8]
    if body.language:
        user.language = body.language
    if body.fontScale in ("sm", "md", "lg"):
        user.font_scale = body.fontScale
    if body.highContrast is not None:
        user.high_contrast = body.highContrast
    db.commit()
    return {
        "ok": True,
        "app": {
            "preferredCurrency": user.preferred_currency,
            "language": user.language,
            "fontScale": user.font_scale,
            "highContrast": user.high_contrast,
        },
    }


@router.get("/export")
def export_data(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """GDPR-style portable export of account data."""
    accounts = db.scalars(select(Account).where(Account.user_id == user.id)).all()
    payload = {
        "exportedAt": datetime.utcnow().isoformat() + "Z",
        "customer": _profile_out(user),
        "accounts": [
            {
                "accountNumber": a.account_number,
                "type": a.type,
                "currency": a.currency,
                "balance": str(a.balance_cache),
            }
            for a in accounts
        ],
        "note": "Demo export. Production would include full transaction history and identity docs.",
    }
    return JSONResponse(
        payload,
        headers={"Content-Disposition": 'attachment; filename="novabank-export.json"'},
    )


@router.post("/close-account")
def close_account_stub(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return {
        "ok": False,
        "status": "PENDING_REVIEW",
        "message": "Account closure is stubbed. In production this would freeze the account, settle balances, and start a cooling-off period.",
    }


@router.post("/support/tickets")
def create_ticket(
    body: TicketIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    ticket = SupportTicket(
        subject=body.subject.strip(),
        message=body.message.strip(),
        related_reference=body.relatedReference,
        status="OPEN",
        user_id=user.id,
    )
    db.add(ticket)
    db.add(AuditLog(user_id=user.id, action="SUPPORT_TICKET", details=body.subject[:64]))
    db.commit()
    db.refresh(ticket)
    return {"id": ticket.id, "status": ticket.status}
