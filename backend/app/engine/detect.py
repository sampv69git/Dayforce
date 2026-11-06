"""Run every rule for an employee-week, apply human resolutions, and fingerprint findings."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app.engine import rules
from app.engine.catalog import RULES
from app.engine.pairing import pair_shifts
from app.engine.params import PolicyParams, params_for
from app.engine.types import EmployeeWeek, Finding, Shift

# Which human-approved adjustment kinds can resolve each rule. Punch-integrity rules are absent on
# purpose: a missing or duplicate punch can only be fixed by changing punches, never acknowledged away.
RESOLVED_BY: dict[str, set[str]] = {
    "R-SCHED-UNSCHEDULED": {"unscheduled_ok"},
    "R-SCHED-TARDY": {"acknowledged"},
    "R-SCHED-EARLY-OUT": {"acknowledged"},
    "R-MEAL-MISSED": {"meal_premium", "acknowledged"},
    "R-MEAL-LATE": {"meal_premium", "acknowledged"},
    "R-MEAL-SHORT": {"meal_premium", "acknowledged"},
    "R-REST-MIN": {"acknowledged", "rest_premium"},
    "R-OT-DAILY": {"ot_approval"},
    "R-OT-WEEKLY": {"ot_approval"},
    "R-DAYS-CONSECUTIVE": {"acknowledged", "seventh_day_premium"},
    "R-HOLIDAY-WORK": {"holiday_premium"},
    "F-OT-RISK": {"ot_approval"},
    "F-SCHED-CONFLICT": set(),  # cleared only by changing the schedule
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
    kinds = RESOLVED_BY.get(f.rule_id, set())
    if week.employee.site.jurisdiction == "US-CA" and f.rule_id.startswith("R-MEAL-"):
        kinds = {"meal_premium"}  # CA-4.5: the premium is the only correction for a meal violation
    return any(
        a.kind in kinds and a.rule_id == f.rule_id and a.work_date == f.work_date
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
    found += rules.r_schedule_conflict(week, shifts, p)
    kept = [f for f in found if f.rule_id in RULES and not _resolved(week, f)]
    kept.sort(key=lambda f: (f.work_date, f.rule_id, f.discriminator))
    return Detection(week=week, params=p, shifts=shifts, findings=kept)
