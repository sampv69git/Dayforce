"""Assemble API view models from the database and the engine."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.contracts import api
from app.domain import models as m
from app.engine.constraints import build_envelope
from app.engine.detect import detect, fingerprint
from app.engine.pay import pay_snapshot
from app.engine.types import EmployeeWeek
from app.harness.sanitize import sanitize
from app.services.weeks import aware, demo_now, load_week

SEV_WEIGHT = {"critical": 4.0, "high": 3.0, "medium": 2.0, "low": 1.0}
ACTIVE = ("open", "suggested", "awaiting_employee", "escalated")


def employee_ref(session: Session, emp: m.Employee) -> api.EmployeeRef:
    site = session.get(m.Site, emp.site_code)
    assert site is not None
    return api.EmployeeRef(
        id=emp.id,
        name=emp.name,
        role=emp.role,
        title=emp.title,
        site=site.code,
        site_name=site.name,
        timezone=site.timezone,
        exempt=emp.exempt,
        hourly_rate=api.Money(amount=emp.hourly_rate, currency=site.currency),  # type: ignore[arg-type]
    )


def latest_run(session: Session, exception_id: str) -> m.PipelineRun | None:
    return session.scalars(
        select(m.PipelineRun)
        .where(
            m.PipelineRun.exception_id == exception_id,
            m.PipelineRun.fault.is_(None),
            m.PipelineRun.superseded.is_(False),
        )
        .order_by(m.PipelineRun.created_at.desc())
        .limit(1)
    ).first()


def run_decision(session: Session, run_id: str) -> m.Decision | None:
    return session.scalars(select(m.Decision).where(m.Decision.run_id == run_id)).first()


def bulk_eligible(run: m.PipelineRun, rec: m.ExceptionRecord) -> tuple[bool, str]:
    if run.route not in {"suggest", "manual"}:
        return False, f"route is {run.route}"
    if rec.severity not in {"low", "medium"}:
        return False, f"severity is {rec.severity}"
    last = run.validations[-1] if run.validations else {"passed": False}
    if not last.get("passed"):
        return False, "not every gate passed"
    if run.evidence_strength.get("level") != "high":
        return False, "evidence strength is not high"
    before = (
        run.pay_before.get("regular_hours", 0)
        + run.pay_before.get("overtime_hours", 0)
        + run.pay_before.get("double_time_hours", 0)
    )
    after = (
        run.pay_after.get("regular_hours", 0)
        + run.pay_after.get("overtime_hours", 0)
        + run.pay_after.get("double_time_hours", 0)
    )
    if after < before - 0.01:
        return False, "reduces paid hours"
    ops = (run.resolution or {}).get("operations", [])
    if any(o.get("punch_type") in {"MEAL_START", "MEAL_END"} for o in ops):
        return False, "changes break punches"
    if any(o.get("op") in {"add_punch", "void_punch", "reassign_shift"} for o in ops):
        return False, "changes punches or schedules"
    return True, "eligible"


def _pay_impact(run: m.PipelineRun | None) -> api.Money | None:
    if not run or not run.pay_before or not run.pay_after:
        return None
    b, a = run.pay_before["cost"], run.pay_after["cost"]
    return api.Money(amount=round(a["amount"] - b["amount"], 2), currency=b["currency"])


def summary(
    session: Session,
    rec: m.ExceptionRecord,
    emp: m.Employee | None = None,
    run: m.PipelineRun | None = None,
    notes: set[tuple[str, date]] | None = None,
) -> api.ExceptionSummary:
    emp = emp or session.get(m.Employee, rec.employee_id)
    assert emp is not None
    run = run if run is not None else latest_run(session, rec.id)
    impact = _pay_impact(run)
    weight = SEV_WEIGHT[rec.severity]
    risk = weight * (1 + min(abs(impact.amount) / 250 if impact else 0.0, 3.0))
    if rec.symptom_ids:
        risk *= 1 + 0.25 * len(rec.symptom_ids)
    if rec.status in {"resolved", "superseded"}:
        risk = 0.0
    eligible = bool(run) and rec.status in ACTIVE and bulk_eligible(run, rec)[0]  # type: ignore[arg-type]
    if notes is None:
        has_note = (
            session.scalars(
                select(m.EmployeeNote.id).where(
                    m.EmployeeNote.employee_id == rec.employee_id,
                    m.EmployeeNote.work_date == rec.work_date,
                )
            ).first()
            is not None
        )
    else:
        has_note = (rec.employee_id, rec.work_date) in notes
    return api.ExceptionSummary(
        id=rec.id,
        rule_id=rec.rule_id,
        title=rec.title,
        summary=rec.summary,
        family=rec.family,
        severity=rec.severity,  # type: ignore[arg-type]
        employee_id=emp.id,
        employee_name=emp.name,
        site=emp.site_code,
        work_date=rec.work_date,
        status=rec.status,  # type: ignore[arg-type]
        route=run.route if run else None,  # type: ignore[arg-type]
        evidence_strength=run.evidence_strength.get("level") if run else None,
        pay_impact=impact,
        risk_score=round(risk, 2),
        root_id=rec.root_id,
        symptom_ids=rec.symptom_ids,
        bulk_eligible=eligible,
        has_untrusted_note=has_note,
        draft_id=run.id if run else None,
        resolved_by_root=bool(
            rec.resolved_by_decision_id and rec.status == "resolved" and rec.root_id
        ),
    )


def queue(session: Session, sites: list[str], status: str | None = None) -> api.ExceptionQueue:
    rows = session.execute(
        select(m.ExceptionRecord, m.Employee)
        .join(m.Employee, m.Employee.id == m.ExceptionRecord.employee_id)
        .where(m.Employee.site_code.in_(sites))
    ).all()
    notes = {(n.employee_id, n.work_date) for n in session.scalars(select(m.EmployeeNote))}
    items = [
        summary(session, rec, emp, notes=notes)
        for rec, emp in rows
        if rec.status != "superseded" or rec.resolved_by_decision_id
    ]
    counts = {
        "all": sum(1 for i in items if i.status in ACTIVE),
        "ready": sum(
            1
            for i in items
            if i.status == "suggested" and i.route in {"suggest", "fallback", "manual"}
        ),
        "needs_you": sum(1 for i in items if i.status == "open"),
        "awaiting_employee": sum(1 for i in items if i.status == "awaiting_employee"),
        "escalated": sum(1 for i in items if i.status == "escalated"),
        "resolved": sum(1 for i in items if i.status in {"resolved", "superseded"}),
    }
    if status:
        items = [i for i in items if i.status == status]
    items.sort(key=lambda i: (i.status not in ACTIVE, -i.risk_score, i.work_date, i.id))
    return api.ExceptionQueue(items=items, counts=counts)


def _fmt(week: EmployeeWeek, dt: datetime) -> str:
    return week.local(dt).strftime("%Y-%m-%dT%H:%M")


def timeline(session: Session, week: EmployeeWeek, days: list[date]) -> api.Timeline:
    det = detect(week)
    voided = {
        p.id
        for p in session.scalars(
            select(m.Punch).where(
                m.Punch.employee_id == week.employee.id, m.Punch.voided_by_revision_id.is_not(None)
            )
        )
    }
    all_punches = session.scalars(
        select(m.Punch).where(m.Punch.employee_id == week.employee.id)
    ).all()
    worked: dict[date, float] = {}
    for s in det.shifts:
        if s.complete:
            worked[s.work_date] = worked.get(s.work_date, 0.0) + (s.worked_hours or 0.0)
    out: list[api.TimelineDay] = []
    for d in days:

        def on_day(dt: datetime, _d: date = d) -> bool:
            return week.local_date(dt) == _d

        scheds = [
            api.TimelineSchedule(
                id=s.id, start=_fmt(week, s.start), end=_fmt(week, s.end), future=s.start > week.now
            )
            for s in week.schedules
            if on_day(s.start)
        ]
        punches = [
            api.TimelinePunch(
                id=p.id,
                type=p.type,
                at=_fmt(week, aware(p.at_utc)),
                source=p.source,
                voided=p.id in voided,
            )
            for p in all_punches
            if on_day(aware(p.at_utc))
        ]
        punches.sort(key=lambda p: p.at)
        ev = [
            api.EvidenceItem(
                id=f"{'badge' if e.kind.startswith('badge') else 'scan'}:{e.id}",
                kind=e.kind,
                at=_fmt(week, e.at),
                strength="strong" if e.kind.startswith("badge") else "medium",
                source=e.location,
                simulated=True,
            )
            for e in week.evidence
            if on_day(e.at)
        ]
        out.append(
            api.TimelineDay(
                date=d,
                schedules=scheds,
                punches=punches,
                evidence=ev,
                worked_hours=round(worked[d], 2) if d in worked else None,
            )
        )
    return api.Timeline(timezone=week.employee.site.timezone, days=out)


def draft_view(session: Session, run: m.PipelineRun) -> api.Draft:
    rec = session.get(m.ExceptionRecord, run.exception_id)
    assert rec is not None
    dec = run_decision(session, run.id)
    clears: list[api.ClearedRef] = []
    for cid in run.clears:
        c = session.get(m.ExceptionRecord, cid)
        if c:
            clears.append(
                api.ClearedRef(id=c.id, rule_id=c.rule_id, title=c.title, work_date=c.work_date)
            )
    decision = None
    if dec:
        actor = session.get(m.User, dec.actor_id)
        decision = api.Decision(
            id=dec.id,
            action=dec.action,  # type: ignore[arg-type]
            reason_code=dec.reason_code,
            note=dec.note,
            actor_id=dec.actor_id,
            actor_name=actor.display_name if actor else dec.actor_id,
            decided_at=dec.decided_at,
            operations=dec.operations,
            bulk=dec.bulk,
        )
    validations = [api.ValidationReport(**v) for v in run.validations]
    return api.Draft(
        id=run.id,
        exception_id=run.exception_id,
        route=run.route,  # type: ignore[arg-type]
        repaired=run.repaired,
        provider=run.provider,
        model_id=run.model_id,
        prompt_version=run.prompt_version,
        attempts=run.attempts,
        fault=run.fault,
        resolution=run.resolution,  # type: ignore[arg-type]
        fallback_reason=run.fallback_reason,
        escalation_reason=run.escalation_reason,
        validation=validations[-1],
        validations=validations,
        evidence_strength=api.EvidenceStrength(**run.evidence_strength),
        retrieved=[api.RetrievedClause(**r) for r in run.retrieved],
        pay_before=api.PaySnapshot(**run.pay_before),
        pay_after=api.PaySnapshot(**run.pay_after),
        clears=clears,
        introduces=run.introduces,
        latency_ms=run.latency_ms,
        tokens=run.tokens,
        trace_id=run.trace_id,
        created_at=run.created_at,
        decision=decision,
        bulk_eligible=bulk_eligible(run, rec)[0] and rec.status in ACTIVE and dec is None,
    )


def run_summary(session: Session, run: m.PipelineRun) -> api.RunSummary:
    failed = sorted(
        {
            g["id"]
            for v in run.validations[: run.attempts]
            for g in v["gates"]
            if g["status"] == "fail"
        }
    )
    return api.RunSummary(
        run_id=run.id,
        exception_id=run.exception_id,
        route=run.route,  # type: ignore[arg-type]
        failed_gates=failed,
        provider=run.provider,
        model_id=run.model_id,
        fault=run.fault,
        latency_ms=run.latency_ms,
        created_at=run.created_at,
        decided=run_decision(session, run.id) is not None,
    )


def detail(session: Session, rec: m.ExceptionRecord) -> api.ExceptionDetail:
    emp = session.get(m.Employee, rec.employee_id)
    assert emp is not None
    week = load_week(session, emp.id)
    det = detect(week)
    finding = next((f for f in det.findings if fingerprint(emp.id, f) == rec.fingerprint), None)
    evidence: list[api.EvidenceItem] = []
    windows: list[api.Window] = []
    allowed: list[str] = []
    if finding is not None:
        env = build_envelope(det, finding)
        evidence = [api.EvidenceItem(**e.public()) for e in env.evidence]
        windows = [api.Window(**w) for w in env.windows_public(week)]
        allowed = env.allowed_ops
    run = latest_run(session, rec.id)
    base = summary(session, rec, emp, run)
    notes = session.scalars(
        select(m.EmployeeNote).where(
            m.EmployeeNote.employee_id == emp.id, m.EmployeeNote.work_date == rec.work_date
        )
    ).all()
    note_text = "\n".join(n.text for n in notes)
    untrusted = None
    if note_text:
        s = sanitize(note_text)
        untrusted = api.UntrustedText(text=s.text, flags=s.flags)
    span_end = rec.work_date + timedelta(days=1)
    if rec.rule_id == "R-PUNCH-SPAN":
        span_end = rec.work_date + timedelta(days=2)
    days = [
        rec.work_date - timedelta(days=1) + timedelta(days=i)
        for i in range((span_end - rec.work_date).days + 2)
    ]
    runs = session.scalars(
        select(m.PipelineRun)
        .where(m.PipelineRun.exception_id == rec.id)
        .order_by(m.PipelineRun.created_at.desc())
    ).all()
    atts = session.scalars(select(m.Attestation).where(m.Attestation.exception_id == rec.id)).all()
    return api.ExceptionDetail(
        **base.model_dump(),
        employee=employee_ref(session, emp),
        evidence=evidence,
        evidence_facts=rec.evidence,
        untrusted_note=untrusted,
        timeline=timeline(session, week, days),
        allowed_ops=allowed,
        windows=windows,
        latest_draft=draft_view(session, run) if run else None,
        history=[run_summary(session, r) for r in runs],
        attestations=[
            {
                "id": a.id,
                "confirmed_at": a.confirmed_at_local,
                "note": a.note,
                "flags": a.flags,
                "created_at": a.created_at.isoformat(),
            }
            for a in atts
        ],
    )


def pay_period(session: Session, sites: list[str]) -> api.PayPeriod:
    from app.config import get_settings

    q = queue(session, sites)
    s = get_settings()
    ws = date.fromisoformat(s.week_start)
    total = sum(1 for i in q.items)
    return api.PayPeriod(
        week_start=ws,
        week_end=ws + timedelta(days=6),
        now=s.demo_now,
        cutoff_at=s.payroll_cutoff,
        total=total,
        resolved=q.counts["resolved"],
        ready_to_countersign=q.counts["ready"],
        escalated=q.counts["escalated"],
    )


def timecard(session: Session, emp: m.Employee) -> api.Timecard:
    week = load_week(session, emp.id)
    det = detect(week)
    pay = pay_snapshot(week, det.shifts, det.params)
    days = [week.week_start + timedelta(days=i) for i in range(7)]
    recs = session.scalars(
        select(m.ExceptionRecord).where(m.ExceptionRecord.employee_id == emp.id)
    ).all()
    revisions: list[api.Revision] = []
    for rev in session.scalars(
        select(m.TimecardRevision)
        .where(m.TimecardRevision.employee_id == emp.id)
        .order_by(m.TimecardRevision.created_at)
    ):
        dec = session.get(m.Decision, rev.decision_id)
        actor = session.get(m.User, dec.actor_id) if dec else None
        revisions.append(
            api.Revision(
                id=rev.id,
                decision_id=rev.decision_id,
                created_at=rev.created_at,
                operations=rev.operations,
                actor_name=actor.display_name if actor else "",
                reason_code=dec.reason_code if dec else "",
            )
        )
    return api.Timecard(
        employee=employee_ref(session, emp),
        week_start=week.week_start,
        timeline=timeline(session, week, days),
        pay=api.PaySnapshot(**pay.as_dict()),
        exceptions=[summary(session, r, emp) for r in recs if r.status != "superseded"],
        revisions=revisions,
    )


def now_naive() -> datetime:
    return demo_now().replace(tzinfo=None)


def as_dict(model: Any) -> dict[str, Any]:
    return model.model_dump() if hasattr(model, "model_dump") else dict(model)
