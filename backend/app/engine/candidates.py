"""Deterministic candidate corrections and template explanations (the visible fallback path)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from app.engine.catalog import required_clauses, title_for
from app.engine.constraints import Envelope, EvidenceItem, Slot
from app.engine.detect import Detection
from app.engine.types import EmployeeWeek, Finding, Op

PRIORITY = {
    "attestation": 0,
    "badge_exit": 1,
    "badge_entry": 1,
    "scanner_activity": 2,
    "scheduled_end": 3,
    "scheduled_start": 3,
}


@dataclass
class Candidate:
    ops: list[Op]
    summary: str
    explanation: str
    clause_ids: list[str]
    escalate: bool = False
    escalation_reason: str | None = None
    anchors: list[EvidenceItem] = field(default_factory=list)


def _slot_evidence(env: Envelope, slot: Slot) -> list[EvidenceItem]:
    return [
        e
        for e in env.evidence
        if e.slot == slot.name
        and slot.earliest - timedelta(minutes=5) <= e.at_utc <= slot.latest + timedelta(minutes=5)
    ]


def pick_anchor(
    env: Envelope, slot: Slot, conflict_minutes: float
) -> tuple[EvidenceItem | None, str | None]:
    """Choose the strongest evidence for a slot, or report a conflict that needs escalation."""
    items = _slot_evidence(env, slot)
    atts = [e for e in items if e.kind == "attestation"]
    if atts:
        return atts[0], None
    badges = [e for e in items if e.kind.startswith("badge")]
    scans = sorted((e for e in items if e.kind == "scanner_activity"), key=lambda e: e.at_utc)
    scan_extreme = (scans[-1] if slot.punch_type == "OUT" else scans[0]) if scans else None
    if badges:
        badge = min(badges, key=lambda e: abs(e.at_utc - slot.anchor))
        if scan_extreme and abs(scan_extreme.at_utc - badge.at_utc) > timedelta(
            minutes=conflict_minutes
        ):
            return None, (
                f"Badge {badge.kind.replace('_', ' ')} at {badge.at[-5:]} conflicts with scanner activity "
                f"at {scan_extreme.at[-5:]} (more than {conflict_minutes:.0f} minutes apart)."
            )
        return badge, None
    if scan_extreme:
        return scan_extreme, None
    scheds = [e for e in items if e.kind.startswith("scheduled")]
    return (scheds[0] if scheds else None), None


def _hm(item: EvidenceItem) -> str:
    return item.at[-5:]


def _day(local: str) -> str:
    """'2026-11-03T15:29' -> 'Tue 3 Nov'."""
    from datetime import date as _date

    d = _date.fromisoformat(local[:10])
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def _describe(item: EvidenceItem) -> str:
    label = {
        "badge_exit": "badge exit",
        "badge_entry": "badge entry",
        "scanner_activity": "scanner activity",
        "attestation": "employee confirmation",
        "scheduled_end": "scheduled end",
        "scheduled_start": "scheduled start",
    }[item.kind]
    where = f" ({item.source})" if item.source and item.kind.startswith("badge") else ""
    return f"{label} at {_hm(item)}{where}"


def build_candidate(
    det: Detection, f: Finding, env: Envelope, peers: list[EmployeeWeek] | None = None
) -> Candidate:
    week = det.week
    juris = week.employee.site.jurisdiction
    req = required_clauses(f.rule_id, juris)
    title = title_for(f.rule_id)
    p = det.params

    def esc(reason: str) -> Candidate:
        return Candidate(
            [Op("escalate")], f"{title}: needs payroll review", reason, req, True, reason
        )

    if f.rule_id in {
        "R-PUNCH-MISSING-OUT",
        "R-PUNCH-MISSING-IN",
        "R-BREAK-UNPAIRED",
        "R-PUNCH-SPAN",
    }:
        if not env.slots:
            return esc(
                "No schedule or evidence window is available to anchor a corrected punch time."
            )
        ops: list[Op] = []
        anchors: list[EvidenceItem] = []
        for slot in env.slots:
            if f.rule_id == "R-BREAK-UNPAIRED":
                atts = [e for e in _slot_evidence(env, slot) if e.kind == "attestation"]
                if not atts:
                    return esc(
                        "Break punches can be added only with the employee's written confirmation "
                        "(TA-5.4). Ask the employee to confirm when the meal ended."
                    )
                anchor: EvidenceItem | None = atts[0]
            else:
                anchor, conflict = pick_anchor(env, slot, p.evidence_conflict_minutes)
                if conflict:
                    return Candidate(
                        [Op("escalate")],
                        f"{title}: conflicting evidence",
                        conflict,
                        [*req, "TA-3.6"],
                        True,
                        conflict,
                    )
            if anchor is None:
                return esc("No evidence exists within the plausible window for the missing punch.")
            ops.append(
                Op("add_punch", punch_type=slot.punch_type, at=anchor.at, evidence_ids=(anchor.id,))
            )
            anchors.append(anchor)
        parts = [
            f"{op.punch_type} at {a.at[-5:]} on {_day(a.at)} from the {_describe(a)}"
            for op, a in zip(ops, anchors, strict=True)
        ]
        if f.rule_id == "R-PUNCH-SPAN":
            summary = "Split the joined span into two shifts using badge evidence."
        else:
            summary = f"Add the missing {ops[0].punch_type} punch at {anchors[0].at[-5:]}."
        explanation = (
            f"{f.summary} The strongest evidence supports adding " + "; and ".join(parts) + ". "
            f"Policy {req[0]} allows adding a punch supported by independent evidence."
        )
        if any(a.strength == "weak" for a in anchors):
            explanation += (
                " Only the schedule supports this time, so employee confirmation is recommended."
            )
        return Candidate(ops, summary, explanation, req, anchors=anchors)

    if f.rule_id == "R-PUNCH-DUPLICATE":
        return Candidate(
            [Op("void_punch", punch_id=str(f.evidence["punch_id"]))],
            "Void the duplicate punch; the earlier punch stands.",
            f"{f.summary} Policy TA-3.3 treats the later punch as a device duplicate.",
            req,
        )
    if f.rule_id == "R-SCHED-UNSCHEDULED":
        return Candidate(
            [Op("approve_unscheduled")],
            "Approve the unscheduled shift; all time worked is paid.",
            f"{f.summary} Policy TA-2.3 requires manager review, and the time is paid.",
            req,
        )
    if f.rule_id in {"R-SCHED-TARDY", "R-SCHED-EARLY-OUT"}:
        return Candidate(
            [Op("acknowledge")],
            "Acknowledge for attendance; pay reflects actual time.",
            f"{f.summary} Policy TA-2.5 records this for attendance only.",
            req,
        )
    if f.rule_id in {"R-MEAL-MISSED", "R-MEAL-LATE", "R-MEAL-SHORT"}:
        if juris == "US-CA" and not week.employee.exempt:
            return Candidate(
                [Op("record_premium", premium_kind="meal", hours=1.0)],
                "Record one hour of meal premium; do not edit break punches.",
                f"{f.summary} Under {req[0]} and CA-4.4 one additional hour of pay at the regular "
                "rate is owed. Break punches must not be edited to remove the violation.",
                [*req, "CA-4.4"],
            )
        return Candidate(
            [Op("acknowledge")],
            "Acknowledge the break shortfall and coach on breaks.",
            f"{f.summary} Policy {req[0]} applies; no premium is defined at this site.",
            req,
        )
    if f.rule_id == "R-REST-MIN":
        return Candidate(
            [Op("acknowledge")],
            "Acknowledge the rest shortfall and adjust future schedules.",
            f"{f.summary} Policy {req[0]} sets the minimum rest between shifts.",
            req,
        )
    if f.rule_id in {"R-OT-DAILY", "R-OT-WEEKLY"}:
        hours = float(
            f.evidence.get("overtime_hours", f.evidence.get("weekly_overtime_hours", 0.0))
        )
        hours += float(f.evidence.get("double_time_hours", 0.0))
        return Candidate(
            [Op("approve_overtime", hours=round(hours, 2))],
            f"Approve {hours:.2f} h of worked overtime; worked time is always paid.",
            f"{f.summary} Under {req[0]} and TA-4.3 overtime that was worked must be paid.",
            req + (["TA-4.3"] if "TA-4.3" not in req else []),
        )
    if f.rule_id == "R-DAYS-CONSECUTIVE":
        return Candidate(
            [Op("acknowledge")],
            "Approve the seventh day and review fatigue risk.",
            f"{f.summary} Policy {req[0]} requires approval for a seventh consecutive day.",
            req,
        )
    if f.rule_id == "R-HOLIDAY-WORK":
        hours = float(f.evidence.get("hours", 0.0))
        return Candidate(
            [Op("record_premium", premium_kind="holiday", hours=round(hours, 2))],
            f"Confirm the holiday shift with {hours:.1f} h holiday premium.",
            f"{f.summary} Under {req[0]} work on a company holiday is paid at the holiday rate.",
            req,
        )
    if f.rule_id == "F-OT-RISK":
        from app.engine.forecast import best_swap  # local import avoids a cycle

        swap = best_swap(det, f, peers or [])
        shift_id = str(f.evidence["shift_id"])
        if swap is not None:
            return Candidate(
                [Op("reassign_shift", shift_id=shift_id, to_employee_id=swap)],
                "Reassign the shift to a qualified colleague with available hours.",
                f"{f.summary} Policy {req[0]} asks managers to first consider reassigning the "
                "shift; TA-9.1 requires that neither employee gains overtime, a rest shortfall, "
                "or a seventh consecutive day.",
                [*req, "TA-9.1"],
            )
        hours = float(f.evidence.get("projected_overtime_hours", 0.0))
        return Candidate(
            [Op("approve_overtime", hours=round(hours, 2))],
            f"No eligible colleague; pre-approve {hours:.1f} h of overtime.",
            f"{f.summary} No colleague in the same role can take the shift without overtime or a "
            f"rest shortfall, so pre-approval under {req[0]} is the remaining option.",
            req,
        )
    return esc("No deterministic correction is defined for this rule.")
