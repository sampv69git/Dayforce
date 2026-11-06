"""Detection service: run the engine for every employee and persist exceptions idempotently.

Usage: `uv run python -m app.services.detection`
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import chain
from app.config import get_settings
from app.domain import models as m
from app.engine.cascade import link_cascades
from app.engine.catalog import RULES
from app.engine.detect import detect, fingerprint
from app.services.weeks import load_week

ACTIVE = ("open", "suggested", "awaiting_employee", "escalated")


@dataclass
class DetectionSummary:
    created: int = 0
    unchanged: int = 0
    superseded: int = 0


def _next_id(session: Session, site: str) -> str:
    prefix = f"EXC-{site}-"
    ids = session.scalars(
        select(m.ExceptionRecord.id).where(m.ExceptionRecord.id.like(f"{prefix}%"))
    ).all()
    n = max((int(i.rsplit("-", 1)[1]) for i in ids), default=0) + 1
    return f"{prefix}{n:04d}"


def detect_employee(
    session: Session, employee_id: str, summary: DetectionSummary | None = None
) -> DetectionSummary:
    summary = summary or DetectionSummary()
    week = load_week(session, employee_id)
    det = detect(week)
    links = link_cascades(det)
    root_of = {sym: root for root, syms in links.items() for sym in syms}
    now = datetime.now(UTC).replace(tzinfo=None)
    existing = {
        e.fingerprint: e
        for e in session.scalars(
            select(m.ExceptionRecord).where(
                m.ExceptionRecord.employee_id == employee_id, m.ExceptionRecord.status.in_(ACTIVE)
            )
        )
    }
    current: dict[str, m.ExceptionRecord] = {}
    site = week.employee.site.code
    for f in det.findings:
        fp = fingerprint(employee_id, f)
        meta = RULES[f.rule_id]
        rec = existing.get(fp)
        if rec is None:
            rec = m.ExceptionRecord(
                id=_next_id(session, site),
                rule_id=f.rule_id,
                family=meta.family,
                severity=meta.severity,
                title=meta.title,
                summary=f.summary,
                employee_id=employee_id,
                work_date=f.work_date,
                fingerprint=fp,
                status="open",
                evidence=f.evidence,
                symptom_ids=[],
                policy_version=get_settings().policy_version,
                detected_at=now,
            )
            session.add(rec)
            session.flush()
            summary.created += 1
        else:
            rec.summary, rec.evidence = f.summary, f.evidence
            summary.unchanged += 1
        current[fp] = rec
    for fp, rec in existing.items():
        if fp not in current:
            rec.status = "superseded"
            rec.resolved_at = now
            summary.superseded += 1
    for fp, rec in current.items():
        rec.root_id = current[root_of[fp]].id if fp in root_of and root_of[fp] in current else None
        rec.symptom_ids = [current[s].id for s in links.get(fp, []) if s in current]
    return summary


def detect_all(
    session: Session, actor_id: str = "system", actor_role: str = "system"
) -> DetectionSummary:
    summary = DetectionSummary()
    ids = session.scalars(
        select(m.Employee.id).where(m.Employee.role != "manager").order_by(m.Employee.id)
    ).all()
    for emp_id in ids:
        detect_employee(session, emp_id, summary)
    chain.append(
        session,
        actor_id=actor_id,
        actor_role=actor_role,
        event_type="detection.run",
        entity_type="detection",
        entity_id="all",
        payload={
            "created": summary.created,
            "unchanged": summary.unchanged,
            "superseded": summary.superseded,
            "policy_version": get_settings().policy_version,
        },
    )
    return summary


def main() -> None:
    from app.db import session_scope

    with session_scope() as s:
        print(detect_all(s))


if __name__ == "__main__":
    main()
