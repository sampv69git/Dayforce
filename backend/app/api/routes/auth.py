"""Sign-in: email and password with lockout and revocable sessions, plus optional persona sign-in
for the demo. Tokens are short-lived signed JWTs; see SECURITY.md for the threat model."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import SessionDep, UserDep, issue_token, token_ttl_seconds
from app.api.errors import Forbidden, NotFound, TooManyAttempts, Unauthorized, Unprocessable
from app.audit import chain
from app.auth.passwords import (
    DUMMY_HASH,
    MIN_LENGTH,
    hash_password,
    policy_problems,
    verify_password,
)
from app.config import get_settings
from app.contracts import api
from app.domain import models as m

router = APIRouter(tags=["auth"])

INVALID = "Email or password is incorrect"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _user(session: Session, u: m.User, method: str | None = None) -> api.User:
    cred = session.get(m.UserCredential, u.id)
    return api.User(
        user_id=u.id,
        display_name=u.display_name,
        role=u.role,  # type: ignore[arg-type]
        site_scope=u.site_scope,
        employee_id=u.employee_id,
        email=cred.email if cred else None,
        auth_method=method,  # type: ignore[arg-type]
    )


def _audit(session: Session, actor: str, role: str, event: str, payload: dict[str, object]) -> None:
    chain.append(
        session,
        actor_id=actor,
        actor_role=role,
        event_type=event,
        entity_type="session",
        entity_id=actor,
        payload=payload,
    )


@router.get("/auth/config", response_model=api.AuthConfig)
def auth_config() -> api.AuthConfig:
    """Which sign-in methods are available, for the sign-in screen."""
    s = get_settings()
    return api.AuthConfig(
        demo_login=s.demo_login_enabled,
        min_password_length=MIN_LENGTH,
        lockout_after_attempts=s.login_max_attempts,
    )


@router.post(
    "/auth/login",
    response_model=api.TokenResponse,
    responses={429: api._problem("Too many failed attempts; try again later")},
)
def login(req: api.LoginRequest, session: SessionDep) -> api.TokenResponse:
    """Sign in with email and password. Failures are generic; repeated failures lock the account."""
    s = get_settings()
    email = req.email.strip().lower()
    cred = session.scalars(select(m.UserCredential).where(m.UserCredential.email == email)).first()
    now = _now()
    if cred is None:
        verify_password(req.password, DUMMY_HASH)  # same work as a real check
        _audit(
            session,
            "anonymous",
            "anonymous",
            "auth.login_failed",
            {
                "reason": "unknown_email",
                "email_sha256": hashlib.sha256(email.encode()).hexdigest()[:16],
            },
        )
        session.commit()
        raise Unauthorized(INVALID)
    user = session.get(m.User, cred.user_id)
    assert user is not None
    if cred.locked_until and cred.locked_until > now:
        wait = int((cred.locked_until - now).total_seconds()) + 1
        raise TooManyAttempts(
            f"Too many failed attempts. Try again in {max(1, round(wait / 60))} minute(s).", wait
        )
    if not verify_password(req.password, cred.password_hash):
        cred.failed_attempts += 1
        payload: dict[str, object] = {"reason": "bad_password", "attempt": cred.failed_attempts}
        if cred.failed_attempts >= s.login_max_attempts:
            cred.locked_until = now + timedelta(minutes=s.login_lockout_minutes)
            cred.failed_attempts = 0
            payload["locked_minutes"] = s.login_lockout_minutes
            _audit(session, user.id, user.role, "auth.locked", payload)
            session.commit()
            raise TooManyAttempts(
                f"Too many failed attempts. The account is locked for {s.login_lockout_minutes} minutes.",
                s.login_lockout_minutes * 60,
            )
        _audit(session, user.id, user.role, "auth.login_failed", payload)
        session.commit()
        raise Unauthorized(INVALID)
    cred.failed_attempts = 0
    cred.locked_until = None
    cred.last_login_at = now
    _audit(session, user.id, user.role, "auth.login", {"method": "password"})
    session.commit()
    return api.TokenResponse(
        access_token=issue_token(user, "password"),
        expires_in=token_ttl_seconds(),
        user=_user(session, user, "password"),
    )


@router.post("/auth/logout", response_model=api.SignedOut)
def logout(user: UserDep, session: SessionDep) -> api.SignedOut:
    """End this session: the token is refused from now until it would have expired."""
    if session.get(m.RevokedToken, user.jti) is None:
        session.add(
            m.RevokedToken(
                jti=user.jti,
                user_id=user.id,
                revoked_at=_now(),
                expires_at=datetime.fromtimestamp(user.expires_at, UTC).replace(tzinfo=None),
            )
        )
    # Housekeeping: entries past expiry can never be presented again.
    session.query(m.RevokedToken).filter(m.RevokedToken.expires_at < _now()).delete()
    _audit(session, user.id, user.role, "auth.logout", {"method": user.auth_method})
    session.commit()
    return api.SignedOut()


@router.post("/auth/password", response_model=api.TokenResponse)
def change_password(
    req: api.ChangePasswordRequest, user: UserDep, session: SessionDep
) -> api.TokenResponse:
    """Change your password. Every other session ends; this one continues with a fresh token."""
    cred = session.get(m.UserCredential, user.id)
    row = session.get(m.User, user.id)
    if cred is None or row is None:
        raise NotFound("This account has no password sign-in")
    if not verify_password(req.current_password, cred.password_hash):
        raise Forbidden("Current password is incorrect")
    problems = policy_problems(req.new_password, cred.email)
    if req.new_password == req.current_password:
        problems.append("Choose a password you have not just used.")
    if problems:
        raise Unprocessable(" ".join(problems))
    cred.password_hash = hash_password(req.new_password)
    # Sessions issued before this second are refused; the current token is revoked explicitly.
    cred.password_changed_at = _now().replace(microsecond=0)
    session.add(
        m.RevokedToken(
            jti=user.jti,
            user_id=user.id,
            revoked_at=_now(),
            expires_at=datetime.fromtimestamp(user.expires_at, UTC).replace(tzinfo=None),
        )
    )
    _audit(session, user.id, user.role, "auth.password_changed", {})
    session.commit()
    return api.TokenResponse(
        access_token=issue_token(row, "password"),
        expires_in=token_ttl_seconds(),
        user=_user(session, row, "password"),
    )


@router.get("/auth/personas", response_model=list[api.Persona])
def personas(session: SessionDep) -> list[api.Persona]:
    """Seeded demo personas with a one-line status for the sign-in screen (empty when persona
    sign-in is disabled)."""
    out: list[api.Persona] = []
    if not get_settings().demo_login_enabled:
        return out
    for u in session.scalars(select(m.User).order_by(m.User.sort_order)):
        active = ("open", "suggested", "awaiting_employee", "escalated")
        q = select(func.count(m.ExceptionRecord.id)).join(
            m.Employee, m.Employee.id == m.ExceptionRecord.employee_id
        )
        if u.role == "manager":
            n = session.scalar(
                q.where(
                    m.Employee.site_code.in_(u.site_scope), m.ExceptionRecord.status.in_(active)
                )
            )
            summary = f"{n} open exceptions"
        elif u.role == "payroll_admin":
            n = session.scalar(q.where(m.ExceptionRecord.status == "escalated"))
            summary = f"{n} escalations across 3 sites"
        else:
            n = session.scalar(
                q.where(
                    m.ExceptionRecord.employee_id == u.employee_id,
                    m.ExceptionRecord.status == "awaiting_employee",
                )
            )
            summary = f"{n} action(s) needed"
        out.append(
            api.Persona(
                user_id=u.id,
                display_name=u.display_name,
                role=u.role,  # type: ignore[arg-type]
                title=u.title,
                site=u.site_scope[0] if len(u.site_scope) == 1 else None,
                summary=summary,
            )
        )
    return out


@router.post("/auth/demo-login", response_model=api.TokenResponse)
def demo_login(req: api.DemoLoginRequest, session: SessionDep) -> api.TokenResponse:
    """Issue a signed token for a seeded persona (demo only; disable with DEMO_LOGIN_ENABLED)."""
    if not get_settings().demo_login_enabled:
        raise Forbidden("Persona sign-in is disabled; sign in with email and password")
    user = session.get(m.User, req.user_id)
    if user is None:
        raise NotFound(f"Persona {req.user_id} not found")
    return api.TokenResponse(
        access_token=issue_token(user, "demo"),
        expires_in=token_ttl_seconds(),
        user=_user(session, user, "demo"),
    )


@router.get("/me", response_model=api.User)
def me(user: UserDep, session: SessionDep) -> api.User:
    row = session.get(m.User, user.id)
    if row is None:
        raise NotFound("User not found")
    return _user(session, row, user.auth_method)
