"""Pay, simulation, cascade, candidates, forecast, and evidence strength."""

from __future__ import annotations

from datetime import date

from app.engine.candidates import build_candidate
from app.engine.cascade import link_cascades
from app.engine.confidence import evidence_strength
from app.engine.constraints import build_envelope
from app.engine.detect import detect, fingerprint
from app.engine.forecast import swap_candidates
from app.engine.pay import pay_snapshot
from app.engine.simulate import simulate
from app.engine.types import Op

from .builders import W


def _pay(w: W):  # type: ignore[no-untyped-def]
    week = w.build()
    det = detect(week)
    return pay_snapshot(week, det.shifts, det.params)


def test_ca_daily_ot_and_double_time() -> None:
    p = _pay(W().shift("2026-11-03", "06:00", "19:30"))  # 13.0 h worked
    assert (
        round(p.regular_hours, 2),
        round(p.overtime_hours, 2),
        round(p.double_time_hours, 2),
    ) == (8, 4, 1)


def test_tx_weekly_ot_only() -> None:
    w = W("US-TX")
    for d in ("02", "03", "04", "05"):
        w.shift(f"2026-11-{d}", "06:00", "17:00")  # 10.5 h x 4 = 42 h
    p = _pay(w)
    assert round(p.regular_hours, 2) == 40 and round(p.overtime_hours, 2) == 2


def test_ca_weekly_ot_not_double_counted() -> None:
    w = W()
    for d in ("02", "03", "04", "05", "06"):
        w.shift(f"2026-11-{d}", "07:00", "17:30")  # 10 h each: 2 h daily OT each, 40 h regular
    p = _pay(w)
    assert round(p.regular_hours, 2) == 40 and round(p.overtime_hours, 2) == 10


def test_blr_overtime_at_twice_rate_and_exempt_all_regular() -> None:
    p = _pay(W("IN-KA", rate=100).shift("2026-11-03", "09:00", "20:00", meal=("13:00", "13:30")))
    assert round(p.overtime_hours, 2) == 1.5 and round(p.cost, 2) == round(100 * (9 + 1.5 * 2), 2)
    e = _pay(W(exempt=True).shift("2026-11-03", "07:00", "19:00"))
    assert e.overtime_hours == 0


def test_dst_fall_back_overnight_shift_counts_real_hours() -> None:
    # Sat 31 Oct 22:00 PDT to Sun 1 Nov 06:00 PST is 9 real hours (clocks fall back at 02:00).
    w = W(now="2026-11-01 12:00").shift(
        "2026-10-31", "22:00", "06:00", meal=None, end_day="2026-11-01"
    )
    det = detect(w.build())
    assert round(det.shifts[0].elapsed_hours or 0, 2) == 9.0


def test_overnight_shift_work_date_is_start_date() -> None:
    w = (
        W()
        .sched("2026-11-03 22:00", "2026-11-04 06:30")
        .punch("IN", "2026-11-03 22:00")
        .punch("MEAL_START", "2026-11-04 02:00")
        .punch("MEAL_END", "2026-11-04 02:30")
        .punch("OUT", "2026-11-04 06:30")
    )
    det = detect(w.build())
    assert det.shifts[0].work_date == date(2026, 11, 3) and det.findings == []


def _span_week() -> W:
    return (
        W()
        .sched("2026-11-03 07:00", "2026-11-03 15:30")
        .sched("2026-11-04 07:00", "2026-11-04 15:30")
        .punch("IN", "2026-11-03 07:01")
        .punch("MEAL_START", "2026-11-03 11:00")
        .punch("MEAL_END", "2026-11-03 11:30")
        .punch("MEAL_START", "2026-11-04 11:02")
        .punch("MEAL_END", "2026-11-04 11:32")
        .punch("OUT", "2026-11-04 15:29")
        .evidence("badge_exit", "2026-11-03 15:29")
        .evidence("badge_entry", "2026-11-04 07:02")
        .evidence("scanner_activity", "2026-11-03 15:16")
        .evidence("scanner_activity", "2026-11-04 07:11")
    )


