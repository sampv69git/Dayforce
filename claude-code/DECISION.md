# Decision Log

Format per decision: context, alternatives, evidence, trade-offs, decision, revisit when. Status: **Accepted** unless noted. Dates are IST.

---

## D-001 Product name: Countersign (2026-11-06)
- **Context:** needs a professional name that tells the story.
- **Alternatives:** Shiftproof, Punchline, Attest, Timewise.
- **Evidence:** a countersignature is a second signature confirming a document drafted by someone else, which mirrors the product: the model drafts, a manager countersigns. Proposed by the team owner.
- **Trade-offs:** generic English word; no trademark search done (prototype only).
- **Decision:** Countersign. Tagline: "The model drafts. The rules verify. A manager countersigns."
- **Revisit when:** the product is taken beyond the challenge.

## D-002 Scope: four differentiators in scope (2026-11-06)
- **Context:** a same-use-case competitor already implements the baseline pipeline (RESEARCH.md section 4.1).
- **Alternatives:** baseline only with more polish; one or two differentiators.
- **Evidence:** competitor code inspection; incumbent gaps (RESEARCH.md section 3.2).
- **Trade-offs:** about 12 h of extra build inside 25 h; mitigated by a pure engine shared by all features.
- **Decision:** root-cause cascades; evidence-anchored corrections with pay impact and harness-computed confidence; overtime forecast with swaps; employee attestation plus keyboard triage and guarded bulk approval.
- **Revisit when:** behind schedule by more than 2 h at end of step 6. Cut order: bulk approve, then employee screen polish, then forecast candidates UI (keep forecast detection).

## D-003 Backend: Python 3.12 + FastAPI (2026-11-06)
- **Alternatives:** Node/TypeScript (Fastify or NestJS), .NET.
- **Evidence:** brief recommends FastAPI; Python has the best embedding and eval tooling (fastembed, rank-bm25); FastAPI generates OpenAPI from Pydantic models; Pydantic v2 validates LLM output directly.
- **Trade-offs:** two languages in the repo; mitigated by generated TS types from OpenAPI.
- **Decision:** Python 3.12, FastAPI 0.16x, Pydantic 2.14, SQLAlchemy 2.1, Alembic 1.20, uv for dependency management.
- **Revisit when:** never within the challenge.

## D-004 Data: PostgreSQL 16 + pgvector, SQLite fallback (2026-11-06)
- **Alternatives:** SQLite only; Postgres only; a dedicated vector DB (Qdrant, Chroma).
- **Evidence:** owner chose "both" run paths; Docker is not installed on the owner's laptop yet; corpus is about 45 clauses, so a dedicated vector DB adds no value.
- **Trade-offs:** two vector search paths (pgvector and NumPy) behind one interface; covered by the same retrieval tests.
- **Decision:** Postgres 16 with pgvector in Docker Compose (primary); SQLite with JSON-stored vectors for no-Docker development and unit tests.
- **Revisit when:** corpus grows past about 10,000 chunks.

## D-005 Orchestration: plain Python pipeline (2026-11-06)
- **Alternatives:** LangGraph, LangChain, Semantic Kernel.
- **Evidence:** the pipeline is a fixed sequence with one bounded retry; the brief says to use frameworks "only where it adds clear value"; plain code keeps every gate explicit and testable.
- **Trade-offs:** we write our own span recording (small).
- **Decision:** `harness/pipeline.py` as explicit, typed steps.
- **Revisit when:** multi-turn agent behaviour or human-in-the-loop checkpoints across sessions are needed.

## D-006 LLM: gpt-oss-20b on Groq (primary), qwen3:4b on Ollama (local), rule-based (degraded) (2026-11-06)
- **Context:** laptop has no GPU (Intel UHD, 16 GB RAM); CPU inference of 7 to 8B models is slow for a live demo.
- **Alternatives:** local CPU only; teammate GPU; free cloud GPU with tunnel; OpenRouter.
- **Evidence:** gpt-oss-20b is Apache 2.0 with a usage policy requiring compliance with law; Groq supports strict `json_schema` constrained decoding for it (verified in Groq docs, 2026-11-06); Qwen3-4B is Apache 2.0 and Ollama supports schema-constrained `format`. Owner approved the hybrid.
- **Trade-offs:** a hosted provider sees case context (synthetic, codes only); rate limits (Developer plan 30 RPM, 1K RPD, 8K TPM, 200K TPD) require pacing in eval.
- **Decision:** provider abstraction with Groq gpt-oss-20b default, Ollama qwen3:4b local, rule-based degraded mode, scripted provider for tests. Both real models are evaluated and reported.
- **Revisit when:** a GPU host is available (serve gpt-oss-20b with vLLM), or Groq limits block evaluation.

## D-007 Structured output: strict JSON schema plus layered validation (2026-11-06)
- **Alternatives:** free text plus regex; JSON mode without schema; tool calling.
- **Evidence:** Groq strict mode guarantees schema conformance on supported models; Groq does not support tool use together with structured outputs; constrained decoding does not guarantee truth.
- **Decision:** strict schema (all required, nullable unions, no unsupported keywords) plus gates G1 to G10.
- **Revisit when:** provider adds richer schema support.

