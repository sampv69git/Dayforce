# Presentation: Five Slides

Exactly the five topics required by the brief. Numbers marked [from eval] are filled only from committed evaluation reports.

## Slide 1. Problem and user value

- **Headline:** Payroll closes Monday. Exceptions do not resolve themselves.
- Managers clear missed punches, overtime, and break violations by hand, one at a time, with no evidence and no view of pay impact.
- One root problem (two missed punches) creates several downstream exceptions.
- Mistakes mean underpaid employees and wage-claim exposure (a Washington meal break and rounding class action: about USD 98.3 million in damages, as reported by Seyfarth).
- **Value:** Countersign turns exceptions into verified, evidence-backed suggestions that a manager countersigns in seconds, before the cutoff.
- Visual: queue screenshot with cutoff countdown.

## Slide 2. Product workflow and demo

- Rules detect -> cascade linker groups root causes -> retrieval finds policy -> open-weight model drafts -> harness verifies -> manager countersigns -> append-only revision and audit.
- Differentiators: root-cause cascades, evidence-anchored times, pay impact preview, overtime forecast with compliant swaps, employee attestation, guarded bulk approval.
- Visual: detail screen with shift ribbon, draft, gate strip, before/after.
- Demo link and QR code.

## Slide 3. Architecture and harness design

- Diagram: React web, FastAPI, Postgres plus pgvector, engine, retrieval, harness, providers (gpt-oss-20b on Groq, qwen3:4b on Ollama, rule-based).
- Harness: strict JSON schema; ten gates (schema, binding, citation exists, citation retrieved, quote grounding, action allowed, evidence anchoring, re-simulation, business guardrails, fact and injection check); one repair; visible fallback or escalation; harness-computed confidence; human decision; hash-chained audit.
- Principle line: "Code computes. The model explains. A person decides."

## Slide 4. Safety, testing, and evaluation evidence

- Evaluation dataset: 128 hand-labelled synthetic cases (separate seed) including overnight shifts, time zones, conflicting and schedule-only evidence, cascades, and 8 prompt-injection variants.
- Results (commit 748fd38): detection precision 1.000 and recall 1.000; required clause in top 5 BM25 0.974, dense 1.000, hybrid 1.000 (MRR 0.770); rule-based drafts correction accuracy 1.000 with 0 unsafe; gpt-oss-20b on 30 cases: 83.3% verified suggestions, 96.7% correction accuracy, 100% quote grounding, 0 unsafe drafts shown, p50 latency 1.7 s.
- Fault-injection matrix: 144 of 144 injected faults caught (12 kinds), 0 unsafe drafts reached a manager; 8 of 8 injection attempts resisted.
- Harness ablation: 23.3% of gpt-oss-20b first drafts (7 of 30) failed a gate and would have reached a manager without the harness; all were caught, repaired, or replaced by a visible fallback.
- The suite found real defects on its first run (degraded-mode routing, a G9 gap); both fixed with regression tests.
- Tests: unit, integration, contract (Schemathesis), evaluation, Vitest, Playwright with accessibility checks, all in CI.

## Slide 5. Future improvements and expected business impact

- **Next:** real HRIS, badge, and scheduling integrations behind the existing interfaces; self-hosted gpt-oss-20b on vLLM; calibrate evidence weights on labelled outcomes; jurisdiction packs maintained by compliance teams; manager feedback loop (rejection reasons) into prompt and rule tuning; MCP tools for other agents.
- **Expected impact (to be validated in a pilot, not claimed as measured):** less manager time per exception (we measured [from outcomes] median time to decision in our session); more exceptions cleared before cutoff; avoided overtime through forecasting; fewer underpayments and premium omissions; complete audit for every AI-assisted change.
- Close: "The model drafts. The rules verify. A manager countersigns."
