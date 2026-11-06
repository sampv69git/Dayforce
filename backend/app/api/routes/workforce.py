"""Timecards, what-if simulation, overtime forecast, employee self-service."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter

from app.api.deps import (
    EmployeeOnly,
    ManagerOrAdmin,
    SessionDep,
    UserDep,
    employee_in_scope,
    exception_in_scope,
)
from app.api.errors import Forbidden
from app.contracts import api
from app.engine.simulate import simulate as run_simulation
from app.harness.context import build_context
from app.harness.gates import to_engine_ops
from app.services import decisions, insights, views

router = APIRouter()


@router.get("/timecards/{employee_id}", response_model=api.Timecard, tags=["timecards"])
def timecard(employee_id: str, user: UserDep, session: SessionDep) -> api.Timecard:
    """Weekly timecard: shift ribbon data, pay, exceptions, and the revision history."""
    emp = employee_in_scope(session, user, employee_id)
    return views.timecard(session, emp)


@router.post("/simulate", response_model=api.SimulationResult, tags=["timecards"])
def simulate(
    req: api.SimulateRequest, user: ManagerOrAdmin, session: SessionDep
) -> api.SimulationResult:
    """What-if: apply operations in memory and report exceptions and pay before and after."""
    exception_in_scope(session, user, req.exception_id)
    ctx = build_context(session, req.exception_id)
    sim = run_simulation(ctx.week, to_engine_ops(req.operations), ctx.finding)
    return api.SimulationResult(
        target_cleared=sim.target_cleared,
        cleared=[f.rule_id for f in sim.cleared],
        introduced=[f.rule_id for f in sim.introduced],
        pay_before=api.PaySnapshot(**sim.pay_before.as_dict()),
        pay_after=api.PaySnapshot(**sim.pay_after.as_dict()),
        error=sim.error,
    )


@router.get("/forecast/overtime", response_model=api.OvertimeForecast, tags=["forecast"])
def forecast(
    user: ManagerOrAdmin, session: SessionDep, site: Literal["FRE", "AUS", "BLR"] | None = None
) -> api.OvertimeForecast:
    """Projected weekly hours, overtime risks, and rule-checked swap candidates."""
    target = site or (user.sites[0] if user.sites else "FRE")
    if not user.can_see_site(target):
        raise Forbidden(f"Site {target} is outside your scope")
    return insights.forecast(session, target)


@router.get("/me/actions", response_model=api.EmployeeHome, tags=["employee"])
def my_actions(user: EmployeeOnly, session: SessionDep) -> api.EmployeeHome:
    """Employee home: confirmation requests and this week's hours."""
    assert user.employee_id
    return insights.employee_home(session, user.employee_id)


@router.post("/attestations", response_model=api.Attestation, status_code=201, tags=["employee"])
def attest(req: api.AttestationRequest, user: EmployeeOnly, session: SessionDep) -> api.Attestation:
    """Employee confirms a time. The note is untrusted input and is scanned before storage."""
    return decisions.submit_attestation(session, user, req)
