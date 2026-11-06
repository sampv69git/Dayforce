# Countersign

**The model drafts. The rules verify. A manager countersigns.**

Countersign is a timecard exception resolution agent built for the Dayforce AI Innovation Challenge (Use Case 5: Time & Attendance). It detects missed punches, overtime risks, schedule conflicts, and policy breaches, then proposes compliant, evidence-backed corrections that a manager approves, edits, or rejects. An open-weight LLM writes the drafts; a deterministic harness verifies every one; nothing changes a timecard without a human countersignature.

> Status: specification complete, implementation in progress. See `claude-code/HANDOFF.md` for live progress.
>
> Demo video: *link will be added here after recording.*

All data is synthetic. The policy pack is fictional and not legal advice.

---

## The problem

Before every payroll cutoff, managers clear timecard exceptions by hand. They see a flat list without priority, explanation, or pay impact. One root problem, such as two missed punches, produces several downstream exceptions. Missing punch times get guessed. Overtime is found after it is worked. Errors become underpayments, wage claims, and audit findings. See `RESEARCH.md`.

## User journey

1. **Maya (manager)** opens a queue ranked by risk with the payroll cutoff counting down.
2. The top item is a **root cause**: two missed punches that created a 32.5-hour "shift" and four related exceptions.
3. Countersign shows the evidence (badge and scanner events), a **model draft** with cited policy quotes, ten **harness gates** all green, the **pay impact**, and the four exceptions the fix also clears.
4. Maya **countersigns**. Five exceptions resolve in one decision, recorded in a hash-chained audit log.
5. A missed meal gets the meal premium, not a break edit. An injection attempt in an employee note is flagged and ignored.
6. On the **forecast**, a projected overtime shift is reassigned to a colleague with headroom, checked against every rule.
7. **Diego (employee)** confirms a missed punch on his phone. **Arjun (payroll)** resolves an escalation with conflicting evidence.
8. Anyone can open the **harness inspector** to see every step, and replay a fault to watch the harness fall back visibly.

## Architecture

```
React + Vite web  ->  FastAPI  ->  Rules engine (pure Python)
                                ->  Retrieval: metadata filters + BM25 + bge-small embeddings (pgvector)
                                ->  LLM provider: gpt-oss-20b (Groq, strict JSON schema) | qwen3:4b (Ollama) | rule-based
                                ->  Harness: 10 gates, repair, visible fallback, escalation
                                ->  PostgreSQL 16 (+ SQLite fallback), hash-chained audit, trace spans
```

Details: `ARCHITECTURE.md`, `HARNESS.md`.

## Key technical decisions

| Decision | Why |
|---|---|
| Deterministic rules detect; the LLM only drafts | Detection must be exact and auditable; the model explains and proposes within a code-built action envelope |
| gpt-oss-20b (Apache 2.0) on Groq with strict JSON schema; qwen3:4b locally | Open weights, constrained decoding, fast enough for a live workflow; local path works offline |
| Ten validation gates including quote grounding, evidence anchoring, and re-simulation | Constrained decoding guarantees format, not truth |
| Harness-computed evidence strength instead of model confidence | Verbalised LLM confidence is often overconfident |
| Hybrid retrieval with metadata filters over separate clause IDs | Citations must be earned, not looked up by rule ID |
| Append-only corrections and hash-chained audit | Evidence is never destroyed; every change is attributable |
| Plain Python pipeline, no agent framework | A fixed, bounded plan is easier to test and explain |

Full log: `claude-code/DECISION.md`.

## Setup

Instructions will be finalised with the implementation. Planned:

```bash
cp .env.example .env          # add GROQ_API_KEY, set JWT_SECRET
docker compose up --build     # db, api, web; open http://localhost:8080
# optional local model
docker compose --profile local-llm up -d ollama && docker compose exec ollama ollama pull qwen3:4b
```

No-Docker path: `make dev` (SQLite, API on :8000, web on :5173).

## Documentation map

| File | Contents |
|---|---|
| `FEATURES.md` | Every feature and what it does |
| `CHALLENGE_BRIEF.md` | The brief, verbatim |
| `RESEARCH.md` | Domain, regulation, products, competitors, technical research |
| `PROJECT.md` | Full specification and requirements traceability |
| `ARCHITECTURE.md` | Components, data model, sequences |
| `HARNESS.md` | Contracts, rules, gates, guardrails, fallbacks, oversight, audit |
| `MODEL_CARD.md` | Models, licences, intended use, limitations |
| `EVALUATION.md` | Method and results |
| `DATA_SOURCES.md`, `PRIVACY.md`, `SECURITY.md`, `THIRD_PARTY.md` | Data, privacy, security, licences |
| `TESTING.md`, `TEST_PLAN.md`, `QUALITY_GATES.md` | Test strategy, cases, thresholds |
| `DEMO_SCRIPT.md`, `PRESENTATION.md` | Demo plan and slide content |
| `claude-code/` | Build instructions, UI prototype spec, 10-step plan, decisions, handoff |
