"""Build engine EmployeeWeek objects from the database."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain import models as m
from app.engine.params import HOLIDAYS
from app.engine.types import (
    Adjustment,
    Attest,
    Employee,
    EmployeeWeek,
    Evidence,
    Punch,
    Schedule,
    Site,
)


def aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def demo_now() -> datetime:
    return get_settings().demo_now.astimezone(UTC)


def week_start() -> date:
    return date.fromisoformat(get_settings().week_start)


def to_site(row: m.Site) -> Site:
    return Site(row.code, row.timezone, row.jurisdiction, row.currency)


def to_employee(row: m.Employee, site: m.Site) -> Employee:
    return Employee(row.id, row.name, to_site(site), row.role, row.exempt, row.hourly_rate)


def load_week(session: Session, employee_id: str) -> EmployeeWeek:
    emp = session.get(m.Employee, employee_id)
    if emp is None:
        raise KeyError(employee_id)
    site = session.get(m.Site, emp.site_code)
    assert site is not None
    ws = week_start()
    lo = datetime.combine(ws - timedelta(days=8), datetime.min.time())
    hi = datetime.combine(ws + timedelta(days=9), datetime.min.time())
    punches = session.scalars(
        select(m.Punch).where(
            m.Punch.employee_id == employee_id,
            m.Punch.voided_by_revision_id.is_(None),
            m.Punch.at_utc >= lo,
            m.Punch.at_utc < hi,
        )
    ).all()
    schedules = session.scalars(
        select(m.ShiftSchedule).where(
            m.ShiftSchedule.employee_id == employee_id,
            m.ShiftSchedule.active.is_(True),
            m.ShiftSchedule.start_utc >= lo,
            m.ShiftSchedule.start_utc < hi,
        )
    ).all()
    evidence = session.scalars(
        select(m.EvidenceEvent).where(
            m.EvidenceEvent.employee_id == employee_id,
            m.EvidenceEvent.at_utc >= lo,
            m.EvidenceEvent.at_utc < hi,
        )
    ).all()
    adjustments = session.scalars(
        select(m.PayAdjustment).where(m.PayAdjustment.employee_id == employee_id)
    ).all()
    attestations = session.execute(
        select(m.Attestation, m.ExceptionRecord)
        .join(m.ExceptionRecord, m.ExceptionRecord.id == m.Attestation.exception_id)
        .where(m.Attestation.employee_id == employee_id)
    ).all()
    notes = session.scalars(
        select(m.EmployeeNote).where(m.EmployeeNote.employee_id == employee_id)
    ).all()
    employee = to_employee(emp, site)
    tz = employee.site.tz
    return EmployeeWeek(
        employee=employee,
        week_start=ws,
        now=demo_now(),
        punches=tuple(Punch(p.id, p.type, aware(p.at_utc), p.source) for p in punches),
        schedules=tuple(
            Schedule(s.id, s.employee_id, aware(s.start_utc), aware(s.end_utc), s.meal_minutes)
            for s in schedules
        ),
        evidence=tuple(Evidence(e.id, e.kind, aware(e.at_utc), e.location) for e in evidence),
        adjustments=tuple(Adjustment(a.kind, a.work_date, a.hours, a.rule_id) for a in adjustments),
        attestations=tuple(
            Attest(
                a.id,
                x.rule_id,
                x.work_date,
                datetime.strptime(a.confirmed_at_local, "%Y-%m-%dT%H:%M")
                .replace(tzinfo=tz)
                .astimezone(UTC),
                a.note,
            )
            for a, x in attestations
        ),
        holidays=HOLIDAYS.get(site.jurisdiction, frozenset()),
        notes=tuple((n.work_date, n.text) for n in notes),
    )


def site_weeks(session: Session, site_code: str) -> list[EmployeeWeek]:
    ids = session.scalars(
        select(m.Employee.id).where(m.Employee.site_code == site_code, m.Employee.role != "manager")
    ).all()
    return [load_week(session, i) for i in ids]
