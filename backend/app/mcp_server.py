"""Read-only MCP server exposing Countersign's rules engine and policy retrieval as tools.

Run over stdio:  `uv run python -m app.mcp_server`

Every tool is read-only. There is deliberately no tool that decides, approves, or writes: other
agents may investigate exceptions and simulate corrections, but only a person can countersign.
"""

from __future__ import annotations

from typing import Any, Literal

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from sqlalchemy import select

from app.audit import chain
from app.contracts.draft import Operation
from app.db import session_scope
from app.domain import models as m
from app.engine.simulate import simulate
from app.harness.context import build_context
from app.harness.gates import to_engine_ops
from app.retrieval.hybrid import retrieve

READ_ONLY = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
)

server = MCPServer(
    name="countersign",
    title="Countersign rules and policy tools",
    instructions=(
        "Read-only access to Countersign's timecard rules engine and fictional policy pack. "
        "All data is synthetic. Use simulate_correction to check a proposed correction before "
        "suggesting it; decisions are made by people in the Countersign app."
    ),
)


@server.tool(annotations=READ_ONLY)
def list_exceptions(
    site: Literal["FRE", "AUS", "BLR"] = "FRE", status: str | None = None
) -> list[dict[str, Any]]:
    """List detected timecard exceptions for a site (optionally filtered by status)."""
    with session_scope() as s:
        q = (
            select(m.ExceptionRecord, m.Employee)
            .join(m.Employee, m.Employee.id == m.ExceptionRecord.employee_id)
            .where(m.Employee.site_code == site)
            .order_by(m.ExceptionRecord.id)
        )
        rows = s.execute(q).all()
        return [
            {
                "id": e.id,
                "rule_id": e.rule_id,
                "title": e.title,
                "severity": e.severity,
                "employee_id": emp.id,
                "work_date": e.work_date.isoformat(),
                "status": e.status,
                "summary": e.summary,
                "root_id": e.root_id,
                "symptom_ids": e.symptom_ids,
            }
            for e, emp in rows
            if status is None or e.status == status
        ]


@server.tool(annotations=READ_ONLY)
def get_exception(exception_id: str) -> dict[str, Any]:
    """Return the verified case context for one exception: facts, evidence, allowed operations,
    plausible windows, and the governing policy clauses."""
    with session_scope() as s:
        ctx = build_context(s, exception_id)
        out = ctx.model_context()
        out["deterministic_candidate"] = {
            "operations": [o.__dict__ for o in ctx.candidate.ops],
            "escalate": ctx.candidate.escalate,
            "reason": ctx.candidate.escalation_reason,
        }
        return out


@server.tool(annotations=READ_ONLY)
def search_policy(
    query: str,
    jurisdiction: Literal["US-CA", "US-TX", "IN-KA"] = "US-CA",
    employee_class: Literal["exempt", "non_exempt"] = "non_exempt",
    k: int = 5,
) -> list[dict[str, Any]]:
    """Hybrid policy retrieval (metadata filters, BM25, embeddings, RRF): the same code the
    drafting pipeline uses. The policy pack is fictional and not legal advice."""
    with session_scope() as s:
        return [
            r.as_dict()
            for r in retrieve(
                query,
                jurisdiction=jurisdiction,
                employee_class=employee_class,
                k=max(1, min(k, 10)),
                session=s,
            )
        ]


@server.tool(annotations=READ_ONLY)
def simulate_correction(exception_id: str, operations: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply proposed operations in memory and report whether the exception clears, which related
    exceptions clear, what new exceptions appear, and pay before and after. Nothing is saved."""
    ops = [Operation.model_validate(o) for o in operations]
    with session_scope() as s:
        ctx = build_context(s, exception_id)
        sim = simulate(ctx.week, to_engine_ops(ops), ctx.finding)
        return {
            "status": sim.status,
            "error": sim.error,
            "target_cleared": sim.target_cleared,
            "also_clears": [f.rule_id for f in sim.cleared],
            "introduces": [f.rule_id for f in sim.introduced],
            "pay_before": sim.pay_before.as_dict(),
            "pay_after": sim.pay_after.as_dict(),
        }


@server.tool(annotations=READ_ONLY)
def verify_audit_chain() -> dict[str, Any]:
    """Recompute the SHA-256 audit hash chain and report whether it is intact."""
    with session_scope() as s:
        v = chain.verify(s)
        return {
            "intact": v.intact,
            "events_checked": v.events_checked,
            "first_broken_seq": v.first_broken_seq,
        }


def main() -> None:
    server.run("stdio")


if __name__ == "__main__":
    main()
