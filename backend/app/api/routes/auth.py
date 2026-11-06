"""Demo sign-in. Personas are seeded users; tokens are signed JWTs (not production identity)."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import SessionDep, UserDep, issue_token
from app.api.errors import NotFound
from app.contracts import api
from app.domain import models as m

router = APIRouter(tags=["auth"])


def _user(u: m.User) -> api.User:
    return api.User(
        user_id=u.id,
        display_name=u.display_name,
        role=u.role,  # type: ignore[arg-type]
        site_scope=u.site_scope,
        employee_id=u.employee_id,
    )


@router.get("/auth/personas", response_model=list[api.Persona])
def personas(session: SessionDep) -> list[api.Persona]:
    """Seeded demo personas with a one-line status for the sign-in screen."""
    out: list[api.Persona] = []
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
    """Issue a signed token for a seeded persona."""
    user = session.get(m.User, req.user_id)
    if user is None:
        raise NotFound(f"Persona {req.user_id} not found")
    return api.TokenResponse(access_token=issue_token(user), user=_user(user))


@router.get("/me", response_model=api.User)
def me(user: UserDep, session: SessionDep) -> api.User:
    row = session.get(m.User, user.id)
    if row is None:
        raise NotFound("User not found")
    return _user(row)
