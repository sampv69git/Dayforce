"""The MCP server exposes read-only tools that reuse the engine, retrieval, and harness context."""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def mcp(seeded: str):  # type: ignore[no-untyped-def]
    from app.mcp_server import server

    return server


async def test_tools_are_read_only_and_have_no_decision_tool(mcp) -> None:  # type: ignore[no-untyped-def]
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert names == {
        "list_exceptions",
        "get_exception",
        "search_policy",
        "simulate_correction",
        "verify_audit_chain",
    }
    assert all(t.annotations and t.annotations.read_only_hint for t in tools)


def test_tool_functions_reuse_the_engine(mcp) -> None:  # type: ignore[no-untyped-def]
    from app.mcp_server import (
        get_exception,
        list_exceptions,
        search_policy,
        simulate_correction,
        verify_audit_chain,
    )

    span = next(e for e in list_exceptions("FRE") if e["rule_id"] == "R-PUNCH-SPAN")
    ctx = get_exception(span["id"])
    assert ctx["allowed_ops"] == ["add_punch", "escalate"]
    ops = [
        dict(
            o,
            punch_id=None,
            premium_kind=None,
            hours=None,
            shift_id=None,
            to_employee_id=None,
            evidence_ids=list(o["evidence_ids"]),
        )
        for o in ctx["deterministic_candidate"]["operations"]
    ]
    sim = simulate_correction(span["id"], ops)
    assert sim["target_cleared"] and len(sim["also_clears"]) == 2 and sim["introduces"] == []
    assert search_policy("missing punch evidence", "US-CA")[0]["clause_id"]
    assert verify_audit_chain()["intact"]
