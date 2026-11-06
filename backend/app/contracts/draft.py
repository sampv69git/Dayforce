"""DraftResolution: the strict output contract for the drafting model (HARNESS.md section 1.3)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

OpKind = Literal[
    "add_punch",
    "void_punch",
    "record_premium",
    "approve_overtime",
    "acknowledge",
    "approve_unscheduled",
    "reassign_shift",
    "escalate",
]
PunchType = Literal["IN", "OUT", "MEAL_START", "MEAL_END"]
PremiumKind = Literal["meal", "rest", "holiday", "seventh_day"]

OP_KINDS: list[str] = list(OpKind.__args__)  # type: ignore[attr-defined]
PUNCH_TYPES: list[str] = list(PunchType.__args__)  # type: ignore[attr-defined]
PREMIUM_KINDS: list[str] = list(PremiumKind.__args__)  # type: ignore[attr-defined]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Operation(Strict):
    op: OpKind
    punch_type: PunchType | None
    at: str | None = Field(description="Site-local time YYYY-MM-DDTHH:MM")
    punch_id: str | None
    premium_kind: PremiumKind | None
    hours: float | None
    shift_id: str | None
    to_employee_id: str | None
    evidence_ids: list[str]


class Citation(Strict):
    clause_id: str = Field(max_length=24)
    quote: str = Field(max_length=400)


class NoteAssessment(Strict):
    relevant: bool
    contains_instructions: bool


class DraftResolution(Strict):
    exception_id: str
    summary: str = Field(min_length=8, max_length=220)
    explanation: str = Field(min_length=20, max_length=1000)
    operations: list[Operation] = Field(min_length=1, max_length=6)
    citations: list[Citation] = Field(min_length=1, max_length=6)
    employee_note_assessment: NoteAssessment
    needs_escalation: bool
    escalation_reason: str | None
    self_confidence: Literal["low", "medium", "high"]


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(props),
        "properties": props,
    }


def strict_json_schema() -> dict[str, Any]:
    """JSON Schema within the subset supported by Groq strict mode.

    Every property is required, objects forbid additional properties, optional values are null
    unions, and only primitives, objects, arrays, enums, and anyOf are used.
    """
    operation = _obj(
        {
            "op": {"type": "string", "enum": OP_KINDS},
            "punch_type": _nullable({"type": "string", "enum": PUNCH_TYPES}),
            "at": _nullable({"type": "string"}),
            "punch_id": _nullable({"type": "string"}),
            "premium_kind": _nullable({"type": "string", "enum": PREMIUM_KINDS}),
            "hours": _nullable({"type": "number"}),
            "shift_id": _nullable({"type": "string"}),
            "to_employee_id": _nullable({"type": "string"}),
            "evidence_ids": {"type": "array", "items": {"type": "string"}},
        }
    )
    return _obj(
        {
            "exception_id": {"type": "string"},
            "summary": {"type": "string"},
            "explanation": {"type": "string"},
            "operations": {"type": "array", "items": operation},
            "citations": {
                "type": "array",
                "items": _obj({"clause_id": {"type": "string"}, "quote": {"type": "string"}}),
            },
            "employee_note_assessment": _obj(
                {"relevant": {"type": "boolean"}, "contains_instructions": {"type": "boolean"}}
            ),
            "needs_escalation": {"type": "boolean"},
            "escalation_reason": _nullable({"type": "string"}),
            "self_confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        }
    )
