"""Deterministic detection rules. Each rule returns findings with evidence and a plain summary."""

from __future__ import annotations

import itertools
from datetime import date, datetime, timedelta

from app.engine.params import PolicyParams
from app.engine.pay import daily_hours, split_hours
from app.engine.types import EmployeeWeek, Finding, Punch, Schedule, Shift


def fmt_local(week: EmployeeWeek, dt: datetime) -> str:
    return week.local(dt).strftime("%Y-%m-%dT%H:%M")


def hhmm(week: EmployeeWeek, dt: datetime) -> str:
    return week.local(dt).strftime("%H:%M")


def _day(d: date) -> str:
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def r_punch_integrity(
    week: EmployeeWeek, shifts: list[Shift], dups: list[tuple[Punch, Punch]], p: PolicyParams
) -> list[Finding]:
    out: list[Finding] = []
    for first, dup in dups:
        d = week.local_date(dup.at)
        if not week.in_week(d):
            continue
        gap = (dup.at - first.at).total_seconds() / 60
        out.append(
            Finding(
                "R-PUNCH-DUPLICATE",
                d,
                dup.id,
                {
                    "punch_id": dup.id,
                    "punch_type": dup.type,
                    "at": fmt_local(week, dup.at),
                    "first_punch_id": first.id,
                    "first_at": fmt_local(week, first.at),
                    "gap_minutes": round(gap, 1),
                },
                f"Two {dup.type} punches {gap:.0f} minutes apart on {_day(d)} "
                f"({hhmm(week, first.at)} and {hhmm(week, dup.at)}).",
            )
        )
    for s in shifts:
        if not week.in_week(s.work_date):
            continue
        sched = s.schedule
        if s.start is None and s.end is not None:
            out.append(
                Finding(
                    "R-PUNCH-MISSING-IN",
                    s.work_date,
                    s.end.id,
                    {
                        "out_punch_id": s.end.id,
                        "out_at": fmt_local(week, s.end.at),
                        "scheduled_start": fmt_local(week, sched.start) if sched else None,
                        "schedule_id": sched.id if sched else None,
                    },
                    f"OUT at {hhmm(week, s.end.at)} on {_day(s.work_date)} has no matching IN punch.",
                )
            )
        elif s.start is not None and s.end is None and not s.in_progress:
            out.append(
                Finding(
                    "R-PUNCH-MISSING-OUT",
                    s.work_date,
                    s.start.id,
                    {
                        "in_punch_id": s.start.id,
                        "in_at": fmt_local(week, s.start.at),
                        "scheduled_end": fmt_local(week, sched.end) if sched else None,
                        "schedule_id": sched.id if sched else None,
                    },
                    f"IN at {hhmm(week, s.start.at)} on {_day(s.work_date)} has no OUT punch.",
                )
            )
        elif s.complete and (s.elapsed_hours or 0) > p.span_max_hours:
            assert s.start and s.end
            out.append(
                Finding(
                    "R-PUNCH-SPAN",
                    s.work_date,
                    s.start.id,
                    {
                        "in_punch_id": s.start.id,
                        "out_punch_id": s.end.id,
                        "span_start": fmt_local(week, s.start.at),
                        "span_end": fmt_local(week, s.end.at),
                        "span_hours": round(s.elapsed_hours or 0, 2),
                        "schedule_id": sched.id if sched else None,
                    },
                    f"One recorded span from {_day(s.work_date)} {hhmm(week, s.start.at)} to "
                    f"{_day(week.local_date(s.end.at))} {hhmm(week, s.end.at)} "
                    f"({s.elapsed_hours:.1f} h), which covers the gap between two scheduled shifts.",
                )
            )
        if s.complete:
            for m in s.meals:
                if m.end is None:
                    out.append(
                        Finding(
                            "R-BREAK-UNPAIRED",
                            s.work_date,
                            m.start.id,
                            {
                                "meal_start_id": m.start.id,
                                "meal_start": fmt_local(week, m.start.at),
                                "shift_end": fmt_local(week, s.end.at),  # type: ignore[union-attr]
                            },
                            f"Meal started at {hhmm(week, m.start.at)} on {_day(s.work_date)} with no "
                            "meal end punch.",
                        )
                    )
    return out


