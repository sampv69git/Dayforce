"""Rule catalog: titles, families, severities, allowed operations, and required clauses."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RuleMeta:
    rule_id: str
    title: str
    family: str
    severity: str
    root_capable: bool = False


RULES: dict[str, RuleMeta] = {
    m.rule_id: m
    for m in [
        RuleMeta("R-PUNCH-MISSING-OUT", "Missing clock-out", "punch_integrity", "high", True),
        RuleMeta("R-PUNCH-MISSING-IN", "Missing clock-in", "punch_integrity", "high", True),
        RuleMeta(
            "R-PUNCH-SPAN",
            "Two shifts joined by missed punches",
            "punch_integrity",
            "critical",
            True,
        ),
        RuleMeta("R-PUNCH-DUPLICATE", "Duplicate punch", "punch_integrity", "low", True),
        RuleMeta(
            "R-BREAK-UNPAIRED", "Meal start without meal end", "punch_integrity", "medium", True
        ),
        RuleMeta("R-SCHED-UNSCHEDULED", "Unscheduled shift", "schedule", "medium"),
        RuleMeta("R-SCHED-TARDY", "Late arrival", "schedule", "low"),
        RuleMeta("R-SCHED-EARLY-OUT", "Early departure", "schedule", "low"),
        RuleMeta("R-MEAL-MISSED", "Meal period missed", "meal_rest", "high"),
        RuleMeta("R-MEAL-LATE", "Meal period started late", "meal_rest", "medium"),
        RuleMeta("R-MEAL-SHORT", "Meal period too short", "meal_rest", "medium"),
        RuleMeta("R-REST-MIN", "Rest between shifts below minimum", "meal_rest", "medium"),
        RuleMeta("R-OT-DAILY", "Daily overtime not pre-approved", "overtime", "medium"),
        RuleMeta("R-OT-WEEKLY", "Weekly overtime not pre-approved", "overtime", "medium"),
        RuleMeta("R-DAYS-CONSECUTIVE", "Seventh consecutive workday", "overtime", "medium"),
        RuleMeta("R-HOLIDAY-WORK", "Shift on a company holiday", "policy", "low"),
        RuleMeta("F-OT-RISK", "Projected overtime this week", "forecast", "medium"),
    ]
}

PUNCH_INTEGRITY = {r for r, m in RULES.items() if m.family == "punch_integrity"}

_REQUIRED: dict[str, dict[str, list[str]]] = {
    "R-PUNCH-MISSING-OUT": {"*": ["TA-3.2"]},
    "R-PUNCH-MISSING-IN": {"*": ["TA-3.2"]},
    "R-PUNCH-SPAN": {"*": ["TA-3.4"]},
    "R-PUNCH-DUPLICATE": {"*": ["TA-3.3"]},
    "R-BREAK-UNPAIRED": {"*": ["TA-5.4"]},
    "R-SCHED-UNSCHEDULED": {"*": ["TA-2.3"]},
    "R-SCHED-TARDY": {"*": ["TA-2.5"]},
    "R-SCHED-EARLY-OUT": {"*": ["TA-2.5"]},
    "R-MEAL-MISSED": {"US-CA": ["CA-4.1"], "IN-KA": ["BLR-3.1"], "*": ["TA-5.1"]},
    "R-MEAL-LATE": {"US-CA": ["CA-4.2"], "*": ["TA-5.1"]},
    "R-MEAL-SHORT": {"US-CA": ["CA-4.1"], "IN-KA": ["BLR-3.1"], "*": ["TA-5.2"]},
    "R-REST-MIN": {"IN-KA": ["BLR-3.3"], "*": ["TA-6.1"]},
    "R-OT-DAILY": {"US-CA": ["CA-2.1"], "IN-KA": ["BLR-2.1"], "*": ["TA-4.3"]},
    "R-OT-WEEKLY": {"IN-KA": ["BLR-2.2"], "*": ["TA-4.1"]},
    "R-DAYS-CONSECUTIVE": {"US-CA": ["CA-2.3"], "*": ["TA-4.4"]},
    "R-HOLIDAY-WORK": {"IN-KA": ["BLR-4.1"], "*": ["TA-7.1"]},
    "F-OT-RISK": {"IN-KA": ["BLR-2.2"], "*": ["TA-4.2"]},
}

# Supporting clauses that retrieval should surface for context (gold labels for the eval).
SUPPORTING: dict[str, dict[str, list[str]]] = {
    "R-PUNCH-MISSING-OUT": {"*": ["TA-8.1", "TA-3.6", "TA-3.5"]},
    "R-PUNCH-MISSING-IN": {"*": ["TA-8.1", "TA-3.6", "TA-3.5"]},
    "R-PUNCH-SPAN": {"*": ["TA-3.2", "TA-3.5"]},
    "R-PUNCH-DUPLICATE": {"*": ["TA-3.5"]},
    "R-BREAK-UNPAIRED": {"*": ["TA-8.1", "TA-5.3"]},
    "R-SCHED-UNSCHEDULED": {"*": ["TA-2.1"]},
    "R-SCHED-TARDY": {"*": ["TA-2.4"]},
    "R-SCHED-EARLY-OUT": {"*": ["TA-2.4"]},
    "R-MEAL-MISSED": {"US-CA": ["CA-4.4", "CA-4.5", "CA-4.3"], "*": ["TA-5.4"]},
    "R-MEAL-LATE": {"US-CA": ["CA-4.4", "CA-4.5"], "*": ["TA-5.4"]},
    "R-MEAL-SHORT": {"US-CA": ["CA-4.4", "CA-4.5"], "*": ["TA-5.4"]},
    "R-REST-MIN": {"*": ["TA-6.2"]},
    "R-OT-DAILY": {"US-CA": ["TA-4.3"], "IN-KA": ["BLR-2.3", "TA-4.3"], "*": []},
    "R-OT-WEEKLY": {"US-CA": ["CA-2.2", "TA-4.3"], "IN-KA": ["BLR-2.3"], "*": ["TA-4.3"]},
    "R-DAYS-CONSECUTIVE": {"*": ["TA-4.4"]},
    "R-HOLIDAY-WORK": {"IN-KA": ["BLR-4.2"], "*": []},
    "F-OT-RISK": {"*": ["TA-9.1", "TA-4.2"]},
}


def _lookup(table: dict[str, dict[str, list[str]]], rule_id: str, jurisdiction: str) -> list[str]:
    entry = table.get(rule_id, {})
    return list(entry.get(jurisdiction, entry.get("*", [])))


def required_clauses(rule_id: str, jurisdiction: str) -> list[str]:
    return _lookup(_REQUIRED, rule_id, jurisdiction)


def supporting_clauses(rule_id: str, jurisdiction: str) -> list[str]:
    return [
        c
        for c in _lookup(SUPPORTING, rule_id, jurisdiction)
        if c not in required_clauses(rule_id, jurisdiction)
    ]


def allowed_ops(rule_id: str, jurisdiction: str) -> list[str]:
    """Operations the model may propose for a rule. Code owns this action space."""
    base: dict[str, list[str]] = {
        "R-PUNCH-MISSING-OUT": ["add_punch", "escalate"],
        "R-PUNCH-MISSING-IN": ["add_punch", "escalate"],
        "R-PUNCH-SPAN": ["add_punch", "escalate"],
        "R-PUNCH-DUPLICATE": ["void_punch", "escalate"],
        "R-BREAK-UNPAIRED": ["add_punch", "escalate"],
        "R-SCHED-UNSCHEDULED": ["approve_unscheduled", "escalate"],
        "R-SCHED-TARDY": ["acknowledge"],
        "R-SCHED-EARLY-OUT": ["acknowledge"],
        "R-REST-MIN": ["acknowledge", "escalate"],
        "R-OT-DAILY": ["approve_overtime", "escalate"],
        "R-OT-WEEKLY": ["approve_overtime", "escalate"],
        "R-DAYS-CONSECUTIVE": ["acknowledge", "escalate"],
        "R-HOLIDAY-WORK": ["record_premium", "escalate"],
        "F-OT-RISK": ["reassign_shift", "approve_overtime", "escalate"],
    }
    if rule_id in {"R-MEAL-MISSED", "R-MEAL-LATE", "R-MEAL-SHORT"}:
        return (
            ["record_premium", "escalate"]
            if jurisdiction == "US-CA"
            else ["acknowledge", "escalate"]
        )
    return list(base[rule_id])


def title_for(rule_id: str) -> str:
    return RULES[rule_id].title
