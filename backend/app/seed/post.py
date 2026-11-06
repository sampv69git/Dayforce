"""Post-seed steps: run detection, then attach planted attestations and attestation requests."""

from __future__ import annotations

from datetime import UTC

from sqlalchemy import select

from app.audit import chain
from app.db import session_scope
from app.domain import models as m
from app.seed.generator import Dataset
from app.services.detection import detect_all


def after_seed(ds: Dataset) -> None:
    with session_scope() as s:
        chain.append(
            s,
            actor_id="system",
            actor_role="system",
            event_type="seed.loaded",
            entity_type="dataset",
            entity_id=ds.digest()[:16],
            payload={"employees": len(ds.employees), "punches": len(ds.punches), "synthetic": True},
        )
        detect_all(s)
    with session_scope() as s:
        for a in ds.attestations:
            exc = s.scalars(
                select(m.ExceptionRecord).where(
                    m.ExceptionRecord.employee_id == a.employee_id,
                    m.ExceptionRecord.rule_id == a.rule_id,
                    m.ExceptionRecord.work_date == a.work_date,
                )
            ).first()
            if exc is None:
                continue
            s.add(
                m.Attestation(
                    id=a.id,
                    exception_id=exc.id,
                    employee_id=a.employee_id,
                    confirmed_at_local=a.confirmed_at_local,
                    note=a.note,
                    flags=[],
                    created_at=a.created_at.astimezone(UTC).replace(tzinfo=None),
                )
            )
        for emp, work_date, rule_id in ds.attestation_requests:
            exc = s.scalars(
                select(m.ExceptionRecord).where(
                    m.ExceptionRecord.employee_id == emp,
                    m.ExceptionRecord.rule_id == rule_id,
                    m.ExceptionRecord.work_date == work_date,
                )
            ).first()
            if exc is not None:
                exc.status = "awaiting_employee"
                chain.append(
                    s,
                    actor_id="u-maya",
                    actor_role="manager",
                    event_type="attestation.requested",
                    entity_type="exception",
                    entity_id=exc.id,
                    payload={"employee_id": emp},
                )
    # Second pass: attestations can unlock root-cause corrections, so re-link cascades.
    with session_scope() as s:
        detect_all(s)
