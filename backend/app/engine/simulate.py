"""Apply proposed operations to an employee-week in memory (used by G8 and the cascade linker)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Literal

from app.engine.detect import Detection, detect, fingerprint
from app.engine.pay import PaySnapshot, pay_snapshot
from app.engine.types import Adjustment, EmployeeWeek, Finding, Op, Punch

PREMIUM_KIND = {
    "meal": "meal_premium",
    "rest": "rest_premium",
    "holiday": "holiday_premium",
    "seventh_day": "seventh_day_premium",
}


class InvalidOp(ValueError):
    """Raised when an operation cannot be applied (bad time, unknown punch, missing field)."""


def parse_local(week: EmployeeWeek, value: str) -> datetime:
    try:
        naive = datetime.strptime(value, "%Y-%m-%dT%H:%M")
    except ValueError as exc:
        raise InvalidOp(f"time '{value}' is not in YYYY-MM-DDTHH:MM format") from exc
    return naive.replace(tzinfo=week.tz).astimezone(UTC)


def apply_ops(
    week: EmployeeWeek, ops: list[Op], rule_id: str, work_date: date, id_prefix: str = "SIM"
) -> EmployeeWeek:
    """Return a new week with the operations applied. Never mutates the input."""
    punches = list(week.punches)
    schedules = list(week.schedules)
    adjustments = list(week.adjustments)
    for i, op in enumerate(ops):
        if op.op == "add_punch":
            if not op.punch_type or not op.at:
                raise InvalidOp("add_punch requires punch_type and at")
            punches.append(
                Punch(f"{id_prefix}-{i}", op.punch_type, parse_local(week, op.at), "correction")
            )
        elif op.op == "void_punch":
            if not any(p.id == op.punch_id for p in punches):
                raise InvalidOp(f"punch {op.punch_id} does not exist")
            punches = [p for p in punches if p.id != op.punch_id]
        elif op.op == "record_premium":
            kind = PREMIUM_KIND.get(op.premium_kind or "")
            if kind is None:
                raise InvalidOp("record_premium requires premium_kind")
            adjustments.append(Adjustment(kind, work_date, float(op.hours or 0.0), rule_id))
        elif op.op == "approve_overtime":
            adjustments.append(
                Adjustment("ot_approval", work_date, float(op.hours or 0.0), rule_id)
            )
        elif op.op == "acknowledge":
            adjustments.append(Adjustment("acknowledged", work_date, 0.0, rule_id))
        elif op.op == "approve_unscheduled":
            adjustments.append(Adjustment("unscheduled_ok", work_date, 0.0, rule_id))
        elif op.op == "reassign_shift":
            if not any(s.id == op.shift_id for s in schedules):
                raise InvalidOp(f"shift {op.shift_id} is not scheduled for this employee")
            schedules = [s for s in schedules if s.id != op.shift_id]
        elif op.op == "escalate":
            continue
        else:
            raise InvalidOp(f"unknown operation {op.op}")
    return week.with_(
        punches=tuple(punches), schedules=tuple(schedules), adjustments=tuple(adjustments)
    )


@dataclass(frozen=True)
class SimResult:
    before: Detection
    after: Detection
    target_cleared: bool
    cleared: list[Finding]
    introduced: list[Finding]
    pay_before: PaySnapshot
    pay_after: PaySnapshot
    status: Literal["ok", "invalid"]
    error: str | None = None


def simulate(week: EmployeeWeek, ops: list[Op], target: Finding) -> SimResult:
    """Detect before and after applying ops; report target clearance, cascade, and new findings."""
    before = detect(week)
    pay_before = pay_snapshot(week, before.shifts, before.params)
    try:
        after_week = apply_ops(week, ops, target.rule_id, target.work_date)
    except InvalidOp as exc:
        return SimResult(before, before, False, [], [], pay_before, pay_before, "invalid", str(exc))
    after = detect(after_week)
    emp = week.employee.id
    b = before.by_fingerprint()
    a = after.by_fingerprint()
    target_fp = fingerprint(emp, target)
    cleared = [f for fp, f in b.items() if fp not in a and fp != target_fp]
    introduced = [f for fp, f in a.items() if fp not in b]
    return SimResult(
        before=before,
        after=after,
        target_cleared=target_fp not in a,
        cleared=cleared,
        introduced=introduced,
        pay_before=pay_before,
        pay_after=pay_snapshot(after_week, after.shifts, after.params),
        status="ok",
    )
