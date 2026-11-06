"""The seeded demo dataset produces exactly the planted scenarios."""

from __future__ import annotations

from sqlalchemy import select

from app.db import session_scope
from app.domain import models as m
from app.seed.generator import build

EXPECTED = {
    ("E-FRE-002", "R-PUNCH-SPAN"),
    ("E-FRE-002", "R-OT-DAILY"),
    ("E-FRE-002", "R-MEAL-LATE"),
    ("E-FRE-002", "R-PUNCH-MISSING-OUT"),
    ("E-FRE-003", "R-MEAL-MISSED"),
    ("E-FRE-003", "F-OT-RISK"),
    ("E-FRE-005", "R-SCHED-EARLY-OUT"),
    ("E-FRE-006", "R-PUNCH-MISSING-OUT"),
    ("E-FRE-007", "R-PUNCH-MISSING-OUT"),
    ("E-FRE-008", "R-MEAL-LATE"),
    ("E-FRE-009", "R-MEAL-SHORT"),
    ("E-FRE-010", "R-SCHED-TARDY"),
    ("E-FRE-010", "R-BREAK-UNPAIRED"),
    ("E-FRE-010", "R-MEAL-MISSED"),
    ("E-FRE-010", "R-OT-DAILY"),
    ("E-FRE-011", "R-PUNCH-DUPLICATE"),
    ("E-FRE-011", "R-SCHED-TARDY"),
    ("E-FRE-012", "R-SCHED-UNSCHEDULED"),
    ("E-FRE-012", "R-SCHED-TARDY"),
    ("E-FRE-012", "F-SCHED-CONFLICT"),
    ("E-FRE-012", "F-OT-RISK"),
    ("E-FRE-014", "R-REST-MIN"),
    ("E-FRE-015", "R-OT-DAILY"),
    ("E-FRE-015", "F-OT-RISK"),
    ("E-AUS-003", "R-DAYS-CONSECUTIVE"),
    ("E-AUS-004", "R-OT-WEEKLY"),
    ("E-AUS-005", "R-PUNCH-MISSING-IN"),
    ("E-AUS-006", "R-MEAL-MISSED"),
    ("E-AUS-006", "R-SCHED-EARLY-OUT"),
    ("E-AUS-008", "R-SCHED-TARDY"),
    ("E-AUS-009", "R-SCHED-TARDY"),
    ("E-BLR-002", "R-HOLIDAY-WORK"),
    ("E-BLR-003", "R-HOLIDAY-WORK"),
    ("E-BLR-005", "R-REST-MIN"),
    ("E-BLR-006", "R-MEAL-MISSED"),
    ("E-BLR-006", "R-OT-DAILY"),
    ("E-BLR-007", "R-MEAL-MISSED"),
    ("E-BLR-008", "F-OT-RISK"),
    ("E-BLR-009", "R-PUNCH-MISSING-OUT"),
}


def test_generator_is_deterministic() -> None:
    assert build(7).digest() == build(7).digest()


def test_planted_scenarios_detected_exactly(seeded: str) -> None:
    with session_scope() as s:
        rows = s.execute(select(m.ExceptionRecord.employee_id, m.ExceptionRecord.rule_id)).all()
    assert set(map(tuple, rows)) == EXPECTED
    assert len(rows) == len(EXPECTED)  # no duplicates


def test_cascades_and_attestation_state(seeded: str) -> None:
    with session_scope() as s:
        span = s.scalars(
            select(m.ExceptionRecord).where(m.ExceptionRecord.rule_id == "R-PUNCH-SPAN")
        ).one()
        assert len(span.symptom_ids) == 2
        thu = s.scalars(
            select(m.ExceptionRecord).where(
                m.ExceptionRecord.employee_id == "E-FRE-002",
                m.ExceptionRecord.rule_id == "R-PUNCH-MISSING-OUT",
            )
        ).one()
        assert thu.status == "awaiting_employee"


def test_detection_is_idempotent(seeded: str) -> None:
    from app.services.detection import detect_all

    with session_scope() as s:
        summary = detect_all(s)
    assert summary.created == 0 and summary.superseded == 0


def test_audit_chain_intact_after_seed(seeded: str) -> None:
    from app.audit.chain import verify

    with session_scope() as s:
        v = verify(s)
    assert v.intact and v.events_checked >= 3
