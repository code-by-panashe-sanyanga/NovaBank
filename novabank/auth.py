from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Annotated, Optional, Tuple

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from novabank.config import JWT_HOURS, SECRET_KEY
from novabank.database import get_db
from novabank.models import AuthSession, User

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def make_token(user_id: int, role: str, jti: Optional[str] = None) -> Tuple[str, str]:
    """Return (jwt, jti). Caller must persist AuthSession for the jti."""
    token_jti = jti or secrets.token_urlsafe(24)
    payload = {
        "id": user_id,
        "role": role,
        "jti": token_jti,
        "exp": datetime.utcnow() + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256"), token_jti


def create_session(
    db: Session,
    user_id: int,
    jti: str,
    request: Optional[Request] = None,
    trusted: bool = False,
) -> AuthSession:
    session = AuthSession(
        jti=jti,
        user_id=user_id,
        ip_address=request.client.host if request and request.client else "",
        user_agent=((request.headers.get("user-agent") if request else "") or "")[:300],
        trusted=trusted,
    )
    db.add(session)
    return session


def get_current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not creds:
        raise HTTPException(401, "Unauthorised")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Unauthorised")
    user = db.get(User, payload.get("id"))
    if not user:
        raise HTTPException(401, "Unauthorised")
    if user.is_locked:
        raise HTTPException(403, "Account locked")
    jti = payload.get("jti")
    if not jti:
        raise HTTPException(401, "Unauthorised")
    session = db.scalar(
        select(AuthSession).where(AuthSession.jti == jti, AuthSession.revoked.is_(False))
    )
    if not session:
        raise HTTPException(401, "Session expired")
    session.last_seen = datetime.utcnow()
    return user


def get_token_jti(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
) -> Optional[str]:
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload.get("jti")
    except jwt.PyJWTError:
        return None


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "ADMIN":
        raise HTTPException(403, "Forbidden")
    return user


# Simple in-memory rate limit for auth endpoints (per IP)
_auth_hits: dict[str, list[float]] = {}


def rate_limit_auth(request: Request, limit: int = 20, window: int = 60) -> None:
    import time

    ip = request.client.host if request.client else "unknown"
    now = time.time()
    hits = [t for t in _auth_hits.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(429, "Too many requests")
    hits.append(now)
    _auth_hits[ip] = hits
