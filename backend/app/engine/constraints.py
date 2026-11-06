"""Build the constraints envelope for one finding: what the model may do, and with which evidence."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from app.engine.catalog import allowed_ops, required_clauses
from app.engine.detect import Detection
from app.engine.pay import pay_snapshot
from app.engine.rules import fmt_local, projected_hours
from app.engine.types import EmployeeWeek, Finding, Shift

STRENGTH = {
    "attestation": "strong",
    "badge_exit": "strong",
    "badge_entry": "strong",
    "scanner_activity": "medium",
    "scheduled_end": "weak",
    "scheduled_start": "weak",
}


@dataclass(frozen=True)
class EvidenceItem:
    id: str
    kind: str
    at: str  # site-local YYYY-MM-DDTHH:MM
    at_utc: datetime
    strength: str
    source: str | None
    simulated: bool
    slot: str | None = None  # which punch slot this supports: "OUT", "IN", "MEAL_END", "IN@2" ...

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "at": self.at,
            "strength": self.strength,
            "source": self.source,
            "simulated": self.simulated,
            "for_slot": self.slot,
        }


@dataclass(frozen=True)
class Slot:
    """A punch the correction must add, with its plausible window."""

    name: str
    punch_type: str
    earliest: datetime
    latest: datetime
    anchor: datetime  # schedule time used as the weak default


@dataclass
class Envelope:
    rule_id: str
    allowed_ops: list[str]
    required_clause_ids: list[str]
    slots: list[Slot]
    evidence: list[EvidenceItem]
    facts: dict[str, Any]
    target_punch_ids: list[str] = field(default_factory=list)
    target_shift_id: str | None = None

    def windows_public(self, week: EmployeeWeek) -> list[dict[str, str]]:
        return [
            {
                "slot": s.name,
                "punch_type": s.punch_type,
                "earliest": fmt_local(week, s.earliest),
                "latest": fmt_local(week, s.latest),
            }
            for s in self.slots
        ]


def _shift_for(det: Detection, f: Finding) -> Shift | None:
    ids = {f.evidence.get(k) for k in ("in_punch_id", "out_punch_id", "meal_start_id")}
    for s in det.shifts:
        if (s.start and s.start.id in ids) or (s.end and s.end.id in ids):
            return s
        if any(m.start.id in ids for m in s.meals):
            return s
    return None


def _neighbours(det: Detection, shift: Shift) -> tuple[Shift | None, Shift | None]:
    idx = det.shifts.index(shift)
    prev = det.shifts[idx - 1] if idx > 0 else None
    nxt = det.shifts[idx + 1] if idx + 1 < len(det.shifts) else None
    return prev, nxt


def _evidence_near(
    week: EmployeeWeek, kinds: set[str], lo: datetime, hi: datetime, slot: str
) -> list[EvidenceItem]:
    out = []
    for e in week.evidence:
        if e.kind in kinds and lo <= e.at <= hi:
            prefix = "badge" if e.kind.startswith("badge") else "scan"
            out.append(
                EvidenceItem(
                    f"{prefix}:{e.id}",
                    e.kind,
                    fmt_local(week, e.at),
                    e.at,
                    STRENGTH[e.kind],
                    e.location,
                    True,
                    slot,
                )
            )
    return out


def _attestations(week: EmployeeWeek, f: Finding, slot: str) -> list[EvidenceItem]:
    return [
        EvidenceItem(
            f"att:{a.id}",
            "attestation",
            fmt_local(week, a.at),
            a.at,
            "strong",
            "Employee confirmation",
            False,
            slot,
        )
        for a in week.attestations
        if a.work_date == f.work_date and a.rule_id == f.rule_id
    ]


def _sched_item(week: EmployeeWeek, sid: str, kind: str, at: datetime, slot: str) -> EvidenceItem:
    return EvidenceItem(
        f"sched:{sid}:{'end' if kind == 'scheduled_end' else 'start'}",
        kind,
        fmt_local(week, at),
        at,
        "weak",
        "Published schedule",
        False,
        slot,
    )


def build_envelope(det: Detection, f: Finding) -> Envelope:
    week = det.week
    juris = week.employee.site.jurisdiction
    env = Envelope(
        rule_id=f.rule_id,
        allowed_ops=allowed_ops(f.rule_id, juris),
        required_clause_ids=required_clauses(f.rule_id, juris),
        slots=[],
        evidence=[],
        facts={"rule_evidence": f.evidence},
    )
    pay = pay_snapshot(week, det.shifts, det.params)
    worked, _remaining, projected, _ = projected_hours(week, det.shifts)
    env.facts.update(
        {
            "weekly_worked_hours": round(worked, 2),
            "weekly_projected_hours": round(projected, 2),
            "weekly_threshold_hours": det.params.weekly_ot_hours,
            "daily_threshold_hours": det.params.daily_ot_hours,
            "pay_before": pay.as_dict(),
            "exempt": week.employee.exempt,
        }
    )
    shift = _shift_for(det, f)
    if f.rule_id == "R-PUNCH-MISSING-OUT" and shift and shift.start:
        prev, nxt = _neighbours(det, shift)
        sched_end = (
            shift.schedule.end
            if shift.schedule
            else shift.start.at + timedelta(hours=8, minutes=30)
        )
        last_meal = max((m.end.at for m in shift.meals if m.end), default=shift.start.at)
        lo = max(shift.start.at + timedelta(hours=1), last_meal + timedelta(minutes=1))
        hi = min(sched_end + timedelta(hours=3), week.now)
        if nxt and nxt.start:
            hi = min(hi, nxt.start.at - timedelta(minutes=1))
        env.slots.append(Slot("OUT", "OUT", lo, hi, sched_end))
        env.evidence += _attestations(week, f, "OUT")
        env.evidence += _evidence_near(
            week,
            {"badge_exit", "scanner_activity"},
            lo - timedelta(minutes=30),
            hi + timedelta(minutes=30),
            "OUT",
        )
        if shift.schedule:
            env.evidence.append(
                _sched_item(week, shift.schedule.id, "scheduled_end", sched_end, "OUT")
            )
        env.target_punch_ids = [shift.start.id]
    elif f.rule_id == "R-PUNCH-MISSING-IN" and shift and shift.end:
        prev, _ = _neighbours(det, shift)
        sched_start = (
            shift.schedule.start
            if shift.schedule
            else shift.end.at - timedelta(hours=8, minutes=30)
        )
        first_meal = min((m.start.at for m in shift.meals), default=shift.end.at)
        lo = sched_start - timedelta(hours=3)
        if prev and prev.end:
            lo = max(lo, prev.end.at + timedelta(minutes=1))
        hi = min(shift.end.at - timedelta(hours=1), first_meal - timedelta(minutes=1))
        env.slots.append(Slot("IN", "IN", lo, hi, sched_start))
        env.evidence += _attestations(week, f, "IN")
        env.evidence += _evidence_near(
            week,
            {"badge_entry", "scanner_activity"},
            lo - timedelta(minutes=30),
            hi + timedelta(minutes=30),
            "IN",
        )
        if shift.schedule:
            env.evidence.append(
                _sched_item(week, shift.schedule.id, "scheduled_start", sched_start, "IN")
            )
        env.target_punch_ids = [shift.end.id]
    elif f.rule_id == "R-PUNCH-SPAN" and shift and shift.start and shift.end:
        first_sched = shift.schedule
        later = sorted(
            (
                s
                for s in week.schedules
                if first_sched and s.start > first_sched.end and s.start < shift.end.at
            ),
            key=lambda s: s.start,
        )
        if first_sched and later:
            second = later[0]
            day1_meals = [
                m
                for m in shift.meals
                if m.end and m.start.at < first_sched.end + timedelta(hours=3)
            ]
            lo1 = max(
                [shift.start.at + timedelta(hours=1)]
                + [m.end.at + timedelta(minutes=1) for m in day1_meals if m.end]
            )
            hi1 = first_sched.end + timedelta(hours=3)
            day2_meals = [m for m in shift.meals if m.start.at > second.start - timedelta(hours=3)]
            lo2 = max(second.start - timedelta(hours=3), hi1)
            hi2 = min(
                [second.start + timedelta(hours=3)]
                + [m.start.at - timedelta(minutes=1) for m in day2_meals]
            )
            env.slots += [
                Slot("OUT", "OUT", lo1, hi1, first_sched.end),
                Slot("IN", "IN", lo2, hi2, second.start),
            ]
            env.evidence += _evidence_near(
                week,
                {"badge_exit", "scanner_activity"},
                lo1 - timedelta(minutes=30),
                hi1 + timedelta(minutes=30),
                "OUT",
            )
            env.evidence += _evidence_near(
                week,
                {"badge_entry", "scanner_activity"},
                lo2 - timedelta(minutes=30),
                hi2 + timedelta(minutes=30),
                "IN",
            )
            env.evidence.append(
                _sched_item(week, first_sched.id, "scheduled_end", first_sched.end, "OUT")
            )
            env.evidence.append(_sched_item(week, second.id, "scheduled_start", second.start, "IN"))
            env.facts["second_schedule_id"] = second.id
        env.target_punch_ids = [shift.start.id, shift.end.id]
    elif f.rule_id == "R-BREAK-UNPAIRED" and shift and shift.end:
        meal_start = next(m.start for m in shift.meals if m.start.id == f.evidence["meal_start_id"])
        lo, hi = (
            meal_start.at + timedelta(minutes=10),
            min(meal_start.at + timedelta(minutes=90), shift.end.at),
        )
        env.slots.append(
            Slot("MEAL_END", "MEAL_END", lo, hi, meal_start.at + timedelta(minutes=30))
        )
        env.evidence += _attestations(week, f, "MEAL_END")
        env.target_punch_ids = [meal_start.id]
    elif f.rule_id == "R-PUNCH-DUPLICATE":
        env.target_punch_ids = [str(f.evidence["punch_id"])]
    elif f.rule_id == "F-OT-RISK":
        env.target_shift_id = str(f.evidence["shift_id"])
    return env
