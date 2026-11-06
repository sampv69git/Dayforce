# Implementation Plan: 10 Steps

## Time budget

| | |
|---|---|
| Challenge window | Thu 5 Nov 19:00 IST to Sat 7 Nov 19:00 IST (48 h) |
| Used for research and specification | Fri 6 Nov 12:55 to 13:30 IST (owner prepared earlier) |
| Build window (this plan) | Fri 6 Nov 13:30 to Sat 7 Nov 17:00 IST = **27.5 h** (windows below include 2.5 h of slack, held before step 9) |
| Buffer to hard deadline | Sat 17:00 to 19:00 IST (submission only, no new features) |

Team model: one owner builds end to end with a coding assistant. "Parallel" notes show which work could be split if teammates help (for example, slides and recording rehearsal).

Priority rule when time is short: protect, in order, (1) the end-to-end J1 journey with a real model, (2) visible harness (gate strip, fallback, inspector), (3) evaluation numbers, (4) demo recording, (5) stretch features. Cut stretch items before cutting tests on the harness.

| # | Step | Budget | Window (IST) |
|---|---|---|---|
| 1 | Scaffold, tooling, CI skeleton, database | 1.5 h | Fri 13:30 to 15:00 |
| 2 | Policy pack and synthetic data | 2.0 h | Fri 15:00 to 17:00 |
| 3 | Rules engine, pay, cascade, forecast | 3.0 h | Fri 17:00 to 20:00 |
| 4 | Retrieval | 1.5 h | Fri 20:00 to 21:30 |
| 5 | LLM providers and harness | 3.0 h | Fri 21:30 to Sat 00:30 |
| 6 | API, RBAC, audit, OpenAPI contract | 2.0 h | Sat 00:30 to 02:30 |
| 7 | Frontend foundation, queue, detail | 4.0 h | Sat 02:30 to 06:30 |
| 8 | Frontend: forecast, inspector, payroll, employee, outcomes, policies, audit, evaluation | 3.5 h | Sat 06:30 to 10:00 |
| 9 | Evaluation runs, Docker Compose, end-to-end tests, hardening, docs sync | 2.5 h | Sat 10:00 to 15:00 (incl. slack) |
| 10 | Demo recording, slides, README, release | 2.0 h | Sat 15:00 to 17:00 |

---

## Step 1. Scaffold, tooling, CI skeleton, database (1.5 h)

**Objectives:** a runnable empty app on both run paths with CI green.

**Tasks**
- `backend/`: `pyproject.toml` (uv), FastAPI app factory, config (pydantic-settings), structlog, `/api/v1/health`, SQLAlchemy engine for Postgres or SQLite by URL, Alembic init, ORM models for all tables in ARCHITECTURE.md section 4, first migration.
- `frontend/`: Vite React TS, Tailwind v4, shadcn init, Geist fonts, tokens.css, router skeleton, TanStack Query provider.
- Root: `.gitignore`, `.env.example`, `Makefile` (dev, test, lint, eval-ci, openapi), `docker-compose.yml` draft, `.github/workflows/ci.yml` (backend lint, type, test; frontend lint, type, build).

**Dependencies:** none.
**Files:** `backend/app/{main,config}.py`, `backend/app/domain/models.py`, `backend/alembic/*`, `frontend/*`, `Makefile`, `.github/workflows/ci.yml`.
**Outputs:** `make dev` runs API on 8000 and web on 5173; health returns 200.
**Tests / acceptance:** health test passes; CI green on first PR; migration applies on SQLite and Postgres.
**Parallel:** frontend scaffold and backend scaffold are independent.

## Step 2. Policy pack and synthetic data (2.0 h)

**Objectives:** realistic, deterministic data that exercises every rule and edge case.

**Tasks**
- Write the policy pack: `backend/policy/handbook.md` (TA-*), `california.md` (CA-*), `bengaluru.md` (BLR-*), plus `clauses.yaml` metadata (jurisdictions, classes, effective dates, precedence, rule mapping). About 45 clauses in natural policy language.
- `seed/generator.py`: 3 sites, about 40 employees, 2 weeks (26 Oct to 8 Nov 2026), schedules, punches with realistic jitter, badge and scanner events, demo users. Plant the demo scenarios (Diego span, Diego Thursday missing OUT with injection note, Priya missed meal and overtime risk, Marcus swap candidate, Sam conflicting evidence, DST overnight shift, Austin floater working in Fremont, Bengaluru Deepavali holiday shift on Sun 8 Nov, duplicates, tardies).
- `seed/load.py`: idempotent load into the database; `make seed`.

