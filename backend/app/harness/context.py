"""Assemble the verified case context for one exception and render the prompt."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import Conflict, NotFound
from app.config import BACKEND_DIR
from app.contracts.draft import strict_json_schema
from app.domain import models as m
from app.engine.candidates import Candidate, build_candidate
from app.engine.constraints import Envelope, build_envelope
from app.engine.detect import Detection, detect, fingerprint
from app.engine.forecast import SwapCheck, swap_candidates
from app.engine.types import EmployeeWeek, Finding
from app.harness.sanitize import SanitizedText, sanitize
from app.llm.base import Message
from app.retrieval.hybrid import Retrieved, retrieve
from app.services.weeks import load_week, site_weeks

PROMPT_VERSION = "draft.v1"
PROMPT_DIR = Path(BACKEND_DIR) / "app" / "llm" / "prompts"


@lru_cache
def system_prompt(version: str = PROMPT_VERSION) -> str:
    return (PROMPT_DIR / f"{version}.md").read_text(encoding="utf-8").strip()


@dataclass
class CaseContext:
    record: m.ExceptionRecord
    week: EmployeeWeek
    det: Detection
    finding: Finding
    envelope: Envelope
    candidate: Candidate
    retrieved: list[Retrieved]
    note: SanitizedText
    peers: list[EmployeeWeek] = field(default_factory=list)
    swaps: list[SwapCheck] = field(default_factory=list)

    @property
    def retrieved_ids(self) -> list[str]:
        return [r.clause_id for r in self.retrieved]

    def model_context(self) -> dict[str, Any]:
        """The JSON the model sees: codes, not names; facts computed by code."""
        f = self.finding
        facts: dict[str, Any] = dict(self.envelope.facts)
        facts.pop("pay_before", None)
        if (
            f.rule_id in {"R-MEAL-MISSED", "R-MEAL-LATE", "R-MEAL-SHORT"}
            and "record_premium" in self.envelope.allowed_ops
        ):
            facts["meal_premium_hours"] = 1.0
        for op in self.candidate.ops:
            if op.op in {"approve_overtime", "record_premium"} and op.hours is not None:
                facts["computed_hours_for_" + op.op] = op.hours
        ctx: dict[str, Any] = {
            "exception": {
                "id": self.record.id,
                "rule_id": f.rule_id,
                "title": self.record.title,
                "work_date": f.work_date.isoformat(),
                "summary": f.summary,
            },
            "employee": {
                "code": self.week.employee.id,
                "jurisdiction": self.week.employee.site.jurisdiction,
                "exempt": self.week.employee.exempt,
                "role": self.week.employee.role,
            },
            "allowed_ops": self.envelope.allowed_ops,
            "slots": self.envelope.windows_public(self.week),
            "evidence": [e.public() for e in self.envelope.evidence],
            "target_punch_ids": self.envelope.target_punch_ids,
            "facts": facts,
            "policy_clauses": [
                {
                    "clause_id": r.clause_id,
                    "title": r.title,
                    "text": r.text,
                    "required": r.required,
                    "precedence": r.precedence,
                }
                for r in self.retrieved
            ],
        }
        if self.envelope.target_shift_id:
            ctx["target_shift_id"] = self.envelope.target_shift_id
            ctx["swap_candidates"] = [
                {
                    "employee_code": c.employee_id,
                    "eligible": c.eligible,
                    "projected_hours_after": c.projected_after,
                    "reason_if_ineligible": c.reason,
                }
                for c in self.swaps
            ]
        return ctx

    def messages(
        self,
        version: str = PROMPT_VERSION,
        repair: list[str] | None = None,
        previous: str | None = None,
    ) -> list[Message]:
        note = self.note.text or "none"
        user = (
            "CONTEXT:\n"
            + json.dumps(self.model_context(), indent=1, default=str)
            + f"\n\n<untrusted_employee_text>\n{note}\n</untrusted_employee_text>\n\n"
            + "Return the JSON object now."
        )
        msgs = [Message("system", system_prompt(version)), Message("user", user)]
        if repair:
            msgs.append(Message("assistant", previous or ""))
            msgs.append(
                Message(
                    "user",
                    "The harness rejected that draft:\n- "
                    + "\n- ".join(repair)
                    + "\nReturn a corrected JSON object that fixes every problem.",
                )
            )
        return msgs


def prompt_hash(messages: list[Message]) -> str:
    blob = json.dumps(
        [[x.role, x.content] for x in messages] + [strict_json_schema()], sort_keys=True
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def _note_for(session: Session, record: m.ExceptionRecord) -> str | None:
    notes = session.scalars(
        select(m.EmployeeNote).where(
            m.EmployeeNote.employee_id == record.employee_id,
            m.EmployeeNote.work_date == record.work_date,
        )
    ).all()
    atts = session.scalars(
        select(m.Attestation).where(m.Attestation.exception_id == record.id)
    ).all()
    parts = [n.text for n in notes] + [a.note for a in atts if a.note]
    return "\n".join(parts) if parts else None


def build_context(session: Session, exception_id: str) -> CaseContext:
    record = session.get(m.ExceptionRecord, exception_id)
    if record is None:
        raise NotFound(f"Exception {exception_id} not found")
    week = load_week(session, record.employee_id)
    det = detect(week)
    finding = next(
        (f for f in det.findings if fingerprint(week.employee.id, f) == record.fingerprint), None
    )
    if finding is None:
        raise Conflict(f"Exception {exception_id} no longer applies; re-run detection")
    envelope = build_envelope(det, finding)
    peers: list[EmployeeWeek] = []
    swaps: list[SwapCheck] = []
    if finding.rule_id == "F-OT-RISK":
        peers = site_weeks(session, week.employee.site.code)
        swaps = swap_candidates(det, finding, peers)
    candidate = build_candidate(det, finding, envelope, peers)
    note = sanitize(_note_for(session, record))
    seeded = list(dict.fromkeys(envelope.required_clause_ids + candidate.clause_ids))
    query = f"{record.title}. {finding.summary}"
    if note.text and not note.suspicious:
        query += " " + note.text[:200]
    retrieved = retrieve(
        query,
        jurisdiction=week.employee.site.jurisdiction,
        employee_class=week.employee.employee_class,
        on_date=finding.work_date,
        required_ids=seeded,
        k=5,
        session=session,
    )
    return CaseContext(
        record, week, det, finding, envelope, candidate, retrieved, note, peers, swaps
    )
