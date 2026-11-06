"""API request and response models. These generate openapi.yaml and, from it, the frontend types."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.contracts.draft import DraftResolution, Operation


def _as_utc(value: datetime) -> datetime:
    """Stored timestamps are naive UTC; expose them as explicit UTC (RFC 3339)."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]
Role = Literal["employee", "manager", "payroll_admin"]
Severity = Literal["critical", "high", "medium", "low"]
Route = Literal["suggest", "fallback", "escalate", "manual"]
ExceptionStatus = Literal[
    "open", "suggested", "awaiting_employee", "escalated", "resolved", "superseded"
]


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Problem(Model):
    """RFC 9457 problem details."""

    type: str
    title: str
    status: int
    detail: str | None = None
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": Problem,
        "description": description,
        "content": {
            "application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}
        },
    }


PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: _problem("Malformed request body"),
    401: _problem("Not authenticated"),
    403: _problem("Outside your role or site scope"),
    404: _problem("Not found"),
    409: _problem("Conflict with the current state"),
    422: _problem("Validation failed"),
}


# ---- auth -------------------------------------------------------------------------------
class Persona(Model):
    user_id: str
    display_name: str
    role: Role
    title: str
    site: str | None
    summary: str


class User(Model):
    user_id: str
    display_name: str
    role: Role
    site_scope: list[str]
    employee_id: str | None
    email: str | None = None
    auth_method: Literal["password", "demo"] | None = None


class DemoLoginRequest(Input):
    user_id: str = Field(max_length=40)


class TokenResponse(Model):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Seconds until the token expires")
    user: User


class LoginRequest(Input):
    email: str = Field(min_length=3, max_length=254, examples=["maya.chen@kestrel.example"])
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(Input):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class AuthConfig(Model):
    password_login: bool = True
    demo_login: bool
    min_password_length: int
    lockout_after_attempts: int


class SignedOut(Model):
    status: Literal["signed_out"] = "signed_out"


# ---- shared -----------------------------------------------------------------------------
class Money(Model):
    amount: float
    currency: Literal["USD", "INR"]


class PaySnapshot(Model):
    regular_hours: float
    overtime_hours: float
    double_time_hours: float
    premium_hours: float
    cost: Money
    unpaid_shifts: int


class EvidenceItem(Model):
    id: str
    kind: str
    at: str
    strength: Literal["strong", "medium", "weak"]
    source: str | None
    simulated: bool


class EmployeeRef(Model):
    id: str
    name: str
    role: str
    title: str
    site: str
    site_name: str
    timezone: str
    exempt: bool
    hourly_rate: Money


class UntrustedText(Model):
    text: str
    flags: list[str]


class EvidenceStrength(Model):
    score: float
    level: Literal["high", "medium", "low"]
    factors: dict[str, float]
    basis: str


# ---- timeline ---------------------------------------------------------------------------
class TimelinePunch(Model):
    id: str
    type: str
    at: str
    source: str
    voided: bool


class TimelineSchedule(Model):
    id: str
    start: str
    end: str
    future: bool


class TimelineDay(Model):
    date: date
    schedules: list[TimelineSchedule]
    punches: list[TimelinePunch]
    evidence: list[EvidenceItem]
    worked_hours: float | None


class Timeline(Model):
    timezone: str
    days: list[TimelineDay]


# ---- exceptions -------------------------------------------------------------------------
class ExceptionSummary(Model):
    id: str
    rule_id: str
    title: str
    summary: str
    family: str
    severity: Severity
    employee_id: str
    employee_name: str
    site: str
    work_date: date
    status: ExceptionStatus
    route: Route | None
    evidence_strength: Literal["high", "medium", "low"] | None
    pay_impact: Money | None
    risk_score: float
    root_id: str | None
    symptom_ids: list[str]
    bulk_eligible: bool
    has_untrusted_note: bool
    draft_id: str | None
    resolved_by_root: bool


class ExceptionQueue(Model):
    items: list[ExceptionSummary]
    counts: dict[str, int]


class GateResult(Model):
    id: str
    name: str
    status: Literal["pass", "fail", "skip"]
    detail: str


class ValidationReport(Model):
    passed: bool
    attempt: int
    gates: list[GateResult]


