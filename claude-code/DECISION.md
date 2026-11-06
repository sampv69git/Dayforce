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
- **Update (step 1):** the Vite template ships TypeScript 7.0 and oxlint. `openapi-typescript` 7.13 requires TypeScript 5.x (peer dependency), so we pinned **TypeScript 5.9.3** and kept **oxlint** as the linter (fast, zero config, catches React hook misuse). The `geist` npm package targets Next.js and does not export CSS, so fonts come from **@fontsource-variable/geist** and **@fontsource-variable/geist-mono** (same Geist fonts, SIL OFL 1.1).
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

## D-018 Cloud deployment: only if time allows (2026-11-06)
- **Options:** Render (API and Postgres) plus Vercel (web), free tiers; about 1 h.
- **Decision:** owner approved a cloud deployment **only if ahead of schedule** at the end of step 9. Local Docker Compose remains the primary run path.

## D-019 MCP server: built, read-only (2026-11-06)
- **Decision:** built once ahead of schedule. Five read-only tools annotated `readOnlyHint`; no tool can approve, edit, or write, so agents can investigate and simulate but people still countersign. Uses `MCPServer` from the `mcp` 2.x SDK (FastMCP was renamed in v2).

## D-020 Demo video hosting and length (2026-11-06)
- **Decision:** YouTube, unlisted, linked from README.
- **Length:** the owner indicated 5 minutes would be acceptable; the brief specifies a "10-minute demonstration". We keep the 10-minute script as the primary plan (the demo is 15% of the score) and also prepare a 5-minute cut. The owner makes the final call at recording time.

## D-021 Task runner (2026-11-06)
- **Context:** `make` is not available on the owner's Windows machine.
- **Decision:** keep a `Makefile` for CI, Linux, macOS, and WSL, and document the equivalent direct `uv` and `npm` commands in README for Windows.

## D-022 Human edits may reveal worked overtime (2026-11-06)
- **Context:** an API journey test showed G8 blocking a payroll admin's evidence-based edit (scanner time 17:20) because it revealed daily overtime that was really worked.
- **Alternatives:** keep G8 strict for everyone; drop G8 for edits.
- **Trade-offs:** strict G8 would push managers to under-record time, contradicting TA-4.3; no G8 would allow edits that create punch or schedule problems.
- **Decision:** in edit mode, G8 accepts newly revealed overtime and meal exceptions (they enter the queue to be approved and paid); new punch-integrity or schedule exceptions still fail. Model drafts stay strict.
- **Revisit when:** policy owners define a different treatment for manager edits.

## D-023 Evaluation design (2026-11-06)
- **Decision:** a hand-labelled synthetic set (128 cases, seed 777) loaded into a dedicated database and run through the real detection service and pipeline; deterministic providers in CI with gates; the real model on a stratified subset paced to the Groq token budget; the failing first run kept as evidence.
- **Trade-off:** labels and rules share authors, stated in EVALUATION.md.

## D-024 Commit identity (2026-11-06)
- **Context:** the owner asked that further commits be authored and pushed by teammate Dhravya285.
- **Decision:** repository-local Git identity `Dhravya285 <dhravyashetty285@gmail.com>`; pushes and pull requests use her token, kept outside the repository and never written to Git configuration. Earlier commits keep their original author.
- **Constraint found:** the token lacks the `workflow` scope, so changes to `.github/workflows/` need a token with that scope.

## D-025 pgvector query through SQL operator (2026-11-06)
- **Context:** the pgvector comparator was not reachable through the `Embedding` type decorator, which would have broken dense ranking on PostgreSQL.
- **Decision:** rank with an explicit `embedding <=> CAST(:q AS vector)` query; verified end to end on an embedded PostgreSQL with pgvector.

