"""ORM models. All datetimes are stored as naive UTC; site time zones apply at the edges."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, Embedding

JsonDict = dict[str, Any]


class Site(Base):
    __tablename__ = "sites"

    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(64))
    jurisdiction: Mapped[str] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(3))


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    site_code: Mapped[str] = mapped_column(ForeignKey("sites.code"))
    role: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(80))
    manager_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    exempt: Mapped[bool] = mapped_column(Boolean, default=False)
    hourly_rate: Mapped[float] = mapped_column(Float)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(80))
    site_scope: Mapped[list[str]] = mapped_column(JSON, default=list)
    employee_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ShiftSchedule(Base):
    __tablename__ = "shift_schedules"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    start_utc: Mapped[datetime] = mapped_column(DateTime)
    end_utc: Mapped[datetime] = mapped_column(DateTime)
    meal_minutes: Mapped[int] = mapped_column(Integer, default=30)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Punch(Base):
    __tablename__ = "punches"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    type: Mapped[str] = mapped_column(String(12))
    at_utc: Mapped[datetime] = mapped_column(DateTime)
    source: Mapped[str] = mapped_column(String(12), default="clock")
    revision_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    voided_by_revision_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class EvidenceEvent(Base):
    __tablename__ = "evidence_events"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    at_utc: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[str | None] = mapped_column(String(80), nullable=True)


class EmployeeNote(Base):
    """Free-text note an employee attached to a work date (untrusted input)."""

    __tablename__ = "employee_notes"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class PolicyClause(Base):
    __tablename__ = "policy_clauses"

    clause_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    version: Mapped[str] = mapped_column(String(16))
    document_id: Mapped[str] = mapped_column(String(24))
    document_title: Mapped[str] = mapped_column(String(120))
    section: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(160))
    text: Mapped[str] = mapped_column(Text)
    jurisdictions: Mapped[list[str]] = mapped_column(JSON, default=list)
    employee_classes: Mapped[list[str]] = mapped_column(JSON, default=list)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    precedence: Mapped[str] = mapped_column(String(12), default="base")
    rule_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    embedding: Mapped[list[float] | None] = mapped_column(Embedding, nullable=True)


class ExceptionRecord(Base):
    __tablename__ = "exceptions"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    rule_id: Mapped[str] = mapped_column(String(32), index=True)
    family: Mapped[str] = mapped_column(String(20))
    severity: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    evidence: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    root_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    symptom_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    policy_version: Mapped[str] = mapped_column(String(16))
    detected_at: Mapped[datetime] = mapped_column(DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by_decision_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    first_viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    exception_id: Mapped[str] = mapped_column(ForeignKey("exceptions.id"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    model_id: Mapped[str] = mapped_column(String(64))
    prompt_version: Mapped[str] = mapped_column(String(16))
    prompt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    fault: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    route: Mapped[str] = mapped_column(String(12))
    repaired: Mapped[bool] = mapped_column(Boolean, default=False)
    context: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    retrieved: Mapped[list[JsonDict]] = mapped_column(JSON, default=list)
    prompts: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    raw_outputs: Mapped[list[str]] = mapped_column(JSON, default=list)
    resolution: Mapped[JsonDict | None] = mapped_column(JSON, nullable=True)
    validations: Mapped[list[JsonDict]] = mapped_column(JSON, default=list)
    evidence_strength: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    pay_before: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    pay_after: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    clears: Mapped[list[str]] = mapped_column(JSON, default=list)
    introduces: Mapped[list[str]] = mapped_column(JSON, default=list)
    fallback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    trace_id: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    superseded: Mapped[bool] = mapped_column(Boolean, default=False)


class TraceSpan(Base):
    __tablename__ = "trace_spans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trace_id: Mapped[str] = mapped_column(String(32), index=True)
    span_id: Mapped[str] = mapped_column(String(16))
    parent_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    name: Mapped[str] = mapped_column(String(40))
    start: Mapped[datetime] = mapped_column(DateTime)
    end: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(8), default="ok")
    attributes: Mapped[JsonDict] = mapped_column(JSON, default=dict)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("pipeline_runs.id"), index=True)
    exception_id: Mapped[str] = mapped_column(ForeignKey("exceptions.id"), index=True)
    actor_id: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(10))
    reason_code: Mapped[str] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    operations: Mapped[list[JsonDict]] = mapped_column(JSON, default=list)
    bulk: Mapped[bool] = mapped_column(Boolean, default=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime)


class TimecardRevision(Base):
    __tablename__ = "timecard_revisions"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    decision_id: Mapped[str] = mapped_column(ForeignKey("decisions.id"))
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    operations: Mapped[list[JsonDict]] = mapped_column(JSON, default=list)
    added_punch_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    voided_punch_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class PayAdjustment(Base):
    """Premiums recorded and overtime approvals, produced only by human decisions."""

    __tablename__ = "pay_adjustments"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    decision_id: Mapped[str] = mapped_column(ForeignKey("decisions.id"))
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(24))
    hours: Mapped[float] = mapped_column(Float, default=0.0)
    rule_id: Mapped[str | None] = mapped_column(String(32), nullable=True)


class ScheduleChange(Base):
    __tablename__ = "schedule_changes"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    decision_id: Mapped[str] = mapped_column(ForeignKey("decisions.id"))
    shift_id: Mapped[str] = mapped_column(ForeignKey("shift_schedules.id"))
    from_employee_id: Mapped[str] = mapped_column(String(16))
    to_employee_id: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime)


class Attestation(Base):
    __tablename__ = "attestations"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    exception_id: Mapped[str] = mapped_column(ForeignKey("exceptions.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    confirmed_at_local: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime)
    actor_id: Mapped[str] = mapped_column(String(32))
    actor_role: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_type: Mapped[str] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(32), index=True)
    payload: Mapped[JsonDict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[JsonDict] = mapped_column(JSON, default=dict)


Index("ix_exceptions_employee_date", ExceptionRecord.employee_id, ExceptionRecord.work_date)
Index("ix_punches_employee_at", Punch.employee_id, Punch.at_utc)