**Dependencies:** step 1.
**Files:** `backend/policy/*`, `backend/app/seed/*`.
**Outputs:** seeded database; a scenario manifest `seed/scenarios.yaml` listing planted exceptions (used by tests and eval).
**Tests / acceptance:** generator determinism test (same seed, same hash); clause metadata schema test; every scenario in the manifest present after seed.
**Parallel:** policy writing and generator coding can be split.

## Step 3. Rules engine, pay, cascade, forecast (3.0 h)

**Objectives:** exact, explainable detection and the deterministic machinery the harness relies on.

**Tasks**
- `engine/pairing.py` (UTC pairing, overnight, DST), `engine/rules/*.py` (17 rules), `engine/detect.py` (runs rules, fingerprints), `engine/pay.py` (regular, OT, DT, premiums, cost), `engine/constraints.py` (envelope, plausible window, evidence items), `engine/candidates.py` (deterministic corrections and template text), `engine/simulate.py` (apply operations in memory), `engine/cascade.py` (counterfactual linker), `engine/forecast.py` (projection and swap candidates), `engine/confidence.py` (evidence strength).
- Detection service writes exceptions idempotently.

**Dependencies:** step 2.
**Files:** `backend/app/engine/*`, `backend/tests/unit/engine/*`.
**Outputs:** `make detect` produces the planted exceptions and cascades.
**Tests / acceptance:** per-rule unit tests (positive, negative, boundary); DST and overnight tests; cascade test (Diego span clears 4); forecast test (Priya risk, Marcus top candidate); engine coverage at least 90%; detection matches scenario manifest 100%.
**Parallel:** pay and forecast can be split from rules.

## Step 4. Retrieval (1.5 h)

**Objectives:** grounded, measurable policy retrieval.

**Tasks**
- `retrieval/corpus.py` (load clauses), `retrieval/embed.py` (fastembed bge-small, cached vectors in DB), `retrieval/bm25.py`, `retrieval/hybrid.py` (filters, RRF, required clause seeding, override flags), pgvector query on Postgres, NumPy on SQLite.
- Gold labels for retrieval in `eval/dataset/retrieval_gold.yaml`.

**Dependencies:** step 2 (clauses), step 3 (rule mapping).
**Files:** `backend/app/retrieval/*`, `backend/tests/unit/retrieval/*`.
**Outputs:** `retrieve(case)` returns top 5 with per-method ranks.
**Tests / acceptance:** filter tests (jurisdiction, date, class); required clause always present; override clause present for CA meal cases; recall@5 at least 0.9 on gold set (hybrid).
**Parallel:** independent of step 3 except the rule map.

## Step 5. LLM providers and harness (3.0 h)

**Objectives:** the governed drafting pipeline.

**Tasks**
- `llm/providers/{groq,ollama,rule_based,scripted}.py`; `llm/prompts/draft.v1.md` and examples; schema export from `contracts/draft.py` compatible with Groq strict mode.
- `harness/sanitize.py` (injection scanner), `harness/gates.py` (G1 to G10), `harness/pipeline.py` (context, retrieve, sanitise, generate, validate, repair, route), `observability/spans.py`, persistence of pipeline runs.
- Live smoke test against Groq (key in `.env`) and Ollama if available.

**Dependencies:** steps 3 and 4.
**Files:** `backend/app/llm/*`, `backend/app/harness/*`, `backend/app/observability/*`, tests.
**Outputs:** `run_draft(exception_id)` returns a persisted run with route and gates.
**Tests / acceptance:** each gate has pass and fail tests; fault-injection matrix (HARNESS.md section 10) passes 100% with zero unsafe drafts; repair path test; degraded mode test; one real Groq draft for each demo scenario passes all gates (record in HANDOFF).
**Parallel:** gates and providers can be split.

## Step 6. API, RBAC, audit, OpenAPI contract (2.0 h)

**Objectives:** a typed, secured, documented API that the UI consumes.

**Tasks**
- Routes per `openapi.yaml`: auth (demo login), me, pay period, exceptions, drafts, decisions (single and bulk), timecards, forecast, simulate, policies and search, traces, audit and verify, outcomes, evaluation report, attestations, admin (detect, reset, provider, replay with fault).
- RBAC dependencies; problem+json errors; request IDs.
- `audit/writer.py` and `audit/verify.py`; decision apply with revisions and re-detection.
- Export `openapi.yaml`; CI drift check; Schemathesis contract test.

