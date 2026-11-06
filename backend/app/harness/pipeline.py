"""The governed drafting pipeline (HARNESS.md section 6).

context -> retrieve -> sanitise -> generate -> validate -> [repair once] -> route -> persist + audit
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.audit import chain
from app.config import get_settings
from app.contracts.draft import DraftResolution, strict_json_schema
from app.domain import models as m
from app.engine.confidence import evidence_strength
from app.engine.simulate import simulate
from app.harness.context import PROMPT_VERSION, CaseContext, build_context, prompt_hash
from app.harness.fallback import render_candidate
from app.harness.gates import ValidationReport, run_gates, to_engine_ops
from app.llm.base import GenParams, LLMProvider, ProviderError, RawCompletion
from app.llm.providers.scripted import ScriptedProvider
from app.llm.registry import build_provider, current_provider_name
from app.observability.logging import get_logger
from app.observability.spans import Tracer
from app.retrieval.hybrid import dense_backend

log = get_logger(__name__)
MAX_ATTEMPTS = 2


@dataclass
class Actor:
    id: str
    role: str


@dataclass
class Attempt:
    raw: str
    completion: RawCompletion | None
    draft: DraftResolution | None
    report: ValidationReport
    error: str | None = None


def _provider_error_report(attempt: int, message: str) -> ValidationReport:
    from app.harness.gates import GATE_NAMES, GateResult

    gates = [GateResult("G1", GATE_NAMES["G1"], "fail", f"provider error: {message}")]
    gates += [
        GateResult(g, GATE_NAMES[g], "skip", "skipped: no model output")
        for g in GATE_NAMES
        if g != "G1"
    ]
    return ValidationReport(passed=False, attempt=attempt, gates=gates)


def _call(
    provider: LLMProvider,
    ctx: CaseContext,
    attempt: int,
    tracer: Tracer,
    repair: list[str] | None,
    previous: str | None,
) -> Attempt:
    settings = get_settings()
    messages = ctx.messages(PROMPT_VERSION, repair=repair, previous=previous)
    with tracer.span(
        "generate",
        attempt=attempt,
        provider=provider.id,
        model_id=provider.model_id,
        prompt_version=PROMPT_VERSION,
        repair=bool(repair),
    ) as sp:
        try:
            comp = provider.draft(
                messages,
                strict_json_schema(),
                GenParams(0.0, settings.llm_max_output_tokens, settings.llm_timeout_s),
            )
        except ProviderError as exc:
            sp.status = "error"
            sp.set(error=str(exc))
            report = _provider_error_report(attempt, str(exc))
            return Attempt("", None, None, report, str(exc))
        sp.set(
            latency_ms=comp.latency_ms, tokens=comp.tokens, finish=comp.meta.get("finish_reason")
        )
    with tracer.span("validate", attempt=attempt) as sp:
        draft, report = run_gates(ctx, comp.text, attempt)
        sp.set(passed=report.passed, failed=[g.id for g in report.failures()])
    return Attempt(comp.text, comp, draft, report)


def run_draft(
    session: Session,
    exception_id: str,
    actor: Actor,
    *,
    fault: str | None = None,
    provider_name: str | None = None,
) -> m.PipelineRun:
    """Draft a resolution for one exception, validate it, route it, and persist the run."""
    t0 = time.perf_counter()
    tracer = Tracer()
    with tracer.span("context", exception_id=exception_id) as sp:
        ctx = build_context(session, exception_id)
        sp.set(
            rule_id=ctx.finding.rule_id,
            allowed_ops=ctx.envelope.allowed_ops,
            evidence_items=len(ctx.envelope.evidence),
            slots=ctx.envelope.windows_public(ctx.week),
            candidate_ops=[o.op for o in ctx.candidate.ops],
        )
    with tracer.span("retrieve") as sp:
        sp.set(
            clauses=[
                {
                    "clause_id": r.clause_id,
                    "bm25_rank": r.bm25_rank,
                    "dense_rank": r.dense_rank,
                    "fused": r.fused_score,
                    "required": r.required,
                }
                for r in ctx.retrieved
            ],
            dense_backend=dense_backend(),
        )
    with tracer.span("sanitise") as sp:
        sp.set(has_note=bool(ctx.note.text), flags=ctx.note.flags, truncated=ctx.note.truncated)

    name = provider_name or current_provider_name()
    provider: LLMProvider | None
    if fault:
        provider = ScriptedProvider(
            lambda: render_candidate(ctx),
            fault,
            unretrieved=_unretrieved(ctx),
            other_punch=_other_punch(ctx),
        )
    else:
        provider = build_provider(name)

    attempts: list[Attempt] = []
    route = "manual"
    fallback_reason: str | None = None
    final_raw: str
    final: DraftResolution | None = None
    final_report: ValidationReport

    if provider is None:
        # Degraded mode: deterministic template, still verified by every gate.
        final_raw = render_candidate(ctx)
        with tracer.span("validate", attempt=1, mode="rule_based") as sp:
            final, final_report = run_gates(ctx, final_raw, 1)
            sp.set(passed=final_report.passed, failed=[g.id for g in final_report.failures()])
        attempts.append(Attempt(final_raw, None, final, final_report))
        route = "escalate" if ctx.candidate.escalate else "manual"
        if not final_report.passed and route == "manual":
            # Even the deterministic template failed a gate: never show it as ready.
            route = "escalate"
            failed_ids = ", ".join(g.id for g in final_report.failures())
            fallback_reason = (
                f"The rule-based suggestion failed gate(s) {failed_ids}, so it is escalated to payroll "
                "instead of being shown as ready."
            )
        model_id, provider_id = "deterministic-templates-v1", "rule_based"
    else:
        provider_id, model_id = provider.id, provider.model_id
        first = _call(provider, ctx, 1, tracer, None, None)
        attempts.append(first)
        if not first.report.passed:
            msgs = (
                first.report.failure_messages()
                if first.draft or first.raw
                else [first.error or "no output"]
            )
            with tracer.span("repair", reasons=msgs):
                pass
            attempts.append(_call(provider, ctx, 2, tracer, msgs, first.raw or None))
        last = attempts[-1]
        if last.report.passed and last.draft is not None:
            final_raw, final, final_report = last.raw, last.draft, last.report
            route = "escalate" if last.draft.needs_escalation else "suggest"
        else:
            failed = sorted({g.id for a in attempts for g in a.report.failures()})
            fallback_reason = (
                f"Model draft rejected by the harness after {len(attempts)} attempt(s) "
                f"(failed: {', '.join(failed) or 'provider'}). Showing the rule-based suggestion."
            )
            final_raw = render_candidate(ctx)
            with tracer.span("validate", attempt=len(attempts) + 1, mode="fallback") as sp:
                final, final_report = run_gates(ctx, final_raw, len(attempts) + 1)
                sp.set(passed=final_report.passed, failed=[g.id for g in final_report.failures()])
            if ctx.candidate.escalate or not final_report.passed:
                route = "escalate"
                fallback_reason = (
                    fallback_reason + " The rule-based path cannot resolve it safely either, so "
                    "it is escalated to payroll."
                )
            else:
                route = "fallback"

    escalation_reason = None
    if route == "escalate" and fallback_reason and not ctx.candidate.escalate and provider is None:
        escalation_reason = fallback_reason
    elif route == "escalate":
        escalation_reason = (
            final.escalation_reason
            if final and final.escalation_reason
            else ctx.candidate.escalation_reason or "Escalated by the harness"
        )

    with tracer.span("route", route=route) as sp:
        ops = to_engine_ops(final.operations) if final else []
        strength = evidence_strength(ctx.week, ctx.envelope, ops)
        sim = simulate(ctx.week, ops, ctx.finding) if ops and route != "escalate" else None
        sp.set(evidence_strength=strength.score, fallback_reason=fallback_reason)

    pay_before = sim.pay_before if sim else _pay_now(ctx)
    pay_after = sim.pay_after if sim and sim.status == "ok" else pay_before
    run = m.PipelineRun(
        id="RUN-" + secrets.token_hex(4).upper(),
        exception_id=exception_id,
        provider=provider_id,
        model_id=model_id,
        prompt_version=PROMPT_VERSION if provider_id != "rule_based" else "template.v1",
        prompt_hash=prompt_hash(ctx.messages()),
        fault=fault,
        attempts=len(attempts),
        route=route,
        repaired=len(attempts) > 1 and route == "suggest",
        context=ctx.model_context(),
        retrieved=[r.as_dict() for r in ctx.retrieved],
        prompts={
            "system_version": PROMPT_VERSION,
            "user": ctx.messages()[1].content,
            "note_flags": ctx.note.flags,
        },
        raw_outputs=[a.raw for a in attempts] + ([final_raw] if route in {"fallback"} else []),
        resolution=final.model_dump() if final else None,
        validations=[a.report.as_dict() for a in attempts]
        + (
            [final_report.as_dict()]
            if route == "fallback" or (route == "escalate" and fallback_reason)
            else []
        ),
        evidence_strength=strength.as_dict(),
        pay_before=pay_before.as_dict(),
        pay_after=pay_after.as_dict(),
        clears=[
            _exc_id(session, ctx, f) for f in (sim.cleared if sim and sim.status == "ok" else [])
        ],
        introduces=[f.rule_id for f in (sim.introduced if sim and sim.status == "ok" else [])],
        fallback_reason=fallback_reason,
        escalation_reason=escalation_reason,
        latency_ms=int((time.perf_counter() - t0) * 1000),
        tokens=_tokens(attempts),
        trace_id=tracer.trace_id,
        created_at=datetime.now(UTC).replace(tzinfo=None),
        created_by=actor.id,
    )
    run.clears = [c for c in run.clears if c]
    if fault is None:  # fault replays are side-by-side inspections and never replace the real draft
        for old in session.query(m.PipelineRun).filter(
            m.PipelineRun.exception_id == exception_id, m.PipelineRun.superseded.is_(False)
        ):
            old.superseded = True
    session.add(run)
    if fault is None and route == "escalate":
        ctx.record.status = "escalated"
    elif fault is None and ctx.record.status in {"open", "escalated"}:
        ctx.record.status = "suggested"
    tracer.persist(session)
    chain.append(
        session,
        actor_id=actor.id,
        actor_role=actor.role,
        event_type="draft.created",
        entity_type="exception",
        entity_id=exception_id,
        payload={
            "run_id": run.id,
            "route": route,
            "provider": provider_id,
            "model_id": model_id,
            "prompt_version": run.prompt_version,
            "prompt_hash": run.prompt_hash,
            "fault": fault,
            "attempts": len(attempts),
            "failed_gates": [g.id for a in attempts for g in a.report.failures()],
            "retrieved": ctx.retrieved_ids,
            "evidence_strength": strength.score,
            "operations": run.resolution["operations"] if run.resolution else [],
        },
    )
    session.flush()
    log.info(
        "draft_complete",
        exception_id=exception_id,
        route=route,
        provider=provider_id,
        attempts=len(attempts),
        latency_ms=run.latency_ms,
    )
    return run


def _pay_now(ctx: CaseContext) -> Any:
    from app.engine.pay import pay_snapshot

    return pay_snapshot(ctx.week, ctx.det.shifts, ctx.det.params)


def _exc_id(session: Session, ctx: CaseContext, f: Any) -> str | None:
    from app.engine.detect import fingerprint

    fp = fingerprint(ctx.week.employee.id, f)
    rec = (
        session.query(m.ExceptionRecord)
        .filter(
            m.ExceptionRecord.fingerprint == fp,
            m.ExceptionRecord.employee_id == ctx.week.employee.id,
        )
        .first()
    )
    return rec.id if rec else None


def _tokens(attempts: list[Attempt]) -> dict[str, int]:
    out = {"input": 0, "output": 0}
    for a in attempts:
        if a.completion:
            out["input"] += a.completion.tokens.get("input", 0)
            out["output"] += a.completion.tokens.get("output", 0)
    return out


def _unretrieved(ctx: CaseContext) -> str:
    from app.retrieval.corpus import load_clauses

    retrieved = set(ctx.retrieved_ids)
    return next(c.clause_id for c in load_clauses() if c.clause_id not in retrieved)


def _other_punch(ctx: CaseContext) -> str | None:
    return next(
        (
            p.id
            for p in ctx.week.punches
            if p.type == "IN" and p.id not in ctx.envelope.target_punch_ids
        ),
        None,
    )
