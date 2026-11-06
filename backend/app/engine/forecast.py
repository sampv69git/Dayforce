"""Overtime forecast and compliant shift-swap candidates (TA-4.2, TA-9.1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.engine.detect import Detection, detect
from app.engine.rules import projected_hours
from app.engine.types import EmployeeWeek, Finding, Schedule


@dataclass
class SwapCheck:
    employee_id: str
    name: str
    eligible: bool
    projected_after: float
    rest_before_hours: float | None
    rest_after_hours: float | None
    checks: dict[str, bool] = field(default_factory=dict)
    reason: str | None = None
    rate: float = 0.0


def _shift(det: Detection, shift_id: str) -> Schedule | None:
    return next((s for s in det.week.schedules if s.id == shift_id), None)


def _busy_intervals(week: EmployeeWeek, det: Detection) -> list[tuple[object, object]]:
    spans: list[tuple[object, object]] = [(s.start, s.end) for s in week.schedules]
    for sh in det.shifts:
        if sh.start and sh.end:
            spans.append((sh.start.at, sh.end.at))
    return spans


def _worked_dates(week: EmployeeWeek, det: Detection) -> set[date]:
    dates = {s.work_date for s in det.shifts if s.start is not None}
    dates |= {week.local_date(s.start) for s in week.schedules if s.start > week.now}
    return dates


def evaluate_peer(det: Detection, shift: Schedule, peer: EmployeeWeek) -> SwapCheck:
    """Run every eligibility check for one colleague taking the shift."""
    from datetime import datetime

    me = det.week.employee
    pe = peer.employee
    pdet = detect(peer)
    p = pdet.params
    hours = shift.planned_hours
    _, _, projected, _ = projected_hours(peer, pdet.shifts)
    after = projected + hours
    spans = _busy_intervals(peer, pdet)
    overlaps = any(
        isinstance(a, datetime) and isinstance(b, datetime) and a < shift.end and b > shift.start
        for a, b in spans
    )
    ends_before = [b for a, b in spans if isinstance(b, datetime) and b <= shift.start]
    starts_after = [a for a, b in spans if isinstance(a, datetime) and a >= shift.end]
    rest_before = (shift.start - max(ends_before)).total_seconds() / 3600 if ends_before else None
    rest_after = (min(starts_after) - shift.end).total_seconds() / 3600 if starts_after else None
    dates = _worked_dates(peer, pdet) | {peer.local_date(shift.start)}
    n, cur = 0, peer.local_date(shift.start)
    while cur in dates:
        n += 1
        cur -= timedelta(days=1)
    checks = {
        "same_role": pe.role == me.role,
        "same_site": pe.site.code == me.site.code,
        "non_exempt": not pe.exempt,
        "available": not overlaps,
        "rest_before": rest_before is None or rest_before >= p.rest_min_hours,
        "rest_after": rest_after is None or rest_after >= p.rest_min_hours,
        "stays_under_threshold": after <= p.weekly_ot_hours + 0.0001,
        "no_seventh_day": n <= p.max_consecutive_days,
    }
    labels = {
        "same_role": "different role",
        "same_site": "different site",
        "non_exempt": "exempt",
        "available": "already scheduled or working then",
        "rest_before": "rest before would be too short",
        "rest_after": "rest after would be too short",
        "stays_under_threshold": f"would reach {after:.1f} h (over {p.weekly_ot_hours:.0f} h)",
        "no_seventh_day": "would be a seventh consecutive day",
    }
    failed = [labels[k] for k, ok in checks.items() if not ok]
    return SwapCheck(
        employee_id=pe.id,
        name=pe.name,
        eligible=not failed,
        projected_after=round(after, 2),
        rest_before_hours=round(rest_before, 1) if rest_before is not None else None,
        rest_after_hours=round(rest_after, 1) if rest_after is not None else None,
        checks=checks,
        reason=None if not failed else "; ".join(failed),
        rate=pe.rate,
    )


def swap_candidates(det: Detection, f: Finding, peers: list[EmployeeWeek]) -> list[SwapCheck]:
    shift = _shift(det, str(f.evidence.get("shift_id", "")))
    if shift is None:
        return []
    me = det.week.employee
    pool = [
        w
        for w in peers
        if w.employee.id != me.id
        and w.employee.site.code == me.site.code
        and w.employee.role == me.role
    ]
    results = [evaluate_peer(det, shift, w) for w in pool]
    results.sort(
        key=lambda c: (
            not c.eligible,
            -(det.params.weekly_ot_hours - c.projected_after) if c.eligible else 0,
            c.rate,
            c.name,
        )
    )
    return results


def best_swap(det: Detection, f: Finding, peers: list[EmployeeWeek]) -> str | None:
    for c in swap_candidates(det, f, peers):
        if c.eligible:
            return c.employee_id
    return None
