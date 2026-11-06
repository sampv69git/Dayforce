"""Human decisions: approve, edit (re-validated), or reject. Corrections are append-only revisions."""

from __future__ import annotations

import secrets
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.api.errors import Conflict, Forbidden, Unprocessable
from app.audit import chain
from app.contracts import api
from app.contracts.draft import DraftResolution, Operation
from app.domain import models as m
from app.engine.pay import pay_snapshot
from app.engine.simulate import PREMIUM_KIND, parse_local
from app.harness.context import build_context
from app.harness.gates import GATE_NAMES, GateResult, ValidationReport, run_gates
from app.services.detection import detect_employee
from app.services.views import ACTIVE, bulk_eligible
from app.services.weeks import load_week

EDIT_GATES = {"G2", "G6", "G7", "G8", "G9"}


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"


def validate_edit(session: Session, run: m.PipelineRun, ops: list[Operation]) -> ValidationReport:
    """Run the action, evidence, simulation, and guardrail gates on manager-edited operations."""
    ctx = build_context(session, run.exception_id)
    base = DraftResolution.model_validate(run.resolution) if run.resolution else None
    draft = DraftResolution(
        exception_id=run.exception_id,
        summary=base.summary if base else "Manager edit",
        explanation=base.explanation if base else "Manager edited the proposed correction.",
        operations=ops,
        citations=base.citations if base else [],  # type: ignore[arg-type]
        employee_note_assessment=base.employee_note_assessment
        if base
        else {"relevant": False, "contains_instructions": False},  # type: ignore[arg-type]
        needs_escalation=any(o.op == "escalate" for o in ops),
        escalation_reason="Escalated by manager" if any(o.op == "escalate" for o in ops) else None,
        self_confidence="high",
    )
    _, report = run_gates(ctx, draft.model_dump_json(), attempt=1, mode="edit")
    report.gates = [
        g
        if g.id in EDIT_GATES
        else GateResult(g.id, GATE_NAMES[g.id], "skip", "not applicable to edits")
        for g in report.gates
    ]
    report.passed = all(g.status != "fail" for g in report.gates)
    return report


