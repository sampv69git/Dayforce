"""Pair raw punches into shifts and match them to schedules.

All arithmetic uses UTC instants, so overnight shifts and daylight-saving changes are measured in
real elapsed time. Day boundaries use the site's local time zone (policy TA-1.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from app.engine.params import PolicyParams
from app.engine.types import EmployeeWeek, Meal, Punch, Schedule, Shift


@dataclass
class _Draft:
    start: Punch | None
    end: Punch | None = None
    meals: list[Meal] = field(default_factory=list)


def find_duplicates(
    punches: list[Punch], window_minutes: float
) -> tuple[list[Punch], list[tuple[Punch, Punch]]]:
    """Split punches into kept punches and (first, duplicate) pairs of the same type within the window."""
    kept: list[Punch] = []
    dups: list[tuple[Punch, Punch]] = []
    for p in punches:
        prev = kept[-1] if kept else None
        if prev and prev.type == p.type and (p.at - prev.at) <= timedelta(minutes=window_minutes):
            dups.append((prev, p))
            continue
        kept.append(p)
    return kept, dups


def _raw_shifts(punches: list[Punch]) -> list[_Draft]:
    out: list[_Draft] = []
    cur: _Draft | None = None
    for p in punches:
        if p.type == "IN":
            if cur is not None and cur.start is not None:
                out.append(cur)  # previous shift never got an OUT
            cur = _Draft(start=p)  # orphan meal punches without a shift are dropped
        elif p.type == "MEAL_START":
            if cur is None:
                cur = _Draft(start=None)
            cur.meals.append(Meal(start=p, end=None))
        elif p.type == "MEAL_END":
            if cur is not None and cur.meals and cur.meals[-1].end is None:
                cur.meals[-1] = Meal(start=cur.meals[-1].start, end=p)
        elif p.type == "OUT":
            if cur is None:
                out.append(_Draft(start=None, end=p))
            else:
                cur.end = p
                out.append(cur)
                cur = None
    if cur is not None and (cur.start is not None or cur.end is not None):
        out.append(cur)
    return out


def _overlap(a0: object, a1: object, b0: object, b1: object) -> float:
    from datetime import datetime

    assert isinstance(a0, datetime) and isinstance(a1, datetime)
    assert isinstance(b0, datetime) and isinstance(b1, datetime)
    return max(0.0, (min(a1, b1) - max(a0, b0)).total_seconds())


def match_schedule(
    start: Punch | None, end: Punch | None, schedules: list[Schedule]
) -> Schedule | None:
    """Pick the schedule with the largest overlap, or the nearest start within 4 hours."""
    if start is None and end is None:
        return None
    s0 = start.at if start else end.at - timedelta(hours=8)  # type: ignore[union-attr]
    s1 = end.at if end else start.at + timedelta(hours=8)  # type: ignore[union-attr]
    best: Schedule | None = None
    best_score = 0.0
    for sc in schedules:
        score = _overlap(s0, s1, sc.start, sc.end)
        if score <= 0:
            anchor = start.at if start else s1
            ref = sc.start if start else sc.end
            if abs(anchor - ref) <= timedelta(hours=4):
                score = 1.0
        if score > best_score:
            best, best_score = sc, score
    return best


def pair_shifts(
    week: EmployeeWeek, params: PolicyParams
) -> tuple[list[Shift], list[tuple[Punch, Punch]]]:
    """Return shifts (sorted by time) and duplicate punch pairs."""
    ordered = sorted(week.punches, key=lambda p: (p.at, p.id))
    kept, dups = find_duplicates(ordered, params.duplicate_window_minutes)
    drafts = _raw_shifts(kept)
    remaining = sorted(week.schedules, key=lambda s: s.start)
    shifts: list[Shift] = []
    for d in drafts:
        sched = match_schedule(d.start, d.end, remaining)
        if sched is not None:
            remaining = [s for s in remaining if s.id != sched.id]
        anchor = d.start or d.end
        assert anchor is not None
        in_progress = False
        if d.start is not None and d.end is None:
            expected_end = sched.end if sched else d.start.at + timedelta(hours=9)
            in_progress = week.now < expected_end + timedelta(
                minutes=params.missing_out_grace_minutes
            )
        shifts.append(
            Shift(
                start=d.start,
                end=d.end,
                meals=tuple(d.meals),
                schedule=sched,
                work_date=week.local_date(anchor.at),
                in_progress=in_progress,
            )
        )
    shifts.sort(key=lambda s: (s.start or s.end).at)  # type: ignore[union-attr]
    return shifts, dups
