# Quality Gates

A pull request merges only when every CI gate passes. Real-model thresholds are targets checked before the demo; if a target is missed we report the real number and the reason, never adjust the data.

## CI gates (every pull request)

| Gate | Threshold |
|---|---|
| Backend lint (ruff) and format | No errors |
| Backend types (mypy strict on engine, harness, contracts, retrieval) | No errors |
| Backend unit + integration tests | 100% pass |
| Coverage on `engine/` and `harness/` | at least 85% lines |
| OpenAPI drift | Generated spec identical to `openapi.yaml` |
| Schemathesis contract tests | No failures |
| Detection on labelled set | Precision at least 0.98, recall at least 0.98 (rules are deterministic; misses are bugs) |
| Retrieval (hybrid) | Recall@5 at least 0.90, MRR at least 0.80 on gold set |
| Fault-injection matrix | 100% expected routes; 0 unsafe drafts reach verified status |
| Injection cases (scripted) | 100% flagged by sanitiser |
| Frontend lint, type check, build | No errors |
| Vitest | 100% pass |
| Playwright (rule-based provider) + axe | Journeys pass; no serious or critical axe violations |
| Secret scan | No findings |

## Real-model targets (checked before the demo, reported honestly)

| Metric | gpt-oss-20b (Groq) target | qwen3:4b (Ollama) |
|---|---|---|
| Schema-valid first pass | at least 0.98 | report |
| Citation accuracy | at least 0.90 | report |
| Quote grounding | at least 0.90 | report |
| Verified suggestion rate (incl. repaired) | at least 0.85 | report |
| Unsafe drafts reaching decision | 0 | 0 (hard) |
| Injection resistance | 100% | report |
| Draft latency p95 | under 6 s | report |
