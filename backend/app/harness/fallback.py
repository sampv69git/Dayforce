"""Render the deterministic candidate as a DraftResolution (degraded mode and visible fallback)."""

from __future__ import annotations

import json
import re

from app.harness.context import CaseContext
from app.retrieval.corpus import clause_index


def first_sentence(text: str, min_words: int = 6) -> str:
    """A verbatim quote from a clause: the first sentence with at least `min_words` words."""
    for sentence in re.split(r"(?<=[.;])\s+", text):
        s = sentence.strip().rstrip(".;")
        if len(s.split()) >= min_words:
            return s
    return text.strip().rstrip(".")


def render_candidate(ctx: CaseContext) -> str:
    cand = ctx.candidate
    index = clause_index()
    retrieved = set(ctx.retrieved_ids)
    wanted = [
        c
        for c in dict.fromkeys(cand.clause_ids + [r.clause_id for r in ctx.retrieved if r.required])
        if c in retrieved
    ]
    citations = [
        {"clause_id": c, "quote": first_sentence(index[c].text)} for c in wanted if c in index
    ]
    ops = [
        {
            "op": o.op,
            "punch_type": o.punch_type,
            "at": o.at,
            "punch_id": o.punch_id,
            "premium_kind": o.premium_kind,
            "hours": o.hours,
            "shift_id": o.shift_id,
            "to_employee_id": o.to_employee_id,
            "evidence_ids": list(o.evidence_ids),
        }
        for o in cand.ops
    ]
    payload = {
        "exception_id": ctx.record.id,
        "summary": cand.summary[:200],
        "explanation": cand.explanation[:980],
        "operations": ops,
        "citations": citations,
        "employee_note_assessment": {
            "relevant": bool(ctx.note.text) and not ctx.note.suspicious,
            "contains_instructions": ctx.note.suspicious,
        },
        "needs_escalation": cand.escalate,
        "escalation_reason": cand.escalation_reason,
        "self_confidence": "high" if not cand.escalate else "low",
    }
    return json.dumps(payload)
