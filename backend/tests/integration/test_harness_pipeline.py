"""Pipeline integration: degraded mode, fault matrix, routing, persistence, and audit."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db import session_scope
from app.domain import models as m
from app.harness.pipeline import Actor, run_draft
from app.llm.providers.scripted import EXPECTED_GATE, FAULTS

ADMIN = Actor("u-arjun", "payroll_admin")


def exc_id(rule: str, employee: str) -> str:
    with session_scope() as s:
        return s.scalars(
            select(m.ExceptionRecord.id).where(
                m.ExceptionRecord.rule_id == rule, m.ExceptionRecord.employee_id == employee
            )
        ).one()


def test_degraded_mode_verifies_every_template(seeded: str) -> None:
    with session_scope() as s:
        ids = s.scalars(select(m.ExceptionRecord.id)).all()
    for i in ids:
        with session_scope() as s:
            run = run_draft(s, i, ADMIN, provider_name="rule_based")
            assert run.validations[-1]["passed"], (i, run.validations[-1])
            assert run.route in {"manual", "escalate"}


def test_conflicting_evidence_escalates(seeded: str) -> None:
    with session_scope() as s:
        run = run_draft(
            s, exc_id("R-PUNCH-MISSING-OUT", "E-FRE-006"), ADMIN, provider_name="rule_based"
        )
        assert run.route == "escalate" and "conflicts" in (run.escalation_reason or "")


def test_span_draft_reports_cascade_and_pay(seeded: str) -> None:
    with session_scope() as s:
        run = run_draft(s, exc_id("R-PUNCH-SPAN", "E-FRE-002"), ADMIN, provider_name="rule_based")
        assert len(run.clears) == 2
        assert run.pay_after["cost"]["amount"] < run.pay_before["cost"]["amount"]
        assert run.evidence_strength["level"] == "high"


def test_schedule_conflict_reassigns_and_clears_overtime_risk(seeded: str) -> None:
    with session_scope() as s:
        run = run_draft(
            s, exc_id("F-SCHED-CONFLICT", "E-FRE-012"), ADMIN, provider_name="rule_based"
        )
        assert run.validations[-1]["passed"], run.validations[-1]
        ops = run.resolution["operations"]
        assert [o["op"] for o in ops] == ["reassign_shift"]
        assert ops[0]["to_employee_id"] == "E-FRE-004"  # Marcus: only eligible picker
        # The same Saturday shift also pushed her over 40 h, so one fix clears both.
        assert exc_id("F-OT-RISK", "E-FRE-012") in run.clears
        cited = {c["clause_id"] for c in run.resolution["citations"]}
        assert {"TA-6.1", "TA-9.1"} <= cited


CASES = [
    ("R-PUNCH-SPAN", "E-FRE-002"),
    ("R-PUNCH-MISSING-OUT", "E-FRE-007"),
    ("R-MEAL-MISSED", "E-FRE-003"),
    ("F-OT-RISK", "E-FRE-003"),
    ("F-SCHED-CONFLICT", "E-FRE-012"),
]


@pytest.mark.parametrize("fault", FAULTS)
@pytest.mark.parametrize("case", CASES)
def test_fault_matrix(seeded: str, fault: str, case: tuple[str, str]) -> None:
    with session_scope() as s:
        run = run_draft(s, exc_id(*case), ADMIN, fault=fault)
        failed = {
            g["id"]
            for v in run.validations[: run.attempts]
            for g in v["gates"]
            if g["status"] == "fail"
        }
        if fault == "bad_then_good":
            assert run.route == "suggest" and run.repaired
            return
        expected = EXPECTED_GATE[fault]
        assert run.route in {"fallback", "escalate"}, "unsafe draft reached the manager"
        assert (expected in failed) or (expected == "provider" and "G1" in failed)
        assert run.fallback_reason and "rejected by the harness" in run.fallback_reason


def test_runs_persist_spans_and_audit(seeded: str) -> None:
    from app.audit.chain import verify

    with session_scope() as s:
        run = run_draft(
            s, exc_id("R-PUNCH-MISSING-OUT", "E-FRE-007"), ADMIN, fault="fabricated_quote"
        )
        trace_id = run.trace_id
    with session_scope() as s:
        names = s.scalars(select(m.TraceSpan.name).where(m.TraceSpan.trace_id == trace_id)).all()
        assert {
            "context",
            "retrieve",
            "sanitise",
            "generate",
            "validate",
            "repair",
            "route",
        } <= set(names)
        assert verify(s).intact


def test_injection_note_is_flagged_in_context(seeded: str) -> None:
    from app.harness.context import build_context

    with session_scope() as s:
        ctx = build_context(s, exc_id("R-PUNCH-MISSING-OUT", "E-FRE-007"))
        assert ctx.note.suspicious and "override_instructions" in ctx.note.flags
        user = ctx.messages()[1].content
        assert (
            "<untrusted_employee_text>" in user and "E-FRE-007" in user and "Kai Morgan" not in user
        )
