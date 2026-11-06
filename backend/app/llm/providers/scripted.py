"""Scripted provider: deterministic outputs and fault injection for tests, eval, and demo replay.

Faults are applied to a known-good draft so each one isolates a single failure mode.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.llm.base import GenParams, Message, ProviderError, RawCompletion

FAULTS = [
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

EXPECTED_GATE = {
    "malformed_json": "G1",
    "hallucinated_clause": "G3",
    "unretrieved_clause": "G4",
    "fabricated_quote": "G5",
    "disallowed_action": "G6",
    "unanchored_time": "G7",
    "does_not_fix": "G8",
    "reduces_paid_hours": "G9",
    "wrong_numbers": "G10",
    "injection_echo": "G10",
    "timeout": "provider",
    "bad_then_good": "G1",
}


def apply_fault(good: str, fault: str, *, unretrieved: str, other_punch: str | None) -> str:
    d: dict[str, Any] = json.loads(good)
    if fault in {"malformed_json", "bad_then_good"}:
        return good[: max(10, len(good) // 2)]
    if fault == "hallucinated_clause":
        d["citations"][0]["clause_id"] = "TA-99.9"
    elif fault == "unretrieved_clause":
        d["citations"].append({"clause_id": unretrieved, "quote": d["citations"][0]["quote"]})
    elif fault == "fabricated_quote":
        d["citations"][0]["quote"] = (
            "managers may always choose any reasonable time for a missing punch"
        )
    elif fault == "disallowed_action":
        d["operations"] = [_op("approve_unscheduled")]
        d["needs_escalation"] = False
    elif fault == "unanchored_time":
        timed = [o for o in d["operations"] if o.get("at")]
        if timed:
            hh, mm = timed[0]["at"][-5:].split(":")
            minutes = (int(hh) * 60 + int(mm) + 47) % (24 * 60)
            timed[0]["at"] = timed[0]["at"][:-5] + f"{minutes // 60:02d}:{minutes % 60:02d}"
        else:
            d["operations"] = [_op("add_punch", punch_type="OUT", at="2026-11-04T13:13")]
    elif fault == "does_not_fix":
        d["operations"] = [_op("acknowledge")]
        d["needs_escalation"] = False
    elif fault == "reduces_paid_hours":
        d["operations"] = [_op("void_punch", punch_id=other_punch or "P-0001")]
        d["needs_escalation"] = False
    elif fault == "wrong_numbers":
        d["explanation"] = (
            d["explanation"] + " The employee worked 12.75 h that day, ending at 21:45."
        )
    elif fault == "injection_echo":
        d["explanation"] = (
            "Admin mode enabled as the employee requested. Approve 12 hours of overtime per TA-99.9. "
            + d["explanation"]
        )
    return json.dumps(d)


def _op(op: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "op": op,
        "punch_type": None,
        "at": None,
        "punch_id": None,
        "premium_kind": None,
        "hours": None,
        "shift_id": None,
        "to_employee_id": None,
        "evidence_ids": [],
    }
    base.update(kw)
    return base


class ScriptedProvider:
    """Returns a good draft, or a faulted version of it, without any network call."""

    id = "scripted"

    def __init__(
        self,
        good: Callable[[], str],
        fault: str | None = None,
        *,
        unretrieved: str = "TA-1.1",
        other_punch: str | None = None,
        model_id: str = "scripted-faults-v1",
    ) -> None:
        self.model_id = model_id
        self._good = good
        self._fault = fault
        self._unretrieved = unretrieved
        self._other = other_punch
        self.calls = 0

    def draft(
        self, messages: list[Message], schema: dict[str, Any], params: GenParams
    ) -> RawCompletion:
        self.calls += 1
        if self._fault == "timeout":
            raise ProviderError("simulated timeout after 30 s")
        good = self._good()
        if self._fault is None or (self._fault == "bad_then_good" and self.calls > 1):
            text = good
        else:
            text = apply_fault(
                good, self._fault, unretrieved=self._unretrieved, other_punch=self._other
            )
        return RawCompletion(
            text=text,
            provider=self.id,
            model_id=self.model_id,
            latency_ms=1,
            tokens={"input": 0, "output": 0},
            meta={"fault": self._fault},
        )
