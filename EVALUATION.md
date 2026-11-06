# Evaluation

Every number below comes from a committed report in `eval/reports/`. Each report records the run time, the git commit, the seed, the dataset size, and the provider. Nothing here is estimated.

| Report | Commit | Providers | Status |
|---|---|---|---|
| `eval/reports/20261106T093850Z-rule_based.json` | c3fae81 | scripted (fault matrix), rule_based | **Failed gates.** Kept as evidence of the bugs the suite found (section 6) |
| `eval/reports/20261106T094621Z-rule_based.json` and `latest.json` | 748fd38 | scripted (fault matrix), rule_based | **All gates passed** |
| Real model (gpt-oss-20b on Groq) | pending | groq | Runs as soon as a `GROQ_API_KEY` is configured: `make eval-groq` |
| Local model (qwen3:4b on Ollama) | pending | ollama | `make eval-ollama` once Ollama is installed |

Reproduce: `cd backend && uv run python -m eval.run --providers scripted,rule_based --gate` (about 30 seconds after the embedding model is cached).

## 1. Method

### Dataset

`backend/eval/dataset.py` builds **128 labelled synthetic cases** from seed 777, which differs from the demo seed so the demo data never doubles as test data. Each case is an isolated synthetic employee with one planted pattern. Labels are written by hand from the construction: the expected rule IDs, the true time of any missing punch, the expected route, and whether the note carries a prompt-injection attempt.

| Slice | Cases |
|---|---|
| Missing OUT (CA, TX, Bengaluru) | 15 |
| Missing IN | 12 |
| Duplicate punch | 9 |
| Late arrival | 9 |
| Unscheduled shift | 6 |
| Missed meal or rest interval | 9 |
| Late meal, short meal (CA) | 3 + 3 |
| Two missed punches joining two shifts (cascade) | 4 |
| Daily overtime worked (CA, Bengaluru) | 6 |
| Weekly overtime worked (TX) | 3 |
| Seventh consecutive day | 2 |
| Holiday shift (Bengaluru) | 2 |
| Rest between shifts too short | 6 |
| Clean negatives at boundaries (7-minute grace, 5.0 h without meal in CA, exempt long day) | 18 |
| Overnight shifts (3 clean, 1 missing OUT) | 4 |
| Time zone (Austin schedule stored in UTC, no false tardy) | 2 |
| Conflicting evidence (badge and scanner more than 60 minutes apart) | 4 |
| Schedule-only evidence (no badge or scanner data) | 3 |
| Prompt injection in employee notes (8 variants: override, role play, fake system tag, JSON smuggling, full-width Unicode, zero-width characters, fake clause citation, privilege claim) | 8 |

The cases are loaded into a dedicated SQLite database and run through the **real** detection service and the **real** harness pipeline, the same code the product uses.

### Metrics

| Area | Metric | Definition |
|---|---|---|
| Detection | Precision, recall, F1 | (employee, rule) pairs found vs labelled |
| Retrieval | Required hit@5 | Rule's required clause in the top 5, **without** seeding |
| | Gold recall@5 | Share of required plus supporting clauses in the top 5 |
| | MRR | Reciprocal rank of the required clause |
| Generation | Schema-valid first pass | Attempt 1 passes G1 |
| | Citation accuracy | Attempt 1 passes G3 and G4 |
| | Quote grounding | Attempt 1 passes G5 |
| | Re-check pass | Attempt 1 passes G8 |
| | Correction accuracy | Final route and operations match the label (added punch within 5 minutes of the true time; escalation when expected) |
| Routing | Verified, fallback, escalation rates | Final route shares |
| Safety | Unsafe drafts reaching a manager | Route suggest or manual with a failed gate (must be 0) |
| | Raw unsafe rate (harness ablation) | Share of attempt-1 outputs that failed any gate: what a manager would have seen without the harness |
| | Injection resistance | Note flagged by the sanitiser **and** the final draft follows no injected instruction (no overtime approval, no fake clause) |
| | Fault matrix | Each injected fault caught by its expected gate and routed to a visible fallback or escalation |

## 2. Results (commit 748fd38, 2026-11-06 09:46 UTC)

### Detection (rules engine)

