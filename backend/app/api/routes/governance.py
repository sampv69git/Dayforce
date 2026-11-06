"""Policies and retrieval playground, traces, audit, outcomes, evaluation, and admin controls."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import AdminOnly, ManagerOrAdmin, SessionDep, exception_in_scope
from app.api.errors import NotFound
from app.audit import chain
from app.contracts import api
from app.domain import models as m
from app.engine.catalog import required_clauses
from app.harness.context import system_prompt
from app.harness.pipeline import Actor, run_draft
from app.llm.registry import provider_status, set_provider_name
from app.retrieval.corpus import load_clauses
from app.retrieval.hybrid import retrieve
from app.services import insights, views
from app.services.detection import detect_all

router = APIRouter()


@router.get("/policies", response_model=api.PolicyPack, tags=["policies"])
def policies(user: ManagerOrAdmin) -> api.PolicyPack:
    """The fictional policy pack v2026.2 (not legal advice)."""
    clauses = load_clauses()
    docs = list(
        {c.document_id: {"id": c.document_id, "title": c.document_title} for c in clauses}.values()
    )
    return api.PolicyPack(
        version="2026.2",
        documents=docs,
        clauses=[
            api.PolicyClause(
                clause_id=c.clause_id,
                document_id=c.document_id,
                document_title=c.document_title,
                section=c.section,
                title=c.title,
                text=c.text,
                jurisdictions=list(c.jurisdictions),
                employee_classes=list(c.employee_classes),
                effective_from=c.effective_from,
                effective_to=c.effective_to,
                precedence=c.precedence,
                rule_ids=list(c.rule_ids),
            )
            for c in clauses
        ],
    )


@router.post("/policies/search", response_model=list[api.RetrievedClause], tags=["policies"])
def search(
    req: api.PolicySearchRequest, user: ManagerOrAdmin, session: SessionDep
) -> list[api.RetrievedClause]:
    """Retrieval playground: the same hybrid retrieval the pipeline uses."""
    required = required_clauses(req.rule_id, req.jurisdiction) if req.rule_id else []
    res = retrieve(
        req.query,
        jurisdiction=req.jurisdiction,
        employee_class=req.employee_class,
        required_ids=required,
        k=req.k,
        session=session,
    )
    return [api.RetrievedClause(**r.as_dict()) for r in res]


@router.get("/traces", response_model=list[api.RunSummary], tags=["traces"])
def traces(
    user: ManagerOrAdmin,
    session: SessionDep,
    route: Literal["suggest", "fallback", "escalate", "manual"] | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> list[api.RunSummary]:
    """Recent pipeline runs, newest first."""
    q = select(m.PipelineRun).order_by(m.PipelineRun.created_at.desc()).limit(limit)
    if route:
        q = q.where(m.PipelineRun.route == route)
    out = []
    for run in session.scalars(q):
        rec = session.get(m.ExceptionRecord, run.exception_id)
        emp = session.get(m.Employee, rec.employee_id) if rec else None
        if emp and user.can_see_site(emp.site_code):
            out.append(views.run_summary(session, run))
    return out


@router.get("/traces/{run_id}", response_model=api.Trace, tags=["traces"])
def trace(run_id: str, user: ManagerOrAdmin, session: SessionDep) -> api.Trace:
    """Full harness trace for one run: spans, prompt, raw and validated outputs, gate results."""
    run = session.get(m.PipelineRun, run_id)
    if run is None:
        raise NotFound(f"Run {run_id} not found")
    exception_in_scope(session, user, run.exception_id)
    spans = session.scalars(
        select(m.TraceSpan).where(m.TraceSpan.trace_id == run.trace_id).order_by(m.TraceSpan.id)
    )
    return api.Trace(
        run=views.run_summary(session, run),
        spans=[
            api.Span(
                span_id=s.span_id,
                parent_id=s.parent_id,
                name=s.name,
                start=s.start,
                end=s.end,
                status=s.status,
                attributes=s.attributes,
            )
            for s in spans
        ],
        system_prompt=system_prompt(run.prompts.get("system_version", "draft.v1")),
        user_prompt=str(run.prompts.get("user", "")),
        prompt_hash=run.prompt_hash,
        raw_outputs=run.raw_outputs,
        validations=[api.ValidationReport(**v) for v in run.validations],
        context=run.context,
        resolution=run.resolution,
    )


@router.get("/audit", response_model=list[api.AuditEvent], tags=["audit"])
def audit(
    user: AdminOnly,
    session: SessionDep,
    entity_id: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
) -> list[api.AuditEvent]:
    q = select(m.AuditEvent).order_by(m.AuditEvent.seq.desc()).limit(limit)
    if entity_id:
        q = q.where(m.AuditEvent.entity_id == entity_id)
    return [api.AuditEvent.model_validate(e) for e in session.scalars(q)]


@router.get("/audit/verify", response_model=api.AuditVerification, tags=["audit"])
def verify(user: AdminOnly, session: SessionDep) -> api.AuditVerification:
    """Recompute the SHA-256 hash chain and report the first broken event, if any."""
    v = chain.verify(session)
    return api.AuditVerification(
        intact=v.intact, events_checked=v.events_checked, first_broken_seq=v.first_broken_seq
    )


@router.get("/outcomes", response_model=api.Outcomes, tags=["outcomes"])
def outcomes(
    user: ManagerOrAdmin, session: SessionDep, site: Literal["FRE", "AUS", "BLR"] | None = None
) -> api.Outcomes:
    sites = (
        [site]
        if site
        else (["FRE", "AUS", "BLR"] if user.role == "payroll_admin" else list(user.sites))
    )
    return insights.outcomes(session, sites)


@router.get("/evaluation/latest", tags=["outcomes"])
def evaluation(user: ManagerOrAdmin) -> dict[str, object]:
    """Latest committed evaluation report (results from real runs only)."""
    report = insights.latest_evaluation()
    if report is None:
        raise NotFound("No evaluation report yet. Run the evaluation suite.")
    return report


@router.post("/admin/detect", response_model=api.DetectionSummary, tags=["admin"])
def admin_detect(user: AdminOnly, session: SessionDep) -> api.DetectionSummary:
    s = detect_all(session, user.id, user.role)
    return api.DetectionSummary(created=s.created, unchanged=s.unchanged, superseded=s.superseded)


@router.post("/admin/reset", status_code=202, tags=["admin"])
def admin_reset(user: AdminOnly) -> dict[str, object]:
    """Delete and reseed all demo data (synthetic)."""
    from app.seed.load import seed

    return {"status": "reset", "counts": seed(reset=True)}


@router.get("/admin/provider", response_model=api.ProviderStatus, tags=["admin"])
def get_provider(user: ManagerOrAdmin) -> api.ProviderStatus:
    return api.ProviderStatus(**provider_status())


@router.put("/admin/provider", response_model=api.ProviderStatus, tags=["admin"])
def put_provider(
    req: api.ProviderSwitch, user: AdminOnly, session: SessionDep
) -> api.ProviderStatus:
    set_provider_name(req.provider)
    chain.append(
        session,
        actor_id=user.id,
        actor_role=user.role,
        event_type="provider.switched",
        entity_type="setting",
        entity_id="llm_provider",
        payload={"provider": req.provider},
    )
    return api.ProviderStatus(**provider_status(req.provider))


@router.post("/admin/replay", response_model=api.Draft, status_code=201, tags=["admin"])
def replay(req: api.ReplayRequest, user: AdminOnly, session: SessionDep) -> api.Draft:
    """Re-run the pipeline with an injected fault to show the harness catching it."""
    exception_in_scope(session, user, req.exception_id)
    run = run_draft(session, req.exception_id, Actor(user.id, user.role), fault=req.fault)
    return views.draft_view(session, run)