**Dependencies:** step 5.
**Files:** `backend/app/api/*`, `backend/app/audit/*`, `openapi.yaml`, `backend/tests/{integration,contract}/*`.
**Outputs:** full API on `/api/v1`, docs at `/docs`.
**Tests / acceptance:** integration tests for J1 to J5 via HTTP; RBAC 403 tests; audit verify passes and detects tampering; Schemathesis passes; no drift.
**Parallel:** audit module can be split from routes.

## Step 7. Frontend foundation, queue, detail (4.0 h)

**Objectives:** the screens judges see first, at production polish.

**Tasks**
- Generated API types, client, Zod schemas, query hooks.
- App shell (rail, top bar, clock, cutoff, provider pill, synthetic badge, theme toggle, persona menu), command palette, keyboard layer.
- Persona chooser; Queue (grouped by root, filters, risk sort, keyboard, bulk select); Detail (ShiftRibbon with before/after, EvidenceList, PayDelta, DraftCard, CitationChip, GateStrip with animation, EvidenceStrength, CascadeList, DecisionBar with edit and reject flows, CountersignStamp).
- Loading, empty, error states.

**Dependencies:** step 6 (can start against `openapi.yaml` and mocked responses at step 5).
**Files:** `frontend/src/**`.
**Outputs:** J1 fully usable in the browser.
**Tests / acceptance:** Vitest for GateStrip, DecisionBar, PayDelta, formatters; manual J1 run with real model; Lighthouse accessibility at least 95 on queue and detail.
**Parallel:** ShiftRibbon component can be built in isolation.

## Step 8. Remaining screens (3.5 h)

**Objectives:** complete product breadth.

**Tasks**
- Forecast (week grid, risk panel, candidates, approve swap); Harness inspector (waterfall, span tabs, replay with fault); Payroll readiness and escalations; Employee `/me` (mobile); Outcomes dashboard; Policies and retrieval playground; Audit with verify; Evaluation report; Weekly timecard.
- Dark theme pass.

**Dependencies:** step 7.
**Files:** `frontend/src/pages/*`, components.
**Outputs:** every route in PROTOTYPE.md works with real data.
**Tests / acceptance:** Playwright J1, J3, J4, J5 with axe; responsive check at 1440, 1024, 390.
**Parallel:** pages are independent of each other.

## Step 9. Evaluation, Docker, end-to-end, hardening (2.5 h)

**Objectives:** real evidence and a one-command run.

**Tasks**
- `eval/generate.py` (labelled dataset about 150 cases including edge and injection cases), `eval/run.py` (providers: scripted, rule_based, groq, ollama), `eval/metrics.py`, reports to `eval/reports/` (JSON and Markdown).
- Run: CI-mode eval; full Groq eval; Ollama eval on a subset (CPU); harness ablation; retrieval comparison. Write `EVALUATION.md` with real numbers.
- Docker Compose final (db, api, web, ollama profile), health checks, `.env.example`; fresh-clone test.
- Bug fixes, performance pass, docs sync (README, ARCHITECTURE, HARNESS, MODEL_CARD).

**Dependencies:** steps 6 to 8.
**Outputs:** committed eval reports; CI eval gate; working compose.
**Tests / acceptance:** QUALITY_GATES.md thresholds met; `docker compose up` on a clean checkout works; Playwright suite green.
**Parallel:** eval runs (long, network bound) run while fixing bugs.

## Step 10. Demo recording, slides, README, release (2.0 h)

**Objectives:** submission-ready repository and assets.

**Tasks**
- Reset demo data; rehearse `DEMO_SCRIPT.md` twice; record 10-minute video (screen plus voice); upload (YouTube unlisted or Google Drive); link in README.
- Build the five-slide deck from `PRESENTATION.md`; export PDF into `docs/presentation/`.
- Final README pass; `CHANGELOG.md` v1.0.0; `RELEASE_CHECKLIST.md` completed; tag `v1.0.0`.

**Dependencies:** step 9.
**Outputs:** video link, deck, tagged release.
**Acceptance:** every item in RELEASE_CHECKLIST.md checked.
**Parallel:** slides can be built by a teammate while the owner records.

---

## Stretch (only if ahead of schedule, in this order)

1. Read-only MCP server exposing `detect_exceptions`, `search_policy`, `simulate_correction` (about 1 h).
2. OTLP exporter for spans.
3. "Manual mode" timing study (same tasks with AI drafts hidden) to compare time to decision; results labelled as a small internal measurement.