## D-026 Tertiary text colour (2026-11-06)
- **Context:** axe found tertiary text at 4.34 to 4.49:1 on tinted surfaces.
- **Decision:** `--ink-3` changed from #6B707C to #5F6470 (about 5.2:1 on tinted surfaces); gate labels no longer use reduced opacity.

## D-027 Visual redesign and a custom guided tour (2026-11-06)
- **Context:** the owner rated the first interface 4 out of 10 and asked for a landing page with a guided tour and a stronger visual identity on every page.
- **Alternatives:** a tour library (react-joyride, driver.js); a UI kit; keeping the restrained style.
- **Trade-offs:** tour libraries add weight and styling we would override, and some lag behind React 19. A small engine on Motion, which we already ship, gives a spotlight cutout, keyboard control, and theme tokens in about 250 lines with unit tests.
- **Decision:** a brand layer (gradients, glass, aurora, light-beam borders, tickers, gauges) on the existing tokens, a full landing page, and a custom tour. All motion honours reduced-motion settings; tours never auto-start under browser automation; an axe sweep of every page in both themes gates the change.
- **Revisit when:** a design system from Dayforce is available.

## D-028 Commit identity changed to mythilisn (2026-11-06)
- **Context:** the owner asked that further commits be authored and pushed by teammate mythilisn.
- **Decision:** repository-local Git identity `mythilisn <mythilisn15@gmail.com>`; pushes and pull requests use her token, kept outside the repository and never written to Git configuration. Earlier commits keep their original authors.

## D-029 End-to-end tests with reduced motion (2026-11-06)
- **Context:** scroll reveals and staged animations leave text partly transparent for a moment, which axe measures as low contrast.
- **Decision:** Playwright runs with `reducedMotion: 'reduce'`; every animated component renders its final state in that mode, which is also the accessible behaviour for users who ask for it.

## D-030 Schedule conflicts look ahead (2026-11-06)
- **Context:** a review against the brief found "schedule conflicts" covered only after the fact (late, early, unscheduled, rest already short). The most literal reading is a conflict in the published schedule.
- **Alternatives:** relabel existing rules; a new scheduling module; a forward-looking rule that reuses the swap engine.
- **Decision:** F-SCHED-CONFLICT flags a future shift that overlaps another or breaks minimum rest and proposes reassigning it through the same eight checks and G8 peer re-simulation as the overtime forecast, otherwise escalates. No new operation, gate, or page was needed.
- **Trade-off:** the labelled evaluation set covers completed timecards only, so the rule is verified by unit, pipeline, fault, and end-to-end tests instead; stated in EVALUATION.md.

## D-031 Make the brief visible without adding pages (2026-11-06)
- **Decision:** queue lenses use the brief's own words, a cutoff briefing summarises the queue with numbers computed by code (never model text), and the landing page maps each phrase of Use Case 5 to rules, corrections, and screens. We chose these over new features to avoid a demo that looks like a feature list.

## D-032 Email and password sign-in alongside persona sign-in (2026-11-07)
- **Context:** the owner asked for a real login and authentication without breaking the working demo.
- **Alternatives:** an external identity provider (Auth0, Keycloak) now; a password library such as argon2-cffi or bcrypt; replacing persona sign-in.
- **Trade-offs:** an identity provider adds a service and network dependency to a one-command demo. scrypt is in the Python standard library and is a memory-hard KDF accepted by OWASP, so no new dependency. Replacing persona sign-in would break the guided demo and the end-to-end tests.
- **Decision:** credentials in a separate `user_credentials` table (the persona model is unchanged), scrypt hashes, generic failures with equal timing, per-account lockout, JWTs with a required `jti` checked against a revocation table, and password changes that end earlier sessions. Persona sign-in stays on by default behind `DEMO_LOGIN_ENABLED`. Session-ending endpoints are excluded from the contract fuzzer (it would revoke its own token) and covered by integration tests.
- **Revisit when:** deploying for real users: OIDC or SAML with MFA, edge rate limiting, HTTP-only cookie sessions.

