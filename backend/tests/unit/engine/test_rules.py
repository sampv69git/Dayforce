"""Rule tests: positive, negative, and boundary cases for every detection rule."""

from __future__ import annotations

from datetime import date

from app.engine.detect import detect

from .builders import W


def rules(week_builder: W) -> list[str]:
    return [f.rule_id for f in detect(week_builder.build()).findings]


def run(week_builder: W) -> list:
    return list(detect(week_builder.build()).findings)


def test_clean_ca_shift_has_no_exceptions() -> None:
    w = W().shift("2026-11-03", "07:00", "15:30")
    assert rules(w) == []


def test_missing_out_after_grace() -> None:
    w = W().sched("2026-11-03 07:00", "2026-11-03 15:30").punch("IN", "2026-11-03 07:00")
    assert "R-PUNCH-MISSING-OUT" in rules(w)


def test_shift_in_progress_is_not_missing_out() -> None:
    w = (
        W(now="2026-11-03 12:00")
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .punch("IN", "2026-11-03 07:00")
    )
    assert "R-PUNCH-MISSING-OUT" not in rules(w)


def test_missing_in() -> None:
    w = W().sched("2026-11-03 07:00", "2026-11-03 15:30").punch("OUT", "2026-11-03 15:30")
    assert rules(w) == ["R-PUNCH-MISSING-IN"]


def test_two_missed_punches_create_span_with_symptoms() -> None:
    w = (
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .sched("2026-11-04 07:00", "2026-11-04 15:30")
        .punch("IN", "2026-11-03 07:00")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("MEAL_END", "2026-11-03 11:30")
        .punch("MEAL_START", "2026-11-04 11:00")
        .punch("MEAL_END", "2026-11-04 11:30")
        .punch("OUT", "2026-11-04 15:30")
    )
    found = rules(w)
    assert "R-PUNCH-SPAN" in found and "R-OT-DAILY" in found


def test_duplicate_punch_within_window_and_not_outside() -> None:
    dup = W().shift("2026-11-03", "07:00", "15:30").punch("IN", "2026-11-03 07:05")
    assert "R-PUNCH-DUPLICATE" in rules(dup)
    far = W().shift("2026-11-04", "07:00", "15:30").punch("OUT", "2026-11-04 15:45")
    assert "R-PUNCH-DUPLICATE" not in rules(far)


def test_unpaired_break() -> None:
    w = (
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .punch("IN", "2026-11-03 07:00")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("OUT", "2026-11-03 15:30")
    )
    assert "R-BREAK-UNPAIRED" in rules(w)


def test_tardy_boundary_seven_minutes_is_fine_eight_is_late() -> None:
    assert "R-SCHED-TARDY" not in rules(
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .punch("IN", "2026-11-03 07:07")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("MEAL_END", "2026-11-03 11:30")
        .punch("OUT", "2026-11-03 15:30")
    )
    assert "R-SCHED-TARDY" in rules(
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .punch("IN", "2026-11-03 07:08")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("MEAL_END", "2026-11-03 11:30")
        .punch("OUT", "2026-11-03 15:30")
    )


def test_early_out() -> None:
    w = (
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .punch("IN", "2026-11-03 07:00")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("MEAL_END", "2026-11-03 11:30")
        .punch("OUT", "2026-11-03 15:20")
    )
    assert rules(w) == ["R-SCHED-EARLY-OUT"]


def test_unscheduled_shift() -> None:
    assert rules(W().shift("2026-11-03", "07:00", "15:30", schedule=False)) == [
        "R-SCHED-UNSCHEDULED"
    ]


def test_ca_meal_missed_late_short() -> None:
    assert "R-MEAL-MISSED" in rules(W().shift("2026-11-03", "07:00", "13:00", meal=None))
    assert "R-MEAL-MISSED" not in rules(
        W().shift("2026-11-03", "07:00", "12:00", meal=None)
    )  # 5.0 h exactly
    assert "R-MEAL-LATE" in rules(
        W().shift("2026-11-03", "07:00", "15:30", meal=("12:10", "12:40"))
    )
    assert "R-MEAL-SHORT" in rules(
        W().shift("2026-11-03", "07:06", "15:24", meal=("11:00", "11:18"))
    )


def test_handbook_meal_threshold_is_six_hours() -> None:
    assert "R-MEAL-MISSED" not in rules(W("US-TX").shift("2026-11-03", "06:00", "11:30", meal=None))
    assert "R-MEAL-MISSED" in rules(W("US-TX").shift("2026-11-03", "06:00", "12:30", meal=None))


def test_bengaluru_continuous_five_hours() -> None:
    assert "R-MEAL-MISSED" in rules(
        W("IN-KA").shift("2026-11-03", "09:00", "18:00", meal=("14:45", "15:15"))
    )
    assert rules(W("IN-KA").shift("2026-11-03", "09:00", "18:00", meal=("13:00", "13:30"))) == []


def test_exempt_employee_has_no_overtime_or_meal_exceptions() -> None:
    assert rules(W(exempt=True).shift("2026-11-03", "07:00", "18:00", meal=None)) == []