class RetrievedClause(Model):
    clause_id: str
    document_id: str
    document_title: str
    title: str
    text: str
    bm25_rank: int | None
    dense_rank: int | None
    fused_score: float
    required: bool
    precedence: str


class Decision(Model):
    id: str
    action: Literal["approve", "edit", "reject"]
    reason_code: str
    note: str | None
    actor_id: str
    actor_name: str
    decided_at: UTCDateTime
    operations: list[dict[str, Any]]
    bulk: bool


class ClearedRef(Model):
    id: str
    rule_id: str
    title: str
    work_date: date


class Draft(Model):
    id: str
    exception_id: str
    route: Route
    repaired: bool
    provider: str
    model_id: str
    prompt_version: str
    attempts: int
    fault: str | None
    resolution: DraftResolution | None
    fallback_reason: str | None
    escalation_reason: str | None
    validation: ValidationReport
    validations: list[ValidationReport]
    evidence_strength: EvidenceStrength
    retrieved: list[RetrievedClause]
    pay_before: PaySnapshot
    pay_after: PaySnapshot
    clears: list[ClearedRef]
    introduces: list[str]
    latency_ms: int
    tokens: dict[str, int]
    trace_id: str
    created_at: UTCDateTime
    decision: Decision | None
    bulk_eligible: bool


class Window(Model):
    slot: str
    punch_type: str
    earliest: str
    latest: str


class RunSummary(Model):
    run_id: str
    exception_id: str
    route: Route
    failed_gates: list[str]
    provider: str
    model_id: str
    fault: str | None
    latency_ms: int
    created_at: UTCDateTime
    decided: bool


class ExceptionDetail(ExceptionSummary):
    employee: EmployeeRef
    evidence: list[EvidenceItem]
    evidence_facts: dict[str, Any]
    untrusted_note: UntrustedText | None
    timeline: Timeline
    allowed_ops: list[str]
    windows: list[Window]
    latest_draft: Draft | None
    history: list[RunSummary]
    attestations: list[dict[str, Any]]


class DraftRequest(Input):
    force: bool = False


class EditValidationRequest(Input):
    operations: list[Operation] = Field(min_length=1, max_length=6)


class DecisionRequest(Input):
    action: Literal["approve", "edit", "reject"]
    reason_code: Literal[
        "AGREE",
        "TIME_ADJUSTED",
        "EVIDENCE_PREFERRED",
        "EMPLOYEE_CONFIRMED",
        "INCORRECT_TIME",
        "WRONG_ACTION",
        "POLICY_MISAPPLIED",
        "NEEDS_INVESTIGATION",
        "OTHER",
    ]
    note: str | None = Field(default=None, max_length=500)
    operations: list[Operation] | None = Field(default=None, max_length=6)


class DecisionResult(Model):
    decision: Decision
    resolved_exception_ids: list[str]
    new_exception_ids: list[str]
    revision_ids: list[str]
    pay_after: PaySnapshot | None


class BulkApproveRequest(Input):
    draft_ids: list[str] = Field(min_length=1, max_length=50)


class BulkSkip(Model):
    draft_id: str
    reason: str


class BulkApproveResult(Model):
    approved: list[str]
    skipped: list[BulkSkip]


class PayPeriod(Model):
    week_start: date
    week_end: date
    now: UTCDateTime
    cutoff_at: UTCDateTime
    total: int
    resolved: int
    ready_to_countersign: int
    escalated: int
    synthetic: bool = True


# ---- timecards, forecast ----------------------------------------------------------------
class Revision(Model):
    id: str
    decision_id: str
    created_at: UTCDateTime
    operations: list[dict[str, Any]]
    actor_name: str
    reason_code: str


class Timecard(Model):
    employee: EmployeeRef
    week_start: date
    timeline: Timeline
    pay: PaySnapshot
    exceptions: list[ExceptionSummary]
    revisions: list[Revision]


class SimulateRequest(Input):
    exception_id: str
    operations: list[Operation] = Field(min_length=1, max_length=6)


class SimulationResult(Model):
    target_cleared: bool
    cleared: list[str]
    introduced: list[str]
    pay_before: PaySnapshot
    pay_after: PaySnapshot
    error: str | None


class ForecastDay(Model):
    date: date
    worked_hours: float
    scheduled_hours: float
    future: bool


