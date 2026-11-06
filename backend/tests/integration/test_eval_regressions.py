"""Regression tests for harness issues found by the evaluation suite."""

from __future__ import annotations

from sqlalchemy import select

from app.db import session_scope
from app.domain import models as m
from app.harness.context import build_context
from app.harness.gates import run_gates
from app.harness.pipeline import Actor, run_draft


def _exc(rule: str, emp: str) -> str:
    with session_scope() as s:
        return s.scalars(
            select(m.ExceptionRecord.id).where(
                m.ExceptionRecord.rule_id == rule, m.ExceptionRecord.employee_id == emp
            )
        ).one()


def test_void_of_a_non_duplicate_punch_fails_g9(seeded: str) -> None:
    import json

    from app.harness.fallback import render_candidate

    with session_scope() as s:
        ctx = build_context(s, _exc("R-PUNCH-DUPLICATE", "E-FRE-011"))
        draft = json.loads(render_candidate(ctx))
        other = next(p.id for p in ctx.week.punches if p.type == "OUT")
        draft["operations"][0]["punch_id"] = other
        _, report = run_gates(ctx, json.dumps(draft), 1)
        g9 = next(g for g in report.gates if g.id == "G9")
        assert g9.status == "fail" and "duplicate" in g9.detail


def test_does_not_fix_fault_is_caught_for_acknowledge_rules(seeded: str) -> None:
    with session_scope() as s:
        run = run_draft(
            s,
            _exc("R-SCHED-TARDY", "E-FRE-010"),
            Actor("u-arjun", "payroll_admin"),
            fault="does_not_fix",
        )
        assert run.route in {"fallback", "escalate"}
        failed = {
            g["id"]
            for v in run.validations[: run.attempts]
            for g in v["gates"]
            if g["status"] == "fail"
        }
        assert "G8" in failed
