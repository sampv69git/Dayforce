# Testing

## Strategy

| Layer | Tool | What it proves | Runs in CI |
|---|---|---|---|
| Unit: engine | pytest | Each rule, pairing (overnight, DST), pay, cascade, forecast, evidence strength | Yes |
| Unit: harness | pytest | Each gate pass and fail; routing table; sanitiser | Yes |
| Unit: retrieval | pytest | Filters, fusion, required clause seeding, override flags | Yes |
| Integration | pytest + httpx TestClient + SQLite | Journeys J1 to J5 through the API; decision apply and re-detection; audit chain | Yes |
| RBAC | pytest | Every role and route combination that must return 403 | Yes |
| API contract | OpenAPI drift check + Schemathesis | Committed `openapi.yaml` equals generated spec; responses conform to schema under generated inputs | Yes |
| Evaluation (deterministic) | `eval/run.py --provider scripted,rule_based` | Detection P/R, retrieval recall@5 and MRR, fault-injection matrix, routing | Yes, with thresholds |
| Evaluation (real model) | `eval/run.py --provider groq` / `ollama` | Generation quality, latency, ablation | Manual (needs key); report committed |
| Frontend unit | Vitest + Testing Library | GateStrip, DecisionBar, PayDelta, ShiftRibbon layout maths, formatters, Zod schemas, guided tour navigation and auto-start guard | Yes |
| End to end | Playwright + axe | J1 to J5, the landing page, and the guided tour in a browser against the API with the rule-based provider, with reduced motion; accessibility violations | Yes |

## Current status (2026-11-06)

| Suite | Result |
|---|---|
| Backend pytest (unit, integration, contract) | 134 passed, plus 32 Schemathesis subtests |
| Coverage of `app/engine` and `app/harness` | 95% |
| Evaluation with `--gate` | All gates passed (see `EVALUATION.md`) |
| Vitest | 13 passed |
| Backend pytest | 165 passed, 36 Schemathesis subtests, coverage 95.7% (engine and harness) |
| Playwright journeys with axe | 9 passed (J1 to J7, landing page, guided tour) |
| Manual axe sweep | Every page in light and dark themes: no serious or critical violations |

## Commands

```
cd backend && uv run pytest -q                                   # all backend tests incl. contract
cd backend && uv run python -m eval.run --providers scripted,rule_based --gate
cd backend && uv run python -m eval.run --providers groq --limit 40
cd frontend && npm test                                          # Vitest
cd frontend && npx playwright test                               # e2e on ports 8100/5180 with its own database
```

## Conventions

- Tests live next to their layer: `backend/tests/unit/<module>/`, `backend/tests/integration/`, `backend/tests/contract/`, `frontend/src/test/`, `frontend/e2e/`.
- Engine tests use the fluent `W` builder (`tests/unit/engine/builders.py`) with site-local times converted to UTC; no reliance on the seed.
- Integration tests share one SQLite database per session, reseeded per module, with the rule-based and scripted providers.
- Real network calls are never made in CI except the optional real-model job.

See `TEST_PLAN.md` for the test case list mapped to requirements and `QUALITY_GATES.md` for thresholds.