def test_rest_between_shifts() -> None:
    w = (
        W()
        .shift("2026-11-03", "14:30", "23:00", meal=("18:30", "19:00"))
        .shift("2026-11-04", "07:00", "15:30")
    )
    assert "R-REST-MIN" in rules(w)
    blr = (
        W("IN-KA")
        .shift("2026-11-03", "09:00", "18:00", meal=("13:00", "13:30"))
        .shift("2026-11-04", "04:30", "13:00", meal=("08:30", "09:00"))
    )
    assert "R-REST-MIN" in rules(blr)  # 10.5 h < 11 h in Bengaluru


def test_schedule_conflict_looks_ahead_at_published_shifts() -> None:
    w = W(now="2026-11-06 11:00")
    w.sched("2026-11-06 14:30", "2026-11-06 23:00")
    assert "F-SCHED-CONFLICT" not in rules(w)
    w.sched("2026-11-07 06:00", "2026-11-07 14:30")  # 7 h after the close
    found = [f for f in run(w) if f.rule_id == "F-SCHED-CONFLICT"]
    assert len(found) == 1
    assert found[0].evidence["conflict"] == "rest_shortfall"
    assert found[0].evidence["rest_hours"] == 7.0
    assert "R-REST-MIN" not in rules(w)  # nothing has been worked yet


def test_schedule_conflict_overlap_and_jurisdiction_minimum() -> None:
    w = W(now="2026-11-06 11:00")
    w.sched("2026-11-07 07:00", "2026-11-07 15:30").sched("2026-11-07 14:00", "2026-11-07 22:00")
    found = [f for f in run(w) if f.rule_id == "F-SCHED-CONFLICT"]
    assert [f.evidence["conflict"] for f in found] == ["overlap"]
    # 10.5 h rest is enough in California (10 h) but not in Bengaluru (11 h).
    ca = W(now="2026-11-06 11:00").sched("2026-11-06 12:00", "2026-11-06 20:30")
    ca.sched("2026-11-07 07:00", "2026-11-07 15:30")
    assert "F-SCHED-CONFLICT" not in rules(ca)
    blr = W("IN-KA", now="2026-11-06 11:00").sched("2026-11-06 12:00", "2026-11-06 20:30")
    blr.sched("2026-11-07 07:00", "2026-11-07 15:30")
    assert "F-SCHED-CONFLICT" in rules(blr)


def test_schedule_conflict_ignores_shifts_already_started() -> None:
    w = W(now="2026-11-06 11:00").sched("2026-11-05 14:30", "2026-11-05 23:00")
    w.sched("2026-11-06 06:00", "2026-11-06 14:30")  # already under way at 11:00
    assert "F-SCHED-CONFLICT" not in rules(w)


def test_daily_overtime_ca_and_blr_not_tx() -> None:
    assert "R-OT-DAILY" in rules(W().shift("2026-11-03", "07:00", "17:00"))
    assert "R-OT-DAILY" not in rules(W("US-TX").shift("2026-11-03", "06:00", "17:00"))
    assert "R-OT-DAILY" in rules(
        W("IN-KA").shift("2026-11-03", "09:00", "20:00", meal=("13:00", "13:30"))
    )


def test_weekly_overtime_tx() -> None:
    w = W("US-TX")
    for d in ("02", "03", "04", "05"):
        w.shift(f"2026-11-{d}", "06:00", "17:00")
    assert "R-OT-WEEKLY" in rules(w)


def test_seventh_consecutive_day() -> None:
    w = W("US-TX")
    for d in ("2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"):
        w.shift(d, "06:00", "14:30")
    assert "R-DAYS-CONSECUTIVE" not in rules(w)
    w.shift("2026-11-06", "06:00", "10:00", meal=None)
    assert "R-DAYS-CONSECUTIVE" in rules(w)


def test_holiday_scheduled_in_bengaluru() -> None:
    w = W("IN-KA", now="2026-11-07 00:30").sched("2026-11-08 09:00", "2026-11-08 18:00")
    assert "R-HOLIDAY-WORK" in rules(w)


def test_forecast_projects_overtime_only_with_future_shift() -> None:
    w = W(now="2026-11-06 11:00")
    for d in ("02", "03", "04", "05"):
        w.shift(f"2026-11-{d}", "07:00", "15:30")
    w.sched("2026-11-06 07:00", "2026-11-06 15:30").punch("IN", "2026-11-06 07:00")
    assert "F-OT-RISK" not in rules(w)  # 40 h projected, not over
    w.sched("2026-11-07 07:00", "2026-11-07 15:30")
    assert "F-OT-RISK" in rules(w)


def test_adjustment_resolves_finding() -> None:
    w = W().shift("2026-11-03", "07:00", "13:00", meal=None)
    assert "R-MEAL-MISSED" in rules(w)
    w.adjust("meal_premium", date(2026, 11, 3), "R-MEAL-MISSED", 1.0)
    assert "R-MEAL-MISSED" not in rules(w)


def test_previous_week_is_context_only() -> None:
    w = W().shift("2026-10-28", "07:00", "15:30", meal=None)
    assert rules(w) == []
