# Changelog

All notable changes to this project are documented here. Format follows Keep a Changelog; versions follow Semantic Versioning.

## [Unreleased]

### Added
- Playwright end-to-end journeys (J1 to J5 and the landing page) with WCAG 2 A/AA axe checks.
- README rewritten for the implemented product, with screenshots in `docs/screenshots/`.

### Changed
- `--ink-3` darkened to #5F6470 to meet WCAG AA on tinted surfaces.
- Dense retrieval on PostgreSQL uses an explicit pgvector `<=>` query (verified on an embedded PostgreSQL).

## [0.9.0] - 2026-11-06

### Added
- Specification set: brief capture, research, project specification with traceability, architecture, harness design, model card, privacy, security, licences, testing, quality gates, demo script, slide content, and the `claude-code/` build instructions.
- Backend: FastAPI service with RBAC, problem+json errors, structured logging, trace spans, and an OpenAPI contract with drift checks.
- Rules engine: punch pairing (overnight and DST safe), 17 rules across punch integrity, schedule, meals and rest, overtime, holidays, and forecast; pay calculation; constraints envelope; counterfactual cascade linker; overtime forecast with swap candidates; evidence strength.
- Fictional policy pack v2026.2 (49 clauses) and a deterministic synthetic dataset for three sites.
- Hybrid retrieval (metadata filters, BM25, bge-small embeddings, reciprocal rank fusion, required-clause seeding).
- Harness: strict output contract, providers for Groq, Ollama, rule-based templates, and scripted faults; gates G1 to G10; one repair attempt; visible fallback and escalation; hash-chained audit.
- Decisions: approve, edit (re-validated), reject; append-only revisions; guarded bulk approval; employee attestation.
- Web app: provenance-coded design system with light and dark themes, queue, exception detail with shift ribbon, overtime forecast, harness inspector with fault replay, outcomes, evaluation, policies, payroll readiness, audit chain, weekly timecard, mobile employee screen.
- Evaluation suite with 128 labelled cases, a 12-fault matrix, and CI quality gates.

### Fixed (found by the evaluation and contract tests)
- Acknowledgements could clear punch exceptions in simulation.
- Degraded mode could show a template that failed a gate as ready.
- G9 allowed voiding a punch other than the identified duplicate.
- 405 responses lacked the `Allow` header; error responses and UTC timestamps were not documented in the contract.