class ForecastRow(Model):
    employee: EmployeeRef
    days: list[ForecastDay]
    worked_hours: float
    scheduled_remaining_hours: float
    projected_hours: float
    threshold_hours: float


class SwapCandidate(Model):
    employee_id: str
    name: str
    eligible: bool
    projected_hours_after: float
    rest_before_hours: float | None
    rest_after_hours: float | None
    checks: dict[str, bool]
    reason: str | None


class ForecastRisk(Model):
    exception_id: str
    employee_id: str
    employee_name: str
    status: ExceptionStatus
    shift_id: str
    shift_start: str
    shift_end: str
    projected_hours: float
    projected_overtime_hours: float
    projected_cost: Money
    candidates: list[SwapCandidate]
    draft_id: str | None


class OvertimeForecast(Model):
    site: str
    week_start: date
    threshold_hours: float
    rows: list[ForecastRow]
    risks: list[ForecastRisk]


# ---- policies, traces, audit, outcomes -------------------------------------------------
class PolicyClause(Model):
    clause_id: str
    document_id: str
    document_title: str
    section: str
    title: str
    text: str
    jurisdictions: list[str]
    employee_classes: list[str]
    effective_from: date
    effective_to: date | None
    precedence: str
    rule_ids: list[str]


class PolicyPack(Model):
    version: str
    documents: list[dict[str, str]]
    clauses: list[PolicyClause]


class PolicySearchRequest(Input):
    query: str = Field(min_length=2, max_length=300)
    jurisdiction: Literal["US-CA", "US-TX", "IN-KA"] = "US-CA"
    employee_class: Literal["exempt", "non_exempt"] = "non_exempt"
    rule_id: str | None = None
    k: int = Field(default=5, ge=1, le=10)


class Span(Model):
    span_id: str
    parent_id: str | None
    name: str
    start: UTCDateTime
    end: UTCDateTime
    status: str
    attributes: dict[str, Any]


class Trace(Model):
    run: RunSummary
    spans: list[Span]
    system_prompt: str
    user_prompt: str
    prompt_hash: str | None
    raw_outputs: list[str]
    validations: list[ValidationReport]
    context: dict[str, Any]
    resolution: dict[str, Any] | None


class AuditEvent(Model):
    seq: int
    occurred_at: UTCDateTime
    actor_id: str
    actor_role: str
    event_type: str
    entity_type: str
    entity_id: str
    payload: dict[str, Any]
    prev_hash: str
    hash: str


class AuditVerification(Model):
    intact: bool
    events_checked: int
    first_broken_seq: int | None


class Outcomes(Model):
    source_label: str
    total: int
    resolved: int
    open: int
    resolved_before_cutoff_pct: float
    median_time_to_decision_s: float | None
    decisions: int
    cleared_by_cascade: int
    largest_cascade: int
    paid_hours_recovered: float
    paid_value_recovered: list[Money]
    overtime_cost_flagged: list[Money]
    overtime_cost_avoided: list[Money]
    premium_hours_recorded: float
    harness: dict[str, Any]


class ProviderStatus(Model):
    provider: str
    model_id: str
    available: bool
    detail: str | None


class ProviderSwitch(Input):
    provider: Literal["groq", "ollama", "rule_based"]


class ReplayRequest(Input):
    exception_id: str
    fault: Literal[
        "malformed_json",
        "hallucinated_clause",
        "unretrieved_clause",
        "fabricated_quote",
        "disallowed_action",
        "unanchored_time",
        "does_not_fix",
        "reduces_paid_hours",
        "wrong_numbers",
        "injection_echo",
        "timeout",
        "bad_then_good",
    ]


class DetectionSummary(Model):
    created: int
    unchanged: int
    superseded: int


class EmployeeAction(Model):
    exception_id: str
    title: str
    summary: str
    work_date: date
    status: ExceptionStatus
    suggested_time: str | None
    evidence: list[EvidenceItem]
    submitted: bool


class EmployeeHome(Model):
    employee: EmployeeRef
    actions: list[EmployeeAction]
    days: list[ForecastDay]
    week_hours: float


class AttestationRequest(Input):
    exception_id: str
    confirmed_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    note: str | None = Field(default=None, max_length=500)


class Attestation(Model):
    id: str
    exception_id: str
    confirmed_at: str
    note: str | None
    flags: list[str]
