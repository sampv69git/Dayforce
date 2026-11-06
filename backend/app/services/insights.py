"""Forecast view, employee home, and outcome metrics computed from stored data."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import UTC, date, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ROOT_DIR, get_settings
from app.contracts import api
from app.domain import models as m
from app.engine.candidates import build_candidate
from app.engine.constraints import build_envelope
from app.engine.detect import detect, fingerprint
from app.engine.forecast import swap_candidates
from app.engine.params import params_for
from app.engine.rules import projected_hours
from app.services.views import ACTIVE, employee_ref, latest_run
from app.services.weeks import load_week, site_weeks


def _days(week_start: date) -> list[date]:
    return [week_start + timedelta(days=i) for i in range(7)]


def forecast(session: Session, site_code: str) -> api.OvertimeForecast:
    weeks = site_weeks(session, site_code)
    site = session.get(m.Site, site_code)
    assert site is not None
    p = params_for(site.jurisdiction)
    rows: list[api.ForecastRow] = []
    risks: list[api.ForecastRisk] = []
    for w in weeks:
        if w.employee.exempt:
            continue
        det = detect(w)
        worked, remaining, projected, _ = projected_hours(w, det.shifts)
        per_day: dict[date, float] = defaultdict(float)
        for s in det.shifts:
            if s.complete and w.in_week(s.work_date):
                per_day[s.work_date] += s.worked_hours or 0.0
        sched_day: dict[date, float] = defaultdict(float)
        for sc in w.schedules:
            d = w.local_date(sc.start)
            if w.in_week(d) and sc.end > w.now:
                sched_day[d] += sc.planned_hours
        emp = session.get(m.Employee, w.employee.id)
        assert emp is not None
        rows.append(
            api.ForecastRow(
                employee=employee_ref(session, emp),
                days=[
                    api.ForecastDay(
                        date=d,
                        worked_hours=round(per_day.get(d, 0.0), 2),
                        scheduled_hours=round(sched_day.get(d, 0.0), 2),
                        future=d > w.local_date(w.now),
                    )
                    for d in _days(w.week_start)
                ],
                worked_hours=round(worked, 2),
                scheduled_remaining_hours=round(remaining, 2),
                projected_hours=round(projected, 2),
                threshold_hours=p.weekly_ot_hours,
            )
        )
        for f in det.findings:
            if f.rule_id != "F-OT-RISK" or str(f.discriminator).startswith("daily-"):
                continue
            rec = session.scalars(
                select(m.ExceptionRecord).where(
                    m.ExceptionRecord.fingerprint == fingerprint(w.employee.id, f)
                )
            ).first()
            if rec is None:
                continue
            cands = swap_candidates(det, f, weeks)
            over = float(f.evidence.get("projected_overtime_hours", 0.0))
            run = latest_run(session, rec.id)
            risks.append(
                api.ForecastRisk(
                    exception_id=rec.id,
                    employee_id=w.employee.id,
                    employee_name=w.employee.name,
                    status=rec.status,  # type: ignore[arg-type]
                    shift_id=str(f.evidence["shift_id"]),
                    shift_start=str(f.evidence["shift_start"]),
                    shift_end=str(f.evidence["shift_end"]),
                    projected_hours=float(f.evidence["projected_hours"]),
                    projected_overtime_hours=over,
                    projected_cost=api.Money(
                        amount=round(over * w.employee.rate * p.ot_multiplier, 2),
                        currency=site.currency,
                    ),  # type: ignore[arg-type]
                    candidates=[
                        api.SwapCandidate(
                            employee_id=c.employee_id,
                            name=c.name,
                            eligible=c.eligible,
                            projected_hours_after=c.projected_after,
                            rest_before_hours=c.rest_before_hours,
                            rest_after_hours=c.rest_after_hours,
                            checks=c.checks,
                            reason=c.reason,
                        )
                        for c in cands
                    ],
                    draft_id=run.id if run else None,
                )
            )
    rows.sort(key=lambda r: -r.projected_hours)
    return api.OvertimeForecast(
        site=site_code,
        week_start=date.fromisoformat(get_settings().week_start),
        threshold_hours=p.weekly_ot_hours,
        rows=rows,
        risks=risks,
    )


def employee_home(session: Session, employee_id: str) -> api.EmployeeHome:
    emp = session.get(m.Employee, employee_id)
    assert emp is not None
    w = load_week(session, employee_id)
    det = detect(w)
    actions: list[api.EmployeeAction] = []
    recs = session.scalars(
        select(m.ExceptionRecord).where(
            m.ExceptionRecord.employee_id == employee_id,
            m.ExceptionRecord.rule_id.in_(
                ["R-PUNCH-MISSING-OUT", "R-PUNCH-MISSING-IN", "R-BREAK-UNPAIRED"]
            ),
        )
    ).all()
    for rec in recs:
        submitted = session.scalars(
            select(m.Attestation).where(m.Attestation.exception_id == rec.id)
        ).first()
        if rec.status != "awaiting_employee" and not submitted:
            continue
        f = next((x for x in det.findings if fingerprint(employee_id, x) == rec.fingerprint), None)
        suggested = None
        evidence: list[api.EvidenceItem] = []
        if f is not None:
            env = build_envelope(det, f)
            cand = build_candidate(det, f, env)
            suggested = next((o.at for o in cand.ops if o.at), None)
            evidence = [
                api.EvidenceItem(**e.public()) for e in env.evidence if e.kind != "attestation"
            ]
        actions.append(
            api.EmployeeAction(
                exception_id=rec.id,
                title=rec.title,
                summary=rec.summary,
                work_date=rec.work_date,
                status=rec.status,  # type: ignore[arg-type]
                suggested_time=suggested,
                evidence=evidence,
                submitted=submitted is not None,
            )
        )
    per_day: dict[date, float] = defaultdict(float)
    for s in det.shifts:
        if s.complete and w.in_week(s.work_date):
            per_day[s.work_date] += s.worked_hours or 0.0
    sched: dict[date, float] = defaultdict(float)
    for sc in w.schedules:
        if w.in_week(w.local_date(sc.start)) and sc.end > w.now:
            sched[w.local_date(sc.start)] += sc.planned_hours
    days = [
        api.ForecastDay(
            date=d,
            worked_hours=round(per_day.get(d, 0.0), 2),
            scheduled_hours=round(sched.get(d, 0.0), 2),
            future=d > w.local_date(w.now),
        )
        for d in _days(w.week_start)
    ]
    return api.EmployeeHome(
        employee=employee_ref(session, emp),
        actions=actions,
        days=days,
        week_hours=round(sum(per_day.values()), 2),
    )


def _money(values: dict[str, float]) -> list[api.Money]:
    return [
        api.Money(amount=round(v, 2), currency=c)
        for c, v in sorted(values.items())
        if abs(v) > 0.004
    ]  # type: ignore[arg-type]


def outcomes(session: Session, sites: list[str]) -> api.Outcomes:
    s = get_settings()
    cutoff = s.payroll_cutoff.astimezone(UTC).replace(tzinfo=None)
    rows = session.execute(
        select(m.ExceptionRecord, m.Employee, m.Site)
        .join(m.Employee, m.Employee.id == m.ExceptionRecord.employee_id)
        .join(m.Site, m.Site.code == m.Employee.site_code)
        .where(m.Employee.site_code.in_(sites))
    ).all()
    counted = [
        (r, e, st) for r, e, st in rows if r.status != "superseded" or r.resolved_by_decision_id
    ]
    resolved = [r for r, _, _ in counted if r.status == "resolved"]
    open_ = [r for r, _, _ in counted if r.status in ACTIVE]
    decisions = session.scalars(select(m.Decision)).all()
    dec_by_id = {d.id: d for d in decisions}
    exc_ids = {r.id for r, _, _ in counted}
    my_decisions = [d for d in decisions if d.exception_id in exc_ids]
    durations: list[float] = []
    for d in my_decisions:
        run = session.get(m.PipelineRun, d.run_id)
        if run:
            durations.append(max(0.0, (d.decided_at - run.created_at).total_seconds()))
    cascade = [
        r
        for r in resolved
        if r.resolved_by_decision_id
        and dec_by_id.get(r.resolved_by_decision_id)
        and dec_by_id[r.resolved_by_decision_id].exception_id != r.id
    ]
    by_decision: dict[str, int] = defaultdict(int)
    for r in cascade:
        by_decision[str(r.resolved_by_decision_id)] += 1
    recovered_hours = 0.0
    recovered_value: dict[str, float] = defaultdict(float)
    ot_flagged: dict[str, float] = defaultdict(float)
    ot_avoided: dict[str, float] = defaultdict(float)
    for r, e, st in counted:
        dec = dec_by_id.get(r.resolved_by_decision_id or "")
        run = session.get(m.PipelineRun, dec.run_id) if dec else None
        if (
            r.rule_id in {"R-PUNCH-MISSING-OUT", "R-PUNCH-MISSING-IN"}
            and run
            and dec
            and dec.exception_id == r.id
        ):
            before = sum(
                run.pay_before.get(k, 0)
                for k in ("regular_hours", "overtime_hours", "double_time_hours")
            )
            after = sum(
                run.pay_after.get(k, 0)
                for k in ("regular_hours", "overtime_hours", "double_time_hours")
            )
            if after > before:
                recovered_hours += after - before
                recovered_value[st.currency] += (
                    run.pay_after["cost"]["amount"] - run.pay_before["cost"]["amount"]
                )
        if r.rule_id == "F-OT-RISK":
            over = float(r.evidence.get("projected_overtime_hours", 0.0))
            cost = over * e.hourly_rate * params_for(st.jurisdiction).ot_multiplier
            ot_flagged[st.currency] += cost
            if dec and any(o.get("op") == "reassign_shift" for o in dec.operations):
                ot_avoided[st.currency] += cost
    premiums = sum(
        a.hours for a in session.scalars(select(m.PayAdjustment)) if a.kind.endswith("_premium")
    )
    runs = session.scalars(select(m.PipelineRun)).all()
    runs = [r for r in runs if r.exception_id in exc_ids]
    real = [r for r in runs if r.fault is None]
    model_runs = [r for r in real if r.provider in {"groq", "ollama"}]
    gate_fail: dict[str, int] = defaultdict(int)
    for r in runs:
        for v in r.validations[: r.attempts]:
            for g in v["gates"]:
                if g["status"] == "fail":
                    gate_fail[g["id"]] += 1
    lat = sorted(r.latency_ms for r in model_runs)
    flagged_notes = len({r.exception_id for r in real if r.prompts.get("note_flags")})
    harness = {
        "runs": len(real),
        "model_runs": len(model_runs),
        "fault_replays": len(runs) - len(real),
        "by_route": {
            k: sum(1 for r in real if r.route == k)
            for k in ("suggest", "fallback", "escalate", "manual")
        },
        "first_pass_verified": sum(
            1 for r in model_runs if r.attempts == 1 and r.route in {"suggest", "escalate"}
        ),
        "repaired": sum(1 for r in model_runs if r.repaired),
        "failing_gates": dict(sorted(gate_fail.items())),
        "unsafe_reached_manager": sum(
            1
            for r in real
            if r.route in {"suggest", "manual"}
            and r.validations
            and not r.validations[-1]["passed"]
        ),
        "providers": {
            p: sum(1 for r in real if r.provider == p) for p in {r.provider for r in real}
        },
        "latency_p50_ms": statistics.median(lat) if lat else None,
        "latency_p95_ms": lat[min(len(lat) - 1, int(0.95 * len(lat)))] if lat else None,
        "injection_flagged": flagged_notes,
    }
    total = len(counted)
    before_cutoff = sum(1 for r in resolved if r.resolved_at is None or r.resolved_at <= cutoff)
    return api.Outcomes(
        source_label="Measured in this environment from synthetic data",
        total=total,
        resolved=len(resolved),
        open=len(open_),
        resolved_before_cutoff_pct=round(100 * before_cutoff / total, 1) if total else 0.0,
        median_time_to_decision_s=round(statistics.median(durations), 1) if durations else None,
        decisions=len(my_decisions),
        cleared_by_cascade=len(cascade),
        largest_cascade=max(by_decision.values(), default=0),
        paid_hours_recovered=round(recovered_hours, 2),
        paid_value_recovered=_money(recovered_value),
        overtime_cost_flagged=_money(ot_flagged),
        overtime_cost_avoided=_money(ot_avoided),
        premium_hours_recorded=round(premiums, 2),
        harness=harness,
    )


def latest_evaluation() -> dict[str, object] | None:
    path = Path(ROOT_DIR) / "eval" / "reports" / "latest.json"
    if not path.exists():
        return None
    data: dict[str, object] = json.loads(path.read_text(encoding="utf-8"))
    return data
