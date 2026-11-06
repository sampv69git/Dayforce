"""Authentication (demo sign-in with signed JWT) and role-based access control. Deny by default."""

from __future__ import annotations

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

    def can_see_site(self, site: str) -> bool:
        return self.role == "payroll_admin" or site in self.sites


def issue_token(user: m.User) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": user.id,
        "name": user.display_name,
        "role": user.role,
        "sites": user.site_scope,
        "emp": user.employee_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=s.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Sign in with a demo persona to get a bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        c = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise Unauthorized(f"Invalid token: {exc}") from exc
    return CurrentUser(c["sub"], c["name"], c["role"], tuple(c.get("sites") or ()), c.get("emp"))


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
