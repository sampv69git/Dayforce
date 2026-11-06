"""Run every rule for an employee-week, apply human resolutions, and fingerprint findings."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app.engine import rules
from app.engine.catalog import RULES
from app.engine.pairing import pair_shifts
from app.engine.params import PolicyParams, params_for
from app.engine.types import EmployeeWeek, Finding, Shift

# Adjustment kinds that resolve a finding for the same rule and work date.
RESOLVING_KINDS = {
    "meal_premium",
    "rest_premium",
    "holiday_premium",
    "seventh_day_premium",
    "ot_approval",
    "acknowledged",
    "unscheduled_ok",
}


def fingerprint(employee_id: str, f: Finding) -> str:
    raw = f"{f.rule_id}|{employee_id}|{f.work_date.isoformat()}|{f.discriminator}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


@dataclass(frozen=True)
class Detection:
    week: EmployeeWeek
    params: PolicyParams
    shifts: list[Shift]
    findings: list[Finding]

    def by_fingerprint(self) -> dict[str, Finding]:
        return {fingerprint(self.week.employee.id, f): f for f in self.findings}


def _resolved(week: EmployeeWeek, f: Finding) -> bool:
    return any(
        a.kind in RESOLVING_KINDS and a.rule_id == f.rule_id and a.work_date == f.work_date
        for a in week.adjustments
    )


def detect(week: EmployeeWeek) -> Detection:
    """Detect all exceptions for the current week of one employee."""
    p = params_for(week.employee.site.jurisdiction)
    shifts, dups = pair_shifts(week, p)
    found: list[Finding] = []
    found += rules.r_punch_integrity(week, shifts, dups, p)
    found += rules.r_schedule(week, shifts, p)
    found += rules.r_meals(week, shifts, p)
    found += rules.r_rest(week, shifts, p)
    found += rules.r_overtime(week, shifts, p)
    found += rules.r_consecutive(week, shifts, p)
    found += rules.r_holiday(week, shifts, p)
    found += rules.r_forecast(week, shifts, p)
    kept = [f for f in found if f.rule_id in RULES and not _resolved(week, f)]
    kept.sort(key=lambda f: (f.work_date, f.rule_id, f.discriminator))
    return Detection(week=week, params=p, shifts=shifts, findings=kept)
