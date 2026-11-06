"""Pay calculation for one employee-week. Code computes pay; the model never does."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from app.engine.params import PolicyParams
from app.engine.types import EmployeeWeek, Shift


@dataclass(frozen=True)
class PaySnapshot:
    regular_hours: float
    overtime_hours: float
    double_time_hours: float
    premium_hours: float
    cost: float
    currency: str
    unpaid_shifts: int

    @property
    def paid_hours(self) -> float:
        return self.regular_hours + self.overtime_hours + self.double_time_hours

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["cost"] = {"amount": round(self.cost, 2), "currency": self.currency}
        d.pop("currency")
        for k in ("regular_hours", "overtime_hours", "double_time_hours", "premium_hours"):
            d[k] = round(d[k], 2)
        return d


@dataclass(frozen=True)
class HoursSplit:
    regular: float
    overtime: float
    double_time: float
    daily_ot_by_date: dict[date, tuple[float, float]]
    weekly_ot: float


def daily_hours(week: EmployeeWeek, shifts: list[Shift]) -> dict[date, float]:
    """Worked hours of complete shifts in the current week, keyed by local work date."""
    by_day: dict[date, float] = defaultdict(float)
    for s in shifts:
        if s.complete and week.in_week(s.work_date):
            by_day[s.work_date] += s.worked_hours or 0.0
    return dict(by_day)


def split_hours(week: EmployeeWeek, shifts: list[Shift], params: PolicyParams) -> HoursSplit:
    days = daily_hours(week, shifts)
    if week.employee.exempt:
        return HoursSplit(sum(days.values()), 0.0, 0.0, {}, 0.0)
    regular = overtime = double = 0.0
    daily_ot: dict[date, tuple[float, float]] = {}
    for d, h in sorted(days.items()):
        if params.daily_ot_hours is None:
            regular += h
            continue
        reg = min(h, params.daily_ot_hours)
        if params.daily_dt_hours is not None:
            ot = min(
                max(h - params.daily_ot_hours, 0.0), params.daily_dt_hours - params.daily_ot_hours
            )
            dt = max(h - params.daily_dt_hours, 0.0)
        else:
            ot, dt = max(h - params.daily_ot_hours, 0.0), 0.0
        regular += reg
        overtime += ot
        double += dt
        if ot > 0 or dt > 0:
            daily_ot[d] = (ot, dt)
    weekly_ot = max(regular - params.weekly_ot_hours, 0.0)
    regular -= weekly_ot
    overtime += weekly_ot
    return HoursSplit(regular, overtime, double, daily_ot, weekly_ot)


def pay_snapshot(week: EmployeeWeek, shifts: list[Shift], params: PolicyParams) -> PaySnapshot:
    split = split_hours(week, shifts, params)
    premium_hours = 0.0
    meal_days: set[date] = set()
    for adj in week.adjustments:
        if not week.in_week(adj.work_date):
            continue
        if adj.kind == "meal_premium":
            if adj.work_date in meal_days:
                continue  # at most one meal premium per workday (CA-4.4)
            meal_days.add(adj.work_date)
            premium_hours += adj.hours
        elif adj.kind in {"rest_premium", "holiday_premium", "seventh_day_premium"}:
            premium_hours += adj.hours
    rate = week.employee.rate
    cost = rate * (
        split.regular
        + split.overtime * params.ot_multiplier
        + split.double_time * params.dt_multiplier
        + premium_hours
    )
    unpaid = sum(
        1 for s in shifts if not s.complete and not s.in_progress and week.in_week(s.work_date)
    )
    return PaySnapshot(
        regular_hours=split.regular,
        overtime_hours=split.overtime,
        double_time_hours=split.double_time,
        premium_hours=premium_hours,
        cost=cost,
        currency=week.employee.site.currency,
        unpaid_shifts=unpaid,
    )