def _apply(
    session: Session,
    run: m.PipelineRun,
    rec: m.ExceptionRecord,
    ops: list[dict[str, object]],
    decision: m.Decision,
) -> tuple[list[str], list[str]]:
    """Apply operations; return (revision ids, employee ids to re-detect)."""
    week = load_week(session, rec.employee_id)
    rev_id = _new_id("REV")
    added: list[str] = []
    voided: list[str] = []
    affected = [rec.employee_id]
    for o in ops:
        kind = o.get("op")
        if kind == "add_punch":
            pid = _new_id("P")
            at = parse_local(week, str(o["at"])).replace(tzinfo=None)
            session.add(
                m.Punch(
                    id=pid,
                    employee_id=rec.employee_id,
                    type=str(o["punch_type"]),
                    at_utc=at,
                    source="correction",
                    revision_id=rev_id,
                )
            )
            added.append(pid)
        elif kind == "void_punch":
            p = session.get(m.Punch, str(o["punch_id"]))
            if p is None or p.employee_id != rec.employee_id:
                raise Unprocessable("void_punch references an unknown punch")
            p.voided_by_revision_id = rev_id
            voided.append(p.id)
        elif kind in {"record_premium", "approve_overtime", "acknowledge", "approve_unscheduled"}:
            adj_kind = {
                "approve_overtime": "ot_approval",
                "acknowledge": "acknowledged",
                "approve_unscheduled": "unscheduled_ok",
            }.get(str(kind)) or PREMIUM_KIND[str(o.get("premium_kind"))]
            session.add(
                m.PayAdjustment(
                    id=_new_id("ADJ"),
                    decision_id=decision.id,
                    employee_id=rec.employee_id,
                    work_date=rec.work_date,
                    kind=adj_kind,
                    hours=float(o.get("hours") or 0.0),  # type: ignore[arg-type]
                    rule_id=rec.rule_id,
                )
            )
        elif kind == "reassign_shift":
            shift = session.get(m.ShiftSchedule, str(o["shift_id"]))
            to = str(o["to_employee_id"])
            if shift is None or shift.employee_id != rec.employee_id:
                raise Unprocessable("reassign_shift references a shift that is not this employee's")
            session.add(
                m.ScheduleChange(
                    id=_new_id("SC"),
                    decision_id=decision.id,
                    shift_id=shift.id,
                    from_employee_id=shift.employee_id,
                    to_employee_id=to,
                    created_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            shift.employee_id = to
            affected.append(to)
    session.add(
        m.TimecardRevision(
            id=rev_id,
            decision_id=decision.id,
            employee_id=rec.employee_id,
            operations=ops,
            added_punch_ids=added,
            voided_punch_ids=voided,
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
    )
    session.flush()
    return [rev_id], affected


def decide(
    session: Session, user: CurrentUser, run_id: str, req: api.DecisionRequest
) -> api.DecisionResult:
    run = session.get(m.PipelineRun, run_id)
    if run is None:
        raise Unprocessable(f"Draft {run_id} not found")
    if run.fault:
        raise Conflict("Fault replays are for inspection only and cannot be decided")
    rec = session.get(m.ExceptionRecord, run.exception_id)
    assert rec is not None
    if rec.status not in ACTIVE:
        raise Conflict(f"Exception {rec.id} is already {rec.status}")
    if session.scalars(select(m.Decision).where(m.Decision.run_id == run.id)).first():
        raise Conflict("This draft already has a decision")
    if run.route == "escalate" and req.action == "approve":
        raise Conflict(
            "An escalated draft proposes no change; edit it with a correction or reject it"
        )
    if run.route == "escalate" and user.role != "payroll_admin" and req.action == "edit":
        raise Forbidden("Escalated exceptions are resolved by a payroll administrator")
    if req.action in {"edit", "reject"} and req.reason_code == "AGREE":
        raise Unprocessable("Edit and reject need a reason other than AGREE")

    ops: list[dict[str, object]] = []
    if req.action == "approve":
        if not run.validations or not run.validations[-1].get("passed"):
            raise Conflict("Only drafts that passed every gate can be approved")
        ops = list((run.resolution or {}).get("operations", []))
    elif req.action == "edit":
        if not req.operations:
            raise Unprocessable("Edit requires operations")
        report = validate_edit(session, run, req.operations)
        if not report.passed:
            raise Unprocessable(
                "Edited correction failed validation: " + "; ".join(report.failure_messages())
            )
        ops = [o.model_dump() for o in req.operations]

    decision = m.Decision(
        id=_new_id("DEC"),
        run_id=run.id,
        exception_id=rec.id,
        actor_id=user.id,
        action=req.action,
        reason_code=req.reason_code,
        note=req.note,
        operations=ops,
        bulk=False,
        decided_at=datetime.now(UTC).replace(tzinfo=None),
    )
    session.add(decision)
    session.flush()
    revision_ids: list[str] = []
    resolved: list[str] = []
    new_ids: list[str] = []
    pay_after = None
    if req.action == "reject":
        rec.status = "open"
    elif any(o.get("op") == "escalate" for o in ops):
        rec.status = "escalated"
    else:
        before_ids = set(
            session.scalars(
                select(m.ExceptionRecord.id).where(m.ExceptionRecord.status.in_(ACTIVE))
            )
        )
        revision_ids, affected = _apply(session, run, rec, ops, decision)
        for emp_id in dict.fromkeys(affected):
            detect_employee(session, emp_id)
        session.flush()
        now = datetime.now(UTC).replace(tzinfo=None)
        rec.status, rec.resolved_at, rec.resolved_by_decision_id = "resolved", now, decision.id
        resolved.append(rec.id)
        for cid in run.clears:
            c = session.get(m.ExceptionRecord, cid)
            if c is not None and c.status == "superseded":
                c.status, c.resolved_by_decision_id = "resolved", decision.id
                resolved.append(c.id)
        after_ids = set(
            session.scalars(
                select(m.ExceptionRecord.id).where(m.ExceptionRecord.status.in_(ACTIVE))
            )
        )
        new_ids = sorted(after_ids - before_ids)
        week = load_week(session, rec.employee_id)
        from app.engine.detect import detect

        det = detect(week)
        pay_after = api.PaySnapshot(**pay_snapshot(week, det.shifts, det.params).as_dict())
    chain.append(
        session,
        actor_id=user.id,
        actor_role=user.role,
        event_type=f"decision.{req.action}",
        entity_type="exception",
        entity_id=rec.id,
        payload={
            "decision_id": decision.id,
            "run_id": run.id,
            "route": run.route,
            "reason_code": req.reason_code,
            "note": req.note,
            "operations": ops,
            "resolved": resolved,
            "new_exceptions": new_ids,
            "revisions": revision_ids,
            "model_id": run.model_id,
            "prompt_version": run.prompt_version,
        },
    )
    session.flush()
    return api.DecisionResult(
        decision=api.Decision(
            id=decision.id,
            action=req.action,
            reason_code=req.reason_code,
            note=req.note,
            actor_id=user.id,
            actor_name=user.name,
            decided_at=decision.decided_at,
            operations=ops,
            bulk=False,
        ),
        resolved_exception_ids=resolved,
        new_exception_ids=new_ids,
        revision_ids=revision_ids,
        pay_after=pay_after,
    )


def bulk_approve(
    session: Session, user: CurrentUser, draft_ids: list[str]
) -> api.BulkApproveResult:
    approved: list[str] = []
    skipped: list[api.BulkSkip] = []
    for did in draft_ids:
        run = session.get(m.PipelineRun, did)
        rec = session.get(m.ExceptionRecord, run.exception_id) if run else None
        if run is None or rec is None:
            skipped.append(api.BulkSkip(draft_id=did, reason="not found"))
            continue
        emp = session.get(m.Employee, rec.employee_id)
        if emp is None or not user.can_see_site(emp.site_code):
            skipped.append(api.BulkSkip(draft_id=did, reason="outside your scope"))
            continue
        ok, why = bulk_eligible(run, rec)
        if not ok or rec.status not in ACTIVE:
            skipped.append(
                api.BulkSkip(draft_id=did, reason=why if not ok else f"already {rec.status}")
            )
            continue
        try:
            decide(
                session,
                user,
                did,
                api.DecisionRequest(
                    action="approve",
                    reason_code="AGREE",
                    note="Bulk approval of verified low-risk drafts",
                ),
            )
            dec = session.scalars(select(m.Decision).where(m.Decision.run_id == did)).first()
            if dec:
                dec.bulk = True
            approved.append(did)
        except (Conflict, Unprocessable) as exc:
            skipped.append(api.BulkSkip(draft_id=did, reason=exc.detail))
    return api.BulkApproveResult(approved=approved, skipped=skipped)


def request_attestation(session: Session, user: CurrentUser, rec: m.ExceptionRecord) -> None:
    if rec.rule_id not in {
        "R-PUNCH-MISSING-OUT",
        "R-PUNCH-MISSING-IN",
        "R-BREAK-UNPAIRED",
        "R-PUNCH-SPAN",
    }:
        raise Unprocessable("Employee confirmation applies to missing or break punches only")
    rec.status = "awaiting_employee"
    chain.append(
        session,
        actor_id=user.id,
        actor_role=user.role,
        event_type="attestation.requested",
        entity_type="exception",
        entity_id=rec.id,
        payload={"employee_id": rec.employee_id},
    )


def submit_attestation(
    session: Session, user: CurrentUser, req: api.AttestationRequest
) -> api.Attestation:
    from app.harness.sanitize import sanitize

    rec = session.get(m.ExceptionRecord, req.exception_id)
    if rec is None or rec.employee_id != user.employee_id:
        raise Forbidden("You can only confirm your own exceptions")
    if rec.status not in ACTIVE:
        raise Conflict(f"Exception {rec.id} is already {rec.status}")
    when = date.fromisoformat(req.confirmed_at[:10])
    if abs((when - rec.work_date).days) > 1:
        raise Unprocessable("The confirmed time must be on or next to the work date")
    clean = sanitize(req.note)
    att = m.Attestation(
        id=_new_id("AT"),
        exception_id=rec.id,
        employee_id=rec.employee_id,
        confirmed_at_local=req.confirmed_at,
        note=clean.text or None,
        flags=clean.flags,
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    session.add(att)
    rec.status = "open"
    for r in session.scalars(select(m.PipelineRun).where(m.PipelineRun.exception_id == rec.id)):
        r.superseded = True
    chain.append(
        session,
        actor_id=user.id,
        actor_role=user.role,
        event_type="attestation.submitted",
        entity_type="exception",
        entity_id=rec.id,
        payload={"attestation_id": att.id, "confirmed_at": req.confirmed_at, "flags": clean.flags},
    )
    session.flush()
    return api.Attestation(
        id=att.id,
        exception_id=rec.id,
        confirmed_at=req.confirmed_at,
        note=att.note,
        flags=clean.flags,
    )
