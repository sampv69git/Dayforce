"""Authentication (signed JWT sessions from password or demo sign-in) and role-based access control.

Deny by default. Every token carries a unique `jti` so a session can be revoked at sign-out, and a
password change ends every session issued before it.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.api.errors import Forbidden, NotFound, Unauthorized
from app.config import get_settings
from app.db import get_session
from app.domain import models as m

SessionDep = Annotated[Session, Depends(get_session)]


@dataclass(frozen=True)
class CurrentUser:
    id: str
    name: str
    role: str  # employee | manager | payroll_admin
    sites: tuple[str, ...]
    employee_id: str | None
    jti: str = ""
    expires_at: int = 0
    auth_method: str = "demo"

    def can_see_site(self, site: str) -> bool:
        return self.role == "payroll_admin" or site in self.sites


def token_ttl_seconds() -> int:
    return get_settings().jwt_ttl_hours * 3600


def issue_token(user: m.User, method: str = "demo") -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": user.id,
        "name": user.display_name,
        "role": user.role,
        "sites": user.site_scope,
        "emp": user.employee_id,
        "amr": method,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=token_ttl_seconds())).timestamp()),
    }
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def current_user(
    session: SessionDep, authorization: Annotated[str | None, Header()] = None
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Sign in to get a bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        c = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat", "jti"]},
        )
    except jwt.PyJWTError as exc:
        raise Unauthorized(f"Invalid or expired session: {exc}") from exc
    if session.get(m.RevokedToken, c["jti"]) is not None:
        raise Unauthorized("This session has been signed out")
    cred = session.get(m.UserCredential, c["sub"])
    if cred is not None and c["iat"] < int(
        cred.password_changed_at.replace(tzinfo=UTC).timestamp()
    ):
        raise Unauthorized("The password changed after this session started; sign in again")
    if session.get(m.User, c["sub"]) is None:
        raise Unauthorized("This account no longer exists")
    return CurrentUser(
        c["sub"],
        c["name"],
        c["role"],
        tuple(c.get("sites") or ()),
        c.get("emp"),
        jti=c["jti"],
        expires_at=int(c["exp"]),
        auth_method=c.get("amr", "demo"),
    )


UserDep = Annotated[CurrentUser, Depends(current_user)]


def require(*roles: str) -> Callable[[CurrentUser], CurrentUser]:
    def dep(user: UserDep) -> CurrentUser:
        if user.role not in roles:
            raise Forbidden(f"This action requires role: {', '.join(roles)}")
        return user

    return dep


ManagerOrAdmin = Annotated[CurrentUser, Depends(require("manager", "payroll_admin"))]
AdminOnly = Annotated[CurrentUser, Depends(require("payroll_admin"))]
EmployeeOnly = Annotated[CurrentUser, Depends(require("employee"))]


def employee_in_scope(session: Session, user: CurrentUser, employee_id: str) -> m.Employee:
    emp = session.get(m.Employee, employee_id)
    if emp is None:
        raise NotFound(f"Employee {employee_id} not found")
    if user.role == "employee":
        if user.employee_id != employee_id:
            raise Forbidden("Employees can only access their own records")
    elif not user.can_see_site(emp.site_code):
        raise Forbidden(f"Site {emp.site_code} is outside your scope")
    return emp


def exception_in_scope(session: Session, user: CurrentUser, exception_id: str) -> m.ExceptionRecord:
    rec = session.get(m.ExceptionRecord, exception_id)
    if rec is None:
        raise NotFound(f"Exception {exception_id} not found")
    employee_in_scope(session, user, rec.employee_id)
    return rec
