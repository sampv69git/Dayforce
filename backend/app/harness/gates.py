"""Validation gates G1 to G10 (HARNESS.md section 5).

Every gate runs whenever its inputs exist, so the report is complete even after an early failure.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from typing import Any, Literal

from pydantic import ValidationError

from app.contracts.draft import DraftResolution, Operation
from app.engine.catalog import RULES
from app.engine.forecast import evaluate_peer
from app.engine.simulate import InvalidOp, SimResult, parse_local, simulate
from app.engine.types import Op
from app.harness.context import CaseContext
from app.retrieval.corpus import clause_index

Status = Literal["pass", "fail", "skip"]
GATE_NAMES = {
    "G1": "Schema",
    "G2": "Case binding",
    "G3": "Citation exists",
    "G4": "Citation retrieved and required",
    "G5": "Quote grounding",
    "G6": "Action allowed",
    "G7": "Evidence anchoring",
    "G8": "Re-simulation",
    "G9": "Business guardrails",
    "G10": "Fact and injection check",
}
REDUCIBLE = {"R-PUNCH-SPAN", "R-PUNCH-DUPLICATE", "R-BREAK-UNPAIRED"}
SUSPICIOUS_ECHO = re.compile(
    r"\b(admin mode|developer mode|ignore (all )?(previous|prior) instructions|as instructed by the employee|"
    r"system prompt)\b",
    re.I,
)


@dataclass
class GateResult:
    id: str
    name: str
    status: Status
    detail: str


@dataclass
class ValidationReport:
    passed: bool
    attempt: int
    gates: list[GateResult] = field(default_factory=list)
    sim: SimResult | None = None
    notes: list[str] = field(default_factory=list)

    def failures(self) -> list[GateResult]:
        return [g for g in self.gates if g.status == "fail"]

    def failure_messages(self) -> list[str]:
        return [f"{g.id} {g.name} failed: {g.detail}" for g in self.failures()]

    def as_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "attempt": self.attempt,
            "gates": [asdict(g) for g in self.gates],
        }


def _g(gid: str, ok: bool | None, detail: str) -> GateResult:
    status: Status = "skip" if ok is None else "pass" if ok else "fail"
    return GateResult(gid, GATE_NAMES[gid], status, detail)


def to_engine_ops(ops: list[Operation]) -> list[Op]:
    return [
        Op(
            o.op,
            o.punch_type,
            o.at,
            o.punch_id,
            o.premium_kind,
            o.hours,
            o.shift_id,
            o.to_employee_id,
            tuple(o.evidence_ids),
        )
        for o in ops
    ]


def extract_json(raw: str) -> tuple[str, bool]:
    """Strip code fences and reasoning tags. Returns (text, extracted_from_wrapper)."""
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.S)
    if fenced:
        return fenced.group(1), True
    return text, text != raw.strip()


def parse_draft(raw: str) -> tuple[DraftResolution | None, str]:
    text, wrapped = extract_json(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, f"output is not valid JSON ({exc.msg} at position {exc.pos})"
    try:
        draft = DraftResolution.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first.get("loc", []))
        return None, f"{len(exc.errors())} schema error(s); first at '{loc}': {first.get('msg')}"
    return draft, "valid DraftResolution" + (" (unwrapped from code fence)" if wrapped else "")


def _norm(text: str) -> str:
    text = text.lower().replace("’", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \"'.,;:")


def _numbers_allowed(ctx: CaseContext, draft: DraftResolution) -> tuple[set[str], set[float]]:
    times: set[str] = set()
    hours: set[float] = set()

    def walk(v: Any) -> None:
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, str):
            times.update(re.findall(r"(?<!\d)\d{2}:\d{2}(?!\d)", v))
            for n in re.findall(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])", v):
                hours.add(float(n))
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            hours.add(float(v))

    walk(ctx.model_context())
    walk(ctx.envelope.facts)
    for op in draft.operations:
        if op.at:
            times.add(op.at[-5:])
        if op.hours is not None:
            hours.add(float(op.hours))
    for r in ctx.retrieved:
        walk(r.text)
    return times, hours


def run_gates(
    ctx: CaseContext, raw: str, attempt: int, mode: Literal["draft", "edit"] = "draft"
) -> tuple[DraftResolution | None, ValidationReport]:
    """Validate a draft. In "edit" mode (human edits), G8 accepts newly revealed overtime or meal
    exceptions, because worked time must be paid (TA-4.3); new punch or schedule problems still fail."""
    report = ValidationReport(passed=False, attempt=attempt)
    gates = report.gates
    draft, detail = parse_draft(raw)
    gates.append(_g("G1", draft is not None, detail))
    if draft is None:
        for gid in ("G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10"):
            gates.append(_g(gid, None, "skipped: no valid draft"))
        return None, report

    env = ctx.envelope
    week = ctx.week
    ops = draft.operations
    escalating = any(o.op == "escalate" for o in ops)

    # G2 case binding
    problems: list[str] = []
    if draft.exception_id != ctx.record.id:
        problems.append(f"exception_id {draft.exception_id} does not match {ctx.record.id}")
    slot_types = {s.punch_type for s in env.slots}
    for o in ops:
        if o.op == "add_punch" and o.punch_type not in slot_types:
            problems.append(
                f"add_punch {o.punch_type} does not match a missing punch for this case"
            )
        if o.op == "void_punch" and o.punch_id not in env.target_punch_ids:
            problems.append(f"void_punch targets {o.punch_id}, which is not part of this case")
        if o.op == "reassign_shift":
            if o.shift_id != env.target_shift_id:
                problems.append(
                    f"reassign_shift targets {o.shift_id}, expected {env.target_shift_id}"
                )
            if o.to_employee_id not in {p.employee.id for p in ctx.peers}:
                problems.append(f"{o.to_employee_id} is not a colleague at this site")
    gates.append(_g("G2", not problems, "; ".join(problems) or "draft is bound to this exception"))

    # G3 citation exists
    index = clause_index()
    missing = [c.clause_id for c in draft.citations if c.clause_id not in index]
    gates.append(
        _g(
            "G3",
            not missing,
            f"unknown clause(s): {', '.join(missing)}"
            if missing
            else f"{len(draft.citations)} citation(s) exist in policy v2026.2",
        )
    )

    # G4 citation retrieved and required
    retrieved = set(ctx.retrieved_ids)
    required = {r.clause_id for r in ctx.retrieved if r.required}
    cited = {c.clause_id for c in draft.citations}
    not_retrieved = sorted(cited - retrieved)
    uncited = (
        sorted(required - cited) if not escalating else sorted(set(env.required_clause_ids) - cited)
    )
    g4_detail = []
    if not_retrieved:
        g4_detail.append(f"cited but not retrieved: {', '.join(not_retrieved)}")
    if uncited:
        g4_detail.append(f"required but not cited: {', '.join(uncited)}")
    gates.append(
        _g(
            "G4",
            not g4_detail,
            "; ".join(g4_detail) or "all citations retrieved; required clauses cited",
        )
    )

    # G5 quote grounding
    bad_quotes = []
    for c in draft.citations:
        clause = index.get(c.clause_id)
        q = _norm(c.quote)
        if clause is None:
            continue
        if len(q.split()) < 6 or q not in _norm(clause.text):
            bad_quotes.append(c.clause_id)
    gates.append(
        _g(
            "G5",
            not bad_quotes,
            f"quote not found verbatim in {', '.join(bad_quotes)}"
            if bad_quotes
            else "every quote appears verbatim in its clause",
        )
    )

    # G6 action allowed and well formed
    problems = []
    for o in ops:
        if o.op not in env.allowed_ops:
            problems.append(f"{o.op} is not allowed for {ctx.finding.rule_id}")
        if o.op == "add_punch" and (not o.punch_type or not o.at):
            problems.append("add_punch needs punch_type and at")
        if o.op == "record_premium" and (o.premium_kind is None or o.hours is None):
            problems.append("record_premium needs premium_kind and hours")
        if o.op == "approve_overtime" and o.hours is None:
            problems.append("approve_overtime needs hours")
        if o.op == "reassign_shift" and (not o.shift_id or not o.to_employee_id):
            problems.append("reassign_shift needs shift_id and to_employee_id")
    if escalating and len(ops) > 1:
        problems.append("escalate must be the only operation")
    if draft.needs_escalation != escalating:
        problems.append("needs_escalation must be true exactly when the operation is escalate")
    gates.append(
        _g("G6", not problems, "; ".join(problems) or "operations are allowed and well formed")
    )

    # G7 evidence anchoring
    by_id = {e.id: e for e in env.evidence}
    timed = [o for o in ops if o.op == "add_punch" and o.at]
    if not timed:
        gates.append(_g("G7", None, "no timestamps proposed"))
    else:
        problems = []
        for o in timed:
            try:
                when = parse_local(week, o.at or "")
            except InvalidOp as exc:
                problems.append(str(exc))
                continue
            slot = next((s for s in env.slots if s.punch_type == o.punch_type), None)
            if slot and not (slot.earliest <= when <= slot.latest):
                problems.append(
                    f"{o.punch_type} {o.at[-5:] if o.at else ''} is outside the plausible window"
                )
            refs = [by_id[i] for i in o.evidence_ids if i in by_id]
            unknown = [i for i in o.evidence_ids if i not in by_id]
            if unknown:
                problems.append(f"unknown evidence id(s): {', '.join(unknown)}")
            if not refs:
                problems.append(f"{o.punch_type} at {o.at} cites no evidence")
                continue
            tol = {"attestation": 1}
            if not any(abs(r.at_utc - when) <= timedelta(minutes=tol.get(r.kind, 5)) for r in refs):
                problems.append(
                    f"{o.punch_type} at {(o.at or '')[-5:]} is not within 5 minutes of its cited evidence"
                )
            if all(r.strength == "weak" for r in refs):
                stronger = [
                    e for e in env.evidence if e.slot == o.punch_type and e.strength != "weak"
                ]
                if stronger:
                    problems.append(
                        f"{o.punch_type} relies on the schedule although stronger evidence exists"
                    )
        gates.append(
            _g("G7", not problems, "; ".join(problems) or "every timestamp is anchored to evidence")
        )

    # G8 re-simulation
    engine_ops = to_engine_ops(ops)
    if escalating:
        gates.append(_g("G8", None, "escalation proposes no change"))
    else:
        sim = simulate(week, engine_ops, ctx.finding)
        report.sim = sim
        problems = []
        if sim.status != "ok":
            problems.append(f"could not apply operations: {sim.error}")
        else:
            if not sim.target_cleared:
                problems.append("the target exception would remain")
            blocking = [
                f
                for f in sim.introduced
                if mode == "draft" or RULES[f.rule_id].family not in {"overtime", "meal_rest"}
            ]
            if blocking:
                problems.append(
                    "would introduce: " + ", ".join(sorted({f.rule_id for f in blocking}))
                )
            elif sim.introduced:
                revealed = ", ".join(sorted({f.rule_id for f in sim.introduced}))
                report.notes.append(f"reveals {revealed}; it will be queued for approval and paid")
            for o in ops:
                if o.op == "reassign_shift" and o.to_employee_id:
                    peer = next((p for p in ctx.peers if p.employee.id == o.to_employee_id), None)
                    shift = next((s for s in week.schedules if s.id == o.shift_id), None)
                    if peer is None or shift is None:
                        problems.append("swap target or shift not found")
                    else:
                        check = evaluate_peer(ctx.det, shift, peer)
                        if not check.eligible:
                            problems.append(
                                f"{peer.employee.id} cannot take the shift: {check.reason}"
                            )
        cleared = len(sim.cleared) if sim.status == "ok" else 0
        gates.append(
            _g(
                "G8",
                not problems,
                "; ".join(problems)
                or f"target cleared, {cleared} related exception(s) also cleared"
                + ("; " + "; ".join(report.notes) if report.notes else ", nothing new introduced"),
            )
        )

    # G9 business guardrails
    problems = []
    rule = ctx.finding.rule_id
    final_sim = report.sim
    if final_sim is not None and final_sim.status == "ok":
        drop = final_sim.pay_before.paid_hours - final_sim.pay_after.paid_hours
        # Paid time may only fall when the removed time was never worked: the gap inside a joined span,
        # a device duplicate, or an unpaid meal the employee attested to. All must be evidence-anchored.
        if drop > 0.01 and rule not in REDUCIBLE:
            problems.append(f"would reduce paid hours by {drop:.2f} h")
        elif drop > 0.01 and rule != "R-PUNCH-DUPLICATE" and gates[6].status != "pass":
            problems.append("reduces paid hours without evidence-anchored punches")
    for o in ops:
        if (
            o.op == "add_punch"
            and o.punch_type in {"MEAL_START", "MEAL_END"}
            and not any(i.startswith("att:") for i in o.evidence_ids)
        ):
            problems.append("break punch change without the employee's attestation (TA-5.4)")
        if o.op == "void_punch" and rule != "R-PUNCH-DUPLICATE":
            problems.append("voiding a recorded punch is only allowed for duplicates")
        elif o.op == "void_punch" and o.punch_id not in env.target_punch_ids:
            problems.append("only the identified duplicate punch may be voided")
        if o.op in {"record_premium", "approve_overtime"} and week.employee.exempt:
            problems.append("premiums and overtime do not apply to exempt employees (TA-1.3)")
        if (
            o.op == "record_premium"
            and o.premium_kind == "meal"
            and abs((o.hours or 0) - 1.0) > 0.01
        ):
            problems.append("meal premium must be exactly 1 hour (CA-4.4)")
        if o.op in {"record_premium", "approve_overtime"} and o.hours is not None:
            expected = next(
                (c.hours for c in ctx.candidate.ops if c.op == o.op and c.hours is not None), None
            )
            if expected is not None and abs(o.hours - expected) > 0.05:
                problems.append(f"{o.op} hours {o.hours} differ from the computed {expected}")
        if o.op == "add_punch" and o.at:
            try:
                if week.local_date(parse_local(week, o.at)) < week.week_start:
                    problems.append("cannot edit a closed pay period (TA-3.7)")
            except InvalidOp:
                pass
    gates.append(
        _g(
            "G9",
            not problems,
            "; ".join(problems) or "no paid-hour reduction, break, or period violations",
        )
    )

    # G10 fact and injection check
    problems = []
    times, hours = _numbers_allowed(ctx, draft)
    prose = f"{draft.summary} {draft.explanation}"
    for t in re.findall(r"(?<![\d:])\d{1,2}:\d{2}(?![\d:])", prose):
        if t.zfill(5) not in times:
            problems.append(f"time {t} does not appear in the case facts")
    for n in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:h\b|hours?\b)", prose):
        if not any(abs(float(n) - h) <= 0.05 for h in hours):
            problems.append(f"{n} hours does not match any computed value")
    if SUSPICIOUS_ECHO.search(prose):
        problems.append("draft echoes instruction-like text")
    if ctx.note.suspicious:
        for frag in re.findall(r"\b(?:TA|CA|BLR)-\d+(?:\.\d+)+\b", ctx.note.text):
            if frag not in index and frag in prose:
                problems.append(f"draft repeats {frag} from the untrusted note")
    note_detail = ""
    if ctx.note.suspicious and not draft.employee_note_assessment.contains_instructions:
        note_detail = " (note: scanner flagged the employee text; the model did not)"
    gates.append(
        _g(
            "G10",
            not problems,
            "; ".join(problems) or "numbers and times match the facts" + note_detail,
        )
    )

    report.passed = all(g.status != "fail" for g in gates)
    return draft, report