def test_span_candidate_uses_badge_and_clears_symptoms() -> None:
    week = _span_week().build()
    det = detect(week)
    span = next(f for f in det.findings if f.rule_id == "R-PUNCH-SPAN")
    env = build_envelope(det, span)
    cand = build_candidate(det, span, env)
    assert [(o.punch_type, o.at) for o in cand.ops] == [
        ("OUT", "2026-11-03T15:29"),
        ("IN", "2026-11-04T07:02"),
    ]
    sim = simulate(week, cand.ops, span)
    assert sim.target_cleared and not sim.introduced
    assert {f.rule_id for f in sim.cleared} >= {"R-OT-DAILY"}
    assert sim.pay_after.cost < sim.pay_before.cost
    assert evidence_strength(week, env, cand.ops).level == "high"


def test_cascade_links_symptoms_to_root() -> None:
    det = detect(_span_week().build())
    links = link_cascades(det)
    span = next(f for f in det.findings if f.rule_id == "R-PUNCH-SPAN")
    assert fingerprint("E1", span) in links and len(links[fingerprint("E1", span)]) >= 1


def test_conflicting_evidence_escalates() -> None:
    w = (
        W()
        .sched("2026-11-04 07:00", "2026-11-04 15:30")
        .punch("IN", "2026-11-04 07:00")
        .evidence("badge_exit", "2026-11-04 15:10")
        .evidence("scanner_activity", "2026-11-04 17:20")
    )
    det = detect(w.build())
    f = det.findings[0]
    cand = build_candidate(det, f, build_envelope(det, f))
    assert cand.escalate and "conflicts" in (cand.escalation_reason or "")


def test_break_edit_requires_attestation() -> None:
    base = (
        W()
        .sched("2026-11-05 07:00", "2026-11-05 15:30")
        .punch("IN", "2026-11-05 07:00")
        .punch("MEAL_START", "2026-11-05 11:02")
        .punch("OUT", "2026-11-05 15:30")
    )
    det = detect(base.build())
    f = next(x for x in det.findings if x.rule_id == "R-BREAK-UNPAIRED")
    assert build_candidate(det, f, build_envelope(det, f)).escalate
    base.attest("R-BREAK-UNPAIRED", date(2026, 11, 5), "2026-11-05 11:33")
    det2 = detect(base.build())
    f2 = next(x for x in det2.findings if x.rule_id == "R-BREAK-UNPAIRED")
    cand = build_candidate(det2, f2, build_envelope(det2, f2))
    assert not cand.escalate and cand.ops[0].at == "2026-11-05T11:33"


def test_invalid_op_is_reported_not_raised() -> None:
    week = W().sched("2026-11-03 07:00", "2026-11-03 15:30").punch("IN", "2026-11-03 07:00").build()
    det = detect(week)
    sim = simulate(week, [Op("add_punch", punch_type="OUT", at="not-a-time")], det.findings[0])
    assert sim.status == "invalid"


def test_swap_candidates_rank_eligible_first() -> None:
    def worker(emp_id: str, days: list[str], sat: bool = False) -> W:
        w = W(emp_id=emp_id)
        for d in days:
            w.shift(f"2026-11-{d}", "07:00", "15:30")
        if sat:
            w.sched("2026-11-07 07:00", "2026-11-07 15:30")
        return w

    priya = worker("A", ["02", "03", "04", "05"], sat=True)
    priya.sched("2026-11-06 07:00", "2026-11-06 15:30").punch("IN", "2026-11-06 07:00")
    marcus = worker("B", ["02", "03", "05"])
    lena = worker("C", ["02", "03", "04", "05", "06"])
    det = detect(priya.build())
    risk = next(f for f in det.findings if f.rule_id == "F-OT-RISK")
    cands = swap_candidates(det, risk, [marcus.build(), lena.build()])
    assert cands[0].employee_id == "B" and cands[0].eligible
    assert not cands[1].eligible and "over" in (cands[1].reason or "")


def test_orphan_meal_punches_are_ignored() -> None:
    w = (
        W()
        .punch("MEAL_START", "2026-11-03 02:00")
        .punch("MEAL_END", "2026-11-03 02:30")
        .shift("2026-11-03", "07:00", "15:30")
    )
    assert detect(w.build()).findings == []


def test_acknowledge_cannot_clear_a_missing_punch() -> None:
    week = W().sched("2026-11-03 07:00", "2026-11-03 15:30").punch("IN", "2026-11-03 07:00").build()
    det = detect(week)
    sim = simulate(week, [Op("acknowledge")], det.findings[0])
    assert not sim.target_cleared
