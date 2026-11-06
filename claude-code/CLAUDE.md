# Countersign: Build Instructions

This is the working agreement for anyone (person or coding assistant) writing code in this repository. Read it before every work session, together with `STEPS.md` and `HANDOFF.md`.

## 1. Objective

Ship a working, demo-ready prototype of Countersign, a governed timecard exception resolution agent (Dayforce AI Innovation Challenge, Use Case 5), by **Sat 7 Nov 2026, 17:00 IST** (hard submission 19:00 IST). Scoring weights: product value 25, harness engineering 25, LLM implementation 20, engineering quality 15, demo 15.

Read first: `PROJECT.md` (what), `HARNESS.md` (harness contract), `ARCHITECTURE.md` (how), `claude-code/PROTOTYPE.md` (UI), `claude-code/DECISION.md` (why).

## 2. Non-negotiable constraints

1. Open-weight LLMs only (gpt-oss-20b via Groq, qwen3:4b via Ollama). No proprietary model calls anywhere in product code.
2. Synthetic data only. No real names of real people, no real employee data.
3. Never claim legal compliance. Policy pack is fictional ("inspired by").
4. Never present simulated or fabricated results as real. Evaluation numbers come only from real runs and are committed with date, commit, and model.
5. Nothing changes a timecard or schedule without an explicit human decision recorded in the audit chain.
6. No secrets in the repository. `.env` is git-ignored; `.env.example` holds placeholders.
7. Commit authorship uses the repository owner's global Git identity only. Never add AI tools as authors, co-authors, or contributors, and never add "generated with" lines to commits, pull requests, code, or docs.

## 3. Architectural rules

- Layering: `api -> harness -> (engine, retrieval, llm, audit) -> domain`. No upward imports.
- `engine/` is pure: plain dataclasses in, plain dataclasses out, no database, no clock (time is passed in), no randomness. This is what makes G8 re-simulation and the evaluation oracle trustworthy.
- Code computes, the model explains. Never ask the model to compute hours, pay, or thresholds.
- Code owns the action space: the constraints envelope is built by code; the model selects within it.
- Every LLM call goes through `harness.pipeline.run_draft`. No direct provider calls from routes.
- All times stored as UTC; site time zones (IANA) are used for display and day boundaries.
- Original punches are never mutated or deleted. Corrections append revisions; voids reference the revision.
- Every state change writes an audit event through `audit.writer.append` in the same transaction.
- The simulated clock comes from `config.demo_now`; do not call `datetime.now()` in domain or engine code.
- Contracts live in `backend/app/contracts/` and are the single source for API schemas and the LLM output schema.

## 4. Coding standards

**Python 3.12**
- Type hints everywhere; `mypy --strict` on `engine`, `harness`, `contracts`, `retrieval`.
- `ruff` (lint and format), line length 100.
- Pydantic v2 models with `model_config = ConfigDict(extra="forbid")` on inputs and LLM output.
- Small functions, explicit names, no clever metaprogramming. Docstrings on public functions (one line is fine).
- Errors: raise domain exceptions; API maps them to RFC 9457 problem+json.

**TypeScript**
- `strict: true`; no `any` (use `unknown` and narrow). ESLint plus Prettier.
- API types generated from `openapi.yaml` (`npm run gen:api`); never hand-write response types.
- Zod schemas validate API responses at the boundary for critical views (draft, decision, trace).
- Components: function components, colocated styles via Tailwind classes and tokens; no inline hex colours.
- Data fetching only through TanStack Query hooks in `src/api/hooks.ts`.

**General**
- No dead code, commented-out code, or TODOs presented as finished. Unfinished work is listed in `HANDOFF.md`.
- No duplicated logic between backend and frontend: the frontend displays what the API computes.
- Copy and docs: plain professional English, no emojis, no em dashes, no marketing language.

## 5. Harness rules

- Gates G1 to G10 exactly as defined in `HARNESS.md`; adding or changing a gate requires updating `HARNESS.md`, tests, and the eval.
- One repair attempt maximum. Then fallback or escalate. Never loop.
- Fallback and escalation must be visible in the UI and recorded in the audit.
- The model's self-reported confidence is never used for routing.
- Untrusted text (employee notes, attestation notes, comments) is always wrapped in `<untrusted_employee_text>`, length-capped (500 chars), scanned, and never concatenated into the system prompt.
- Prompt changes bump the version (`draft.v1` to `draft.v2`) and require an eval run.

## 6. UI/UX priorities

1. The harness is visible: provenance colours, gate strip, route badges, inspector.
2. Evidence before opinion: timeline and evidence above the draft.
3. Fast triage: keyboard first, mouse friendly, focus management after decisions.
4. Every screen has loading, empty, and error states.
5. WCAG 2.2 AA; reduced motion respected; nothing conveyed by colour alone.
6. Follow `PROTOTYPE.md` tokens; no ad hoc colours, shadows, or fonts.
7. Polish matters: alignment on the 4 px grid, tabular numbers, consistent date and time formats ("Tue 3 Nov, 15:34").

## 7. Testing requirements

- Engine: unit tests per rule (positive, negative, boundary), pairing (overnight, DST), pay, cascade, forecast.
- Harness: unit tests per gate with passing and failing fixtures; routing table tests; fault-injection tests.
- Retrieval: filter tests, ranking smoke tests, retrieval eval (recall@5) in CI.
- API: integration tests with a test database for each journey; RBAC tests (403 paths).
- Contract: OpenAPI drift check plus Schemathesis against the running app.
- Frontend: Vitest for components with logic (GateStrip, DecisionBar, PayDelta, formatters); Playwright for journeys J1, J3, J5 with axe checks.
- Evaluation: `make eval-ci` (scripted and rule-based providers, deterministic) must meet thresholds in `QUALITY_GATES.md`.

## 8. Security practices

- RBAC dependency on every route; deny by default.
- Validate all inputs with Pydantic; cap string lengths; reject unknown fields.
- Parameterised queries only (SQLAlchemy).
- Provider requests contain employee codes, not names.
- CORS restricted to the web origin; JWT demo tokens expire in 8 hours.
- Log no secrets and no full prompts at info level (prompts are stored in the pipeline run record, not logs).

## 9. Git workflow

- Branches: `main` (protected, always green), feature branches `feat/<area>`, `fix/<area>`, `docs/<area>`, `chore/<area>`.
- Conventional Commits: `feat(engine): detect two-punch spans`, `fix(harness): quote normalisation`, `docs: update evaluation results`, `test(api): rbac for drafts`, `chore(ci): cache uv`.
- Commit after each completed milestone once its checks pass. Keep commits focused.
- Open a pull request per step; CI must pass before merge. Squash merge allowed.
- Never force-push `main`. Never commit `.env`, databases, model weights, or `node_modules`.
- Author identity: the global Git configuration. No co-author trailers.

## 10. Definition of done (per step and per feature)

- [ ] Behaviour matches `PROJECT.md`, `HARNESS.md`, and `PROTOTYPE.md`
- [ ] Unit and integration tests added and passing; coverage of new engine and harness code at least 85%
- [ ] `openapi.yaml` regenerated, no drift; frontend types regenerated
- [ ] Lint, type check, build pass locally and in CI
- [ ] UI states (loading, empty, error) and keyboard access implemented
- [ ] Docs updated (including `CHANGELOG.md`, `claude-code/HANDOFF.md`, and `claude-code/DECISION.md` if a decision changed)
- [ ] Committed with a Conventional Commit message and merged through a pull request with green CI
