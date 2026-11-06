"""Exception queue, detail, drafting, decisions, and bulk approval."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, ManagerOrAdmin, SessionDep, exception_in_scope
from app.api.errors import Forbidden, NotFound
from app.contracts import api
from app.domain import models as m
from app.harness.pipeline import Actor, run_draft
from app.services import decisions, views

router = APIRouter(tags=["exceptions"])


def _sites(user: CurrentUser, site: str | None) -> list[str]:
    if site:
        if not user.can_see_site(site):
            raise Forbidden(f"Site {site} is outside your scope")
        return [site]
    return ["FRE", "AUS", "BLR"] if user.role == "payroll_admin" else list(user.sites)


@router.get("/pay-period/current", response_model=api.PayPeriod)
def pay_period(
    user: ManagerOrAdmin, session: SessionDep, site: Literal["FRE", "AUS", "BLR"] | None = None
) -> api.PayPeriod:
    """Current pay period with the simulated clock, payroll cutoff, and progress."""
    return views.pay_period(session, _sites(user, site))


@router.get("/exceptions", response_model=api.ExceptionQueue)
def list_exceptions(
    user: ManagerOrAdmin,
    session: SessionDep,
    site: Literal["FRE", "AUS", "BLR"] | None = None,
    status: Literal["open", "suggested", "awaiting_employee", "escalated", "resolved"]
    | None = None,
) -> api.ExceptionQueue:
    """Exception queue ranked by risk, with root causes and their symptoms."""
    return views.queue(session, _sites(user, site), status)


@router.get("/exceptions/{exception_id}", response_model=api.ExceptionDetail)
def get_exception(
    exception_id: str, user: ManagerOrAdmin, session: SessionDep
) -> api.ExceptionDetail:
    rec = exception_in_scope(session, user, exception_id)
    return views.detail(session, rec)


@router.post("/exceptions/{exception_id}/drafts", response_model=api.Draft, status_code=201)
def create_draft(
    exception_id: str,
    user: ManagerOrAdmin,
    session: SessionDep,
    req: api.DraftRequest | None = None,
) -> api.Draft:
    """Run the governed pipeline. Returns the cached draft unless `force` is set."""
    rec = exception_in_scope(session, user, exception_id)
    existing = views.latest_run(session, rec.id)
    if existing and not (req and req.force) and rec.status in views.ACTIVE:
        return views.draft_view(session, existing)
    run = run_draft(session, rec.id, Actor(user.id, user.role))
    return views.draft_view(session, run)


@router.post("/exceptions/{exception_id}/attestation-requests", status_code=202)
def request_attestation(
    exception_id: str, user: ManagerOrAdmin, session: SessionDep
) -> dict[str, str]:
    """Ask the employee to confirm a time (simulated in-app notification)."""
    rec = exception_in_scope(session, user, exception_id)
    decisions.request_attestation(session, user, rec)
    return {"status": "requested"}


def _run_in_scope(session: Session, user: CurrentUser, draft_id: str) -> m.PipelineRun:
    run = session.get(m.PipelineRun, draft_id)
    if run is None:
        raise NotFound(f"Draft {draft_id} not found")
    exception_in_scope(session, user, run.exception_id)
    return run


@router.get("/drafts/{draft_id}", response_model=api.Draft)
def get_draft(draft_id: str, user: ManagerOrAdmin, session: SessionDep) -> api.Draft:
    return views.draft_view(session, _run_in_scope(session, user, draft_id))


@router.post("/drafts/{draft_id}/validate-edit", response_model=api.ValidationReport)
def validate_edit(
    draft_id: str, req: api.EditValidationRequest, user: ManagerOrAdmin, session: SessionDep
) -> api.ValidationReport:
    """Check edited operations against gates G2 and G6 to G9 without saving anything."""
    run = _run_in_scope(session, user, draft_id)
    report = decisions.validate_edit(session, run, req.operations)
    return api.ValidationReport(**report.as_dict())


@router.post("/drafts/{draft_id}/decision", response_model=api.DecisionResult)
def decide(
    draft_id: str, req: api.DecisionRequest, user: ManagerOrAdmin, session: SessionDep
) -> api.DecisionResult:
    """Approve, edit, or reject. Nothing changes a timecard without this call."""
    _run_in_scope(session, user, draft_id)
    return decisions.decide(session, user, draft_id, req)


@router.post("/drafts/bulk-approve", response_model=api.BulkApproveResult)
def bulk_approve(
    req: api.BulkApproveRequest,
    user: ManagerOrAdmin,
    session: SessionDep,
    dry_run: bool = Query(False),
) -> api.BulkApproveResult:
    """Approve several verified low-risk drafts; each is audited individually."""
    if dry_run:
        out = api.BulkApproveResult(approved=[], skipped=[])
        for did in req.draft_ids:
            run = session.get(m.PipelineRun, did)
            rec = session.get(m.ExceptionRecord, run.exception_id) if run else None
            ok, why = views.bulk_eligible(run, rec) if run and rec else (False, "not found")
            (
                out.approved.append(did)
                if ok
                else out.skipped.append(api.BulkSkip(draft_id=did, reason=why))
            )
        return out
    return decisions.bulk_approve(session, user, req.draft_ids)
