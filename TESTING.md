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
| Frontend unit | Vitest + Testing Library | GateStrip, DecisionBar, PayDelta, ShiftRibbon layout maths, formatters, Zod schemas | Yes |
| End to end | Playwright + axe | J1, J3, J4, J5 in a browser against the API with the rule-based provider; accessibility violations | Yes |

## Commands

```
make test            # backend unit + integration
make test-contract   # drift check + schemathesis
make eval-ci         # deterministic evaluation with thresholds
make eval-groq       # real model evaluation (needs GROQ_API_KEY)
make web-test        # vitest
make e2e             # playwright
make check           # everything CI runs
```

## Conventions

- Tests live next to their layer: `backend/tests/unit/<module>/`, `backend/tests/integration/`, `backend/tests/contract/`, `frontend/src/**/*.test.tsx`, `frontend/e2e/`.
- Engine tests use builders (`make_punch`, `make_shift`) with explicit UTC times; no reliance on the seed.
- Integration tests use a fresh SQLite database per test module and the scripted provider.
- Real network calls are never made in CI except the optional real-model job.

See `TEST_PLAN.md` for the test case list mapped to requirements and `QUALITY_GATES.md` for thresholds.