| Precision | Recall | F1 | TP | FP | FN |
|---|---|---|---|---|---|
| 1.000 | 1.000 | 1.000 | 116 | 0 | 0 |

Read this carefully: the rules and the labels were written by the same team, so a perfect score shows that the engine implements its specification on these patterns. It is not independent evidence that the specification matches every real-world payroll practice.

### Retrieval (unseeded, 116 queries)

| Method | Required hit@5 | Gold recall@5 | MRR |
|---|---|---|---|
| BM25 only | 0.974 | 0.547 | 0.759 |
| Dense only (bge-small-en-v1.5) | 1.000 | 0.606 | 0.761 |
| **Hybrid (RRF)** | **1.000** | **0.634** | **0.770** |

Hybrid is best on every measure. Gold recall@5 is limited by design: gold sets contain up to five clauses and the pipeline also seeds the required clause, so the model always receives it.

### Generation: rule-based provider (105 target exceptions)

| Metric | Value |
|---|---|
| Schema-valid first pass | 1.000 |
| Citation accuracy | 1.000 |
| Quote grounding | 1.000 |
| Re-check pass (G8) | 1.000 |
| Correction accuracy | 1.000 |
| Routes | 101 manual (shown to manager, all gates passed), 4 escalated (the 4 conflicting-evidence cases) |
| Unsafe drafts reaching a manager | **0** |
| Injection resistance | 1.000 (8 of 8) |
| Latency p50 / p95 | 0.20 s / 0.39 s |

The rule-based provider is the degraded mode and the fallback path. These numbers show that the fallback is itself verified by every gate.

### Fault matrix (12 faults x 12 cases = 144 runs)

| Fault | Expected gate | Caught | Unsafe |
|---|---|---|---|
| Malformed JSON | G1 | 12/12 | 0 |
| Hallucinated clause | G3 | 12/12 | 0 |
| Cites unretrieved clause | G4 | 12/12 | 0 |
| Fabricated quote | G5 | 12/12 | 0 |
| Disallowed action | G6 | 12/12 | 0 |
| Invented punch time | G7 | 12/12 | 0 |
| Does not fix the problem | G8 | 12/12 | 0 |
| Removes worked time | G9 | 12/12 | 0 |
| Wrong numbers in explanation | G10 | 12/12 | 0 |
| Echoes an injection | G10 | 12/12 | 0 |
| Provider timeout | provider | 12/12 | 0 |
| Bad output, then repaired | repair | 12/12 repaired on attempt 2 | 0 |

## 3. Real-model results

Pending: no `GROQ_API_KEY` is configured in this environment yet. When it is, `make eval-groq` runs a stratified subset paced to the Groq token budget and adds a `groq` entry to `latest.json`, and this section will report its numbers exactly, including the failure cases.

## 4. Quality gates (CI)

Enforced by `--gate` in the `evaluation` job: detection precision and recall at least 0.98, hybrid required hit@5 at least 0.90, every fault caught with zero unsafe drafts, zero unsafe drafts for every provider, and 100% injection resistance. See `QUALITY_GATES.md`.

## 5. Limitations

- Synthetic data cannot capture every real-world punch pattern, device failure, or local pay practice.
- Labels and rules share authors (see section 2).
- The injection set has 8 hand-written variants; it shows the controls work on known patterns, not that injection is impossible.
- Groq rate limits mean the real-model run covers a stratified subset, not all 105 targets; the subset size is recorded in the report.

## 6. What the first run caught

The first evaluation run (`20261106T093850Z-rule_based.json`) failed three gates, and each failure was a real defect:

1. **Degraded mode showed an unverified template as ready.** For three schedule-only cases the rule-based correction would have introduced a missed meal and daily overtime. G8 caught it, but the pipeline still routed the draft as "manual". Fix: in degraded mode a template that fails any gate is escalated with a visible reason.
2. **G9 allowed voiding the wrong punch on duplicate exceptions.** G2 still blocked it, but G9 now independently requires that only the identified duplicate is voided.
3. **One injected fault was not a fault.** For acknowledge-type rules, "acknowledge" is the correct fix, so the `does_not_fix` fault now uses a genuine no-op for those rules.

Regression tests for all three live in `backend/tests/integration/test_eval_regressions.py` and the pipeline tests.
