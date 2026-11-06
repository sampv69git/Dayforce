"""Counterfactual cascade linker: which exceptions disappear when a root cause is fixed?

For each punch-integrity finding, apply its deterministic candidate correction in a sandbox, re-run
detection, and record the other findings that clear. No rule pairs are hard-coded.
"""

from __future__ import annotations

from app.engine.candidates import build_candidate
from app.engine.catalog import RULES
from app.engine.constraints import build_envelope
from app.engine.detect import Detection, fingerprint
from app.engine.simulate import simulate


def link_cascades(det: Detection) -> dict[str, list[str]]:
    """Map root fingerprint to the fingerprints of its symptoms."""
    emp = det.week.employee.id
    links: dict[str, list[str]] = {}
    claimed: set[str] = set()
    roots = [f for f in det.findings if RULES[f.rule_id].root_capable]
    # Most severe roots first so a symptom is attributed to the strongest cause.
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    roots.sort(key=lambda f: order[RULES[f.rule_id].severity])
    for root in roots:
        env = build_envelope(det, root)
        cand = build_candidate(det, root, env)
        if cand.escalate:
            continue
        sim = simulate(det.week, cand.ops, root)
        if sim.status != "ok" or not sim.target_cleared:
            continue
        symptoms = [
            fingerprint(emp, f)
            for f in sim.cleared
            if not RULES[f.rule_id].root_capable and fingerprint(emp, f) not in claimed
        ]
        if symptoms:
            links[fingerprint(emp, root)] = symptoms
            claimed.update(symptoms)
    return links
