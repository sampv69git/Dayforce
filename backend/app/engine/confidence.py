"""Harness-computed evidence strength. The model's self-reported confidence is never used for routing."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.engine.constraints import Envelope, EvidenceItem
from app.engine.simulate import InvalidOp, parse_local
from app.engine.types import EmployeeWeek, Op

WEIGHTS = {
    "badge_match": 0.45,
    "scanner_match": 0.25,
    "schedule_alignment": 0.15,
    "attestation_match": 0.30,
    "pattern_consistency": 0.10,
    "conflict": -0.40,
}


@dataclass
class Strength:
    score: float
    level: str
    factors: dict[str, float] = field(default_factory=dict)
    basis: str = "evidence"

    def as_dict(self) -> dict[str, object]:
        return {
            "score": round(self.score, 2),
            "level": self.level,
            "factors": {k: round(v, 2) for k, v in self.factors.items()},
            "basis": self.basis,
        }


def _level(score: float) -> str:
    return "high" if score > 0.7 else "medium" if score >= 0.4 else "low"


def _typical_minutes(week: EmployeeWeek, punch_type: str) -> float | None:
    """Median local time-of-day (minutes) of this employee's recorded punches of a type."""
    mins = [
        week.local(p.at).hour * 60 + week.local(p.at).minute
        for p in week.punches
        if p.type == punch_type and p.source == "clock"
    ]
    return statistics.median(mins) if len(mins) >= 3 else None


def _near(items: list[EvidenceItem], prefix: str, when: datetime, minutes: int) -> bool:
    return any(
        e.kind.startswith(prefix) and abs(e.at_utc - when) <= timedelta(minutes=minutes)
        for e in items
    )


def evidence_strength(week: EmployeeWeek, env: Envelope, ops: list[Op]) -> Strength:
    timed = [op for op in ops if op.op == "add_punch" and op.at and op.punch_type]
    if not timed:
        if any(op.op == "escalate" for op in ops):
            return Strength(0.0, "low", {}, "escalation")
        # Premiums, approvals, and acknowledgements rest on facts computed by the engine.
        return Strength(0.9, "high", {"deterministic_facts": 1.0}, "computed")
    totals = dict.fromkeys(WEIGHTS, 0.0)
    for op in timed:
        try:
            when = parse_local(week, op.at or "")
        except InvalidOp:
            continue
        slot_items = [e for e in env.evidence if e.slot == op.punch_type]
        totals["badge_match"] += float(_near(slot_items, "badge", when, 5))
        totals["scanner_match"] += float(_near(slot_items, "scanner", when, 20))
        totals["schedule_alignment"] += float(_near(slot_items, "scheduled", when, 20))
        totals["attestation_match"] += float(_near(slot_items, "attestation", when, 5))
        strong_far = [
            e
            for e in slot_items
            if e.strength == "strong" and abs(e.at_utc - when) > timedelta(minutes=60)
        ]
        scans = [e for e in slot_items if e.kind == "scanner_activity"]
        scan_conflict = bool(scans) and min(abs(e.at_utc - when) for e in scans) > timedelta(
            minutes=60
        )
        totals["conflict"] += float(bool(strong_far) or scan_conflict)
        typical = _typical_minutes(week, op.punch_type or "")
        local = week.local(when)
        if typical is not None and abs(local.hour * 60 + local.minute - typical) <= 30:
            totals["pattern_consistency"] += 1.0
    n = len(timed)
    factors = {k: v / n for k, v in totals.items()}
    score = max(0.0, min(1.0, sum(WEIGHTS[k] * v for k, v in factors.items())))
    return Strength(score, _level(score), factors)