def r_schedule(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    out: list[Finding] = []
    for s in shifts:
        if not week.in_week(s.work_date) or s.in_progress:
            continue
        sched = s.schedule
        if sched is None and s.complete:
            assert s.start and s.end
            out.append(
                Finding(
                    "R-SCHED-UNSCHEDULED",
                    s.work_date,
                    s.start.id,
                    {
                        "in_at": fmt_local(week, s.start.at),
                        "out_at": fmt_local(week, s.end.at),
                        "worked_hours": round(s.worked_hours or 0, 2),
                    },
                    f"Worked {s.worked_hours:.2f} h on {_day(s.work_date)} with no published schedule.",
                )
            )
            continue
        if sched is None:
            continue
        if s.start is not None:
            late = (s.start.at - sched.start).total_seconds() / 60
            if late > p.tardy_grace_minutes:
                out.append(
                    Finding(
                        "R-SCHED-TARDY",
                        s.work_date,
                        s.start.id,
                        {
                            "in_at": fmt_local(week, s.start.at),
                            "scheduled_start": fmt_local(week, sched.start),
                            "minutes_late": round(late),
                        },
                        f"Clocked in at {hhmm(week, s.start.at)}, {late:.0f} minutes after the "
                        f"scheduled {hhmm(week, sched.start)} start.",
                    )
                )
        if s.end is not None and (s.elapsed_hours or 0) <= p.span_max_hours:
            early = (sched.end - s.end.at).total_seconds() / 60
            if early > p.tardy_grace_minutes:
                out.append(
                    Finding(
                        "R-SCHED-EARLY-OUT",
                        s.work_date,
                        s.end.id,
                        {
                            "out_at": fmt_local(week, s.end.at),
                            "scheduled_end": fmt_local(week, sched.end),
                            "minutes_early": round(early),
                        },
                        f"Clocked out at {hhmm(week, s.end.at)}, {early:.0f} minutes before the "
                        f"scheduled {hhmm(week, sched.end)} end.",
                    )
                )
    return out


def _segments(s: Shift) -> list[float]:
    """Continuous work segments in hours, split by completed meals."""
    assert s.start and s.end
    points = [s.start.at]
    for m in s.meals:
        if m.end is not None:
            points += [m.start.at, m.end.at]
    points.append(s.end.at)
    return [(points[i + 1] - points[i]).total_seconds() / 3600 for i in range(0, len(points), 2)]


def r_meals(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    if week.employee.exempt:
        return []
    out: list[Finding] = []
    for s in shifts:
        if not s.complete or not week.in_week(s.work_date):
            continue
        assert s.start and s.end
        worked = s.worked_hours or 0.0
        meals = [m for m in s.meals if m.end is not None]
        base = {
            "in_at": fmt_local(week, s.start.at),
            "out_at": fmt_local(week, s.end.at),
            "worked_hours": round(worked, 2),
        }
        if p.meal_mode == "ca":
            if worked > p.meal_after_hours:
                if not meals:
                    out.append(
                        Finding(
                            "R-MEAL-MISSED",
                            s.work_date,
                            "first",
                            base,
                            f"Worked {worked:.2f} h on {_day(s.work_date)} with no meal period.",
                        )
                    )
                else:
                    first = meals[0]
                    into = (first.start.at - s.start.at).total_seconds() / 3600
                    if into > p.meal_after_hours:
                        out.append(
                            Finding(
                                "R-MEAL-LATE",
                                s.work_date,
                                "first",
                                {
                                    **base,
                                    "meal_start": fmt_local(week, first.start.at),
                                    "hours_before_meal": round(into, 2),
                                },
                                f"Meal started {into:.2f} h into the shift, after the end of "
                                "the fifth hour.",
                            )
                        )
                    if (first.minutes or 0) < p.meal_min_minutes:
                        out.append(
                            Finding(
                                "R-MEAL-SHORT",
                                s.work_date,
                                "first",
                                {**base, "meal_minutes": round(first.minutes or 0)},
                                f"Meal lasted {first.minutes:.0f} minutes, under the 30 "
                                "minute minimum.",
                            )
                        )
            if p.second_meal_after_hours and worked > p.second_meal_after_hours:
                if len(meals) < 2:
                    out.append(
                        Finding(
                            "R-MEAL-MISSED",
                            s.work_date,
                            "second",
                            base,
                            f"Worked {worked:.2f} h with no second meal period.",
                        )
                    )
                else:
                    into2 = (meals[1].start.at - s.start.at).total_seconds() / 3600
                    if into2 > p.second_meal_after_hours:
                        out.append(
                            Finding(
                                "R-MEAL-LATE",
                                s.work_date,
                                "second",
                                {
                                    **base,
                                    "meal_start": fmt_local(week, meals[1].start.at),
                                    "hours_before_meal": round(into2, 2),
                                },
                                f"Second meal started {into2:.2f} h into the recorded span, "
                                "after the end of the tenth hour.",
                            )
                        )
        elif p.meal_mode == "handbook":
            if worked > p.meal_after_hours and not meals:
                out.append(
                    Finding(
                        "R-MEAL-MISSED",
                        s.work_date,
                        "first",
                        base,
                        f"Worked {worked:.2f} h on {_day(s.work_date)} with no meal period.",
                    )
                )
            elif meals and (meals[0].minutes or 0) < p.meal_min_minutes:
                out.append(
                    Finding(
                        "R-MEAL-SHORT",
                        s.work_date,
                        "first",
                        {**base, "meal_minutes": round(meals[0].minutes or 0)},
                        f"Meal lasted {meals[0].minutes:.0f} minutes, under 30 minutes.",
                    )
                )
        else:  # continuous (Bengaluru)
            longest = max(_segments(s))
            if longest > p.meal_after_hours:
                out.append(
                    Finding(
                        "R-MEAL-MISSED",
                        s.work_date,
                        "continuous",
                        {**base, "longest_continuous_hours": round(longest, 2)},
                        f"Worked {longest:.2f} h continuously without a 30 minute rest interval.",
                    )
                )
            elif meals and (meals[0].minutes or 0) < p.meal_min_minutes:
                out.append(
                    Finding(
                        "R-MEAL-SHORT",
                        s.work_date,
                        "first",
                        {**base, "meal_minutes": round(meals[0].minutes or 0)},
                        f"Rest interval lasted {meals[0].minutes:.0f} minutes, under 30.",
                    )
                )
    return out


def r_rest(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    out: list[Finding] = []
    ended = [s for s in shifts if s.start is not None]
    for prev, nxt in itertools.pairwise(ended):
        if prev.end is None or nxt.start is None or not week.in_week(nxt.work_date):
            continue
        gap = (nxt.start.at - prev.end.at).total_seconds() / 3600
        if 0 < gap < p.rest_min_hours:
            out.append(
                Finding(
                    "R-REST-MIN",
                    nxt.work_date,
                    nxt.start.id,
                    {
                        "previous_out": fmt_local(week, prev.end.at),
                        "next_in": fmt_local(week, nxt.start.at),
                        "rest_hours": round(gap, 2),
                        "minimum_hours": p.rest_min_hours,
                    },
                    f"Only {gap:.1f} h off between shifts (minimum {p.rest_min_hours:.0f} h).",
                )
            )
    return out


def r_overtime(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    if week.employee.exempt:
        return []
    out: list[Finding] = []
    split = split_hours(week, shifts, p)
    days = daily_hours(week, shifts)
    for d, (ot, dt) in sorted(split.daily_ot_by_date.items()):
        out.append(
            Finding(
                "R-OT-DAILY",
                d,
                "day",
                {
                    "worked_hours": round(days[d], 2),
                    "threshold_hours": p.daily_ot_hours,
                    "overtime_hours": round(ot, 2),
                    "double_time_hours": round(dt, 2),
                },
                f"Worked {days[d]:.2f} h on {_day(d)}: {ot:.2f} h overtime"
                + (f" and {dt:.2f} h double time" if dt else "")
                + " without pre-approval.",
            )
        )
    if split.weekly_ot > 0.0001:
        total = sum(days.values())
        out.append(
            Finding(
                "R-OT-WEEKLY",
                week.week_start,
                "week",
                {
                    "weekly_hours": round(total, 2),
                    "threshold_hours": p.weekly_ot_hours,
                    "weekly_overtime_hours": round(split.weekly_ot, 2),
                },
                f"Worked {total:.2f} h this week: {split.weekly_ot:.2f} h over the "
                f"{p.weekly_ot_hours:.0f} h threshold without pre-approval.",
            )
        )
    return out


def r_consecutive(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    worked = sorted({s.work_date for s in shifts if s.start is not None})
    out: list[Finding] = []
    for d in worked:
        if not week.in_week(d):
            continue
        n, cur = 0, d
        while cur in worked:
            n += 1
            cur -= timedelta(days=1)
        if n == p.max_consecutive_days + 1:
            out.append(
                Finding(
                    "R-DAYS-CONSECUTIVE",
                    d,
                    "streak",
                    {
                        "consecutive_days": n,
                        "streak_start": (d - timedelta(days=n - 1)).isoformat(),
                    },
                    f"{_day(d)} is the {n}th consecutive workday.",
                )
            )
    return out


def r_holiday(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    out: list[Finding] = []
    for h in sorted(week.holidays):
        if not week.in_week(h):
            continue
        scheds = [sc for sc in week.schedules if week.local_date(sc.start) == h]
        worked = [s for s in shifts if s.work_date == h and s.start is not None]
        if not scheds and not worked:
            continue
        hours = scheds[0].planned_hours if scheds else (worked[0].worked_hours or 0.0)
        out.append(
            Finding(
                "R-HOLIDAY-WORK",
                h,
                "holiday",
                {
                    "holiday": h.isoformat(),
                    "hours": round(hours, 2),
                    "schedule_id": scheds[0].id if scheds else None,
                    "status": "worked" if worked else "scheduled",
                },
                f"{'Worked' if worked else 'Scheduled'} {hours:.1f} h on {_day(h)}, a company holiday.",
            )
        )
    return out


def projected_hours(
    week: EmployeeWeek, shifts: list[Shift]
) -> tuple[float, float, float, list[Schedule]]:
    """Return (worked, scheduled remaining, projected, future schedules) for the current week."""
    worked = sum(daily_hours(week, shifts).values())
    used = {s.schedule.id for s in shifts if s.schedule is not None and not s.in_progress}
    remaining = 0.0
    future: list[Schedule] = []
    for sc in sorted(week.schedules, key=lambda x: x.start):
        if not week.in_week(week.local_date(sc.start)) or sc.id in used:
            continue
        if sc.start > week.now:
            future.append(sc)
            remaining += sc.planned_hours
        elif sc.end > week.now:  # in progress
            remaining += sc.planned_hours
    for s in shifts:  # unresolved missing-OUT shifts will likely be paid at scheduled hours
        if (
            week.in_week(s.work_date)
            and s.start
            and s.end is None
            and not s.in_progress
            and s.schedule
        ):
            remaining += s.schedule.planned_hours
    return worked, remaining, worked + remaining, future


def r_forecast(week: EmployeeWeek, shifts: list[Shift], p: PolicyParams) -> list[Finding]:
    if week.employee.exempt:
        return []
    worked, remaining, projected, future = projected_hours(week, shifts)
    out: list[Finding] = []
    if future and projected > p.weekly_ot_hours + 0.0001:
        risk = future[-1]
        over = projected - p.weekly_ot_hours
        out.append(
            Finding(
                "F-OT-RISK",
                week.local_date(risk.start),
                risk.id,
                {
                    "worked_hours": round(worked, 2),
                    "scheduled_remaining_hours": round(remaining, 2),
                    "projected_hours": round(projected, 2),
                    "threshold_hours": p.weekly_ot_hours,
                    "projected_overtime_hours": round(over, 2),
                    "shift_id": risk.id,
                    "shift_start": fmt_local(week, risk.start),
                    "shift_end": fmt_local(week, risk.end),
                    "shift_hours": round(risk.planned_hours, 2),
                },
                f"Projected {projected:.1f} h this week ({over:.1f} h over {p.weekly_ot_hours:.0f} h) "
                f"if the {_day(week.local_date(risk.start))} shift is worked as scheduled.",
            )
        )
    if p.daily_ot_hours is not None:
        for sc in future:
            if sc.planned_hours > p.daily_ot_hours + 0.0001:
                out.append(
                    Finding(
                        "F-OT-RISK",
                        week.local_date(sc.start),
                        f"daily-{sc.id}",
                        {
                            "shift_id": sc.id,
                            "shift_hours": round(sc.planned_hours, 2),
                            "threshold_hours": p.daily_ot_hours,
                            "projected_overtime_hours": round(
                                sc.planned_hours - p.daily_ot_hours, 2
                            ),
                            "shift_start": fmt_local(week, sc.start),
                            "shift_end": fmt_local(week, sc.end),
                        },
                        f"Scheduled {sc.planned_hours:.1f} h shift exceeds the daily threshold.",
                    )
                )
    return out