## D-008 Retrieval: metadata filters + hybrid BM25 and dense with RRF, required clause seeded (2026-11-06)
- **Alternatives:** rule-to-clause lookup only (competitor approach); dense only; LLM reranker.
- **Evidence:** lookup-only makes citation accuracy trivial and cannot surface addenda, overrides, or note-related clauses; hybrid retrieval is robust on small corpora with specific terms ("meal", "Deepavali").
- **Trade-offs:** more moving parts; mitigated by a retrieval eval with gold labels and a playground.
- **Decision:** as stated; embeddings bge-small-en-v1.5 (MIT) via fastembed (Apache 2.0).
- **Revisit when:** recall@5 below 0.9 on the gold set.

## D-009 Confidence: harness-computed evidence strength (2026-11-06)
- **Alternatives:** model self-reported confidence; log-probabilities.
- **Evidence:** studies report verbalised LLM confidence is often overconfident (RESEARCH.md 5.4); Groq structured outputs do not expose log-probabilities for this use.
- **Decision:** deterministic evidence strength score with factor breakdown; model estimate shown but not used for routing.
- **Revisit when:** we have labelled outcomes to calibrate weights.

## D-010 Corrections are append-only revisions (2026-11-06)
- **Alternatives:** edit punches in place.
- **Evidence:** incumbents audit every correction (UKG audits tab); in-place edits destroy evidence.
- **Decision:** add punches with `source=correction`, void via revision links, keep originals.
- **Revisit when:** never.

## D-011 Audit: hash-chained events with verification endpoint (2026-11-06)
- **Alternatives:** plain audit table; external ledger.
- **Decision:** SHA-256 chain over canonical JSON, verify endpoint and UI.
- **Trade-offs:** detects tampering, does not prevent a database owner from rewriting the whole chain; documented in SECURITY.md.
- **Revisit when:** production (anchor chain head externally).

## D-012 Authentication: demo persona sign-in with signed JWT (2026-11-06)
- **Alternatives:** Supabase/Auth0; no auth.
- **Evidence:** RBAC must be real and testable; SSO adds setup risk with no scoring value.
- **Decision:** `/auth/demo-login` issues HS256 JWT (8 h) for seeded users; all routes enforce role and site scope. Labelled "Demo sign-in".
- **Revisit when:** any real deployment.

## D-013 Frontend stack (2026-11-06)
- **Alternatives:** Next.js; plain CSS; MUI or Ant Design.
- **Evidence:** SPA is sufficient (no SEO, no SSR need); Tailwind v4 plus shadcn/ui (Radix, accessible primitives, MIT) gives full control over a distinctive design system; TanStack Query for server state; Motion for state-change animation; Recharts for charts.
- **Decision:** React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, TanStack Query 5, React Router, Recharts 3, Motion, cmdk, sonner, lucide, Geist fonts, openapi-typescript and openapi-fetch, Zod.
- **Note:** npm reports TypeScript 7.0 as latest (native compiler). We will pin the TypeScript major that the Vite and typescript-eslint templates support at scaffold time and record it in HANDOFF.
- **Revisit when:** a template incompatibility blocks the build.

## D-014 OpenAPI: code-first with committed snapshot and drift check (2026-11-06)
- **Alternatives:** design-first YAML with code generation.
- **Evidence:** FastAPI produces accurate OpenAPI from Pydantic contracts; a committed `openapi.yaml` gives reviewers the contract; CI fails if the generated spec differs.
- **Decision:** `openapi.yaml` is regenerated by `make openapi` and checked in CI; the draft committed before implementation is the design target.
- **Revisit when:** external consumers need versioned contracts.

## D-015 Observability: own span store with OpenTelemetry-compatible fields (2026-11-06)
- **Alternatives:** full OpenTelemetry SDK with collector; Langfuse.
- **Evidence:** judges need traces inside the product (Harness Inspector); a collector adds containers and setup risk.
- **Decision:** spans stored in `trace_spans`; structlog JSON logs with trace IDs; OTLP exporter is a stretch item.
- **Revisit when:** running beyond a single node.

## D-016 Simulated clock (2026-11-06)
- **Decision:** `DEMO_NOW=2026-11-06T11:00:00-08:00` (Fri, Fremont time); payroll cutoff Mon 9 Nov 12:00 PT. Labelled in the UI.
- **Why:** reproducible demo and tests; makes forecasting meaningful (week in progress).

## D-017 Visual direction: provenance-coded, light primary with dark theme (2026-11-06)
- **Alternatives:** light only; dark control room.
- **Evidence:** owner chose light plus dark; light themes record more legibly on video.
- **Decision:** tokens in PROTOTYPE.md section 2; violet reserved for model output; cobalt for human actions.

## D-018 Cloud deployment: not included (2026-11-06, pending owner decision)
- **Options if wanted later:** Render or Railway (API and Postgres) plus Vercel or Netlify (web); about 1 h.
- **Decision:** local Docker Compose only unless the owner approves a cloud option.

## D-019 MCP server: stretch (2026-11-06)
- **Decision:** read-only MCP server only if ahead of schedule. Not on the critical path; the JD values MCP but the product does not need it to work.
